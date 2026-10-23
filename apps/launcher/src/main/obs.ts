import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { RawExtract, PlayerProfile, RecordedResult, ThemeId } from "@flashfront/core";
import type { StreamSnapshot } from "@flashfront/ui";
import type { Settings } from "../shared";
import type { StatsApi } from "./api";

export interface ObsFrame { theme?: ThemeId; snapshot: StreamSnapshot | null; me?: RawExtract["me"]; profile?: PlayerProfile; result?: RecordedResult; session?: { wins: number; losses: number }; }
type ObsSettings = Pick<Settings, "obsDelaySec" | "obsHideOwnNumbers">;
/** Only the widget fields survive into the queue; no spawn coordinates or own-number backdoors. */
export function streamFrame(frame: ObsFrame, hideOwnNumbers: boolean): ObsFrame {
  const s = frame.snapshot;
  const snapshot = s ? { gameId: s.gameId, map: s.map, mode: s.mode, phase: s.phase, elapsedSec: s.elapsedSec, observer: s.observer,
    self: s.self && { id: s.self.id, tilesOwnedPct: s.self.tilesOwnedPct, rank: s.self.rank, troops: s.self.troops, gold: s.self.gold },
    players: s.players.map(p => ({ id: p.id, name: p.name, clanTag: p.clanTag, flag: p.flag, color: p.color, isAlive: p.isAlive, tilesOwnedPct: p.tilesOwnedPct })) } : null;
  const me = frame.me && { name: frame.me.name, displayName: frame.me.displayName, clanTag: frame.me.clanTag };
  const copy = structuredClone({ ...frame, snapshot, me }) as ObsFrame;
  if (copy.snapshot) {
    const self = copy.snapshot.self;
    if (self) copy.snapshot.self = { id: self.id, tilesOwnedPct: self.tilesOwnedPct, rank: self.rank, troops: hideOwnNumbers ? null : self.troops, gold: hideOwnNumbers ? null : self.gold };
  }
  if (hideOwnNumbers && copy.me) copy.me = { name: copy.me.name, displayName: copy.me.displayName, clanTag: copy.me.clanTag };
  return copy;
}
export class ObsBuffer {
  current: ObsFrame = { snapshot: null };
  private queue: { at: number; frame: ObsFrame }[] = [];
  private head = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settings: ObsSettings = { obsDelaySec: 0, obsHideOwnNumbers: false };
  constructor(private readonly send: (frame: ObsFrame) => void) {}
  publish(frame: ObsFrame, settings = this.settings): void {
    const changed = settings.obsDelaySec !== this.settings.obsDelaySec || settings.obsHideOwnNumbers !== this.settings.obsHideOwnNumbers;
    this.settings = { ...settings };
    if (changed) { this.close(); if (this.current.snapshot || this.current.me || this.current.result) this.emit({ snapshot: null, theme: frame.theme }); }
    if (frame.snapshot?.mode === "Ranked" || frame.snapshot?.observer === "replay") {
      this.close(); this.emit({ snapshot: null, theme: frame.theme }); return;
    }
    const clean = streamFrame(frame, settings.obsHideOwnNumbers);
    if (!settings.obsDelaySec) { this.emit(clean); return; }
    const at = Date.now() + settings.obsDelaySec * 1000;
    const last = this.queue.at(-1);
    if (last?.at === at) last.frame = clean; else this.queue.push({ at, frame: clean });
    this.schedule();
  }
  private emit(frame: ObsFrame): void { this.current = frame; this.send(frame); }
  private schedule(): void {
    if (this.timer || this.head >= this.queue.length) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      let ready: ObsFrame | undefined;
      while (this.queue[this.head] && this.queue[this.head]!.at <= Date.now()) ready = this.queue[this.head++]!.frame;
      if (this.head > 128) { this.queue = this.queue.slice(this.head); this.head = 0; }
      if (ready) this.emit(ready);
      this.schedule();
    }, Math.max(0, this.queue[this.head]!.at - Date.now()));
  }
  close(): void { clearTimeout(this.timer); this.timer = undefined; this.queue = []; this.head = 0; }
}
export async function startObs(options: { rendererDir: string; devUrl?: string; port?: number; api?: StatsApi }) {
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => { void serve().catch(() => { if (!res.headersSent) res.writeHead(500); res.end("OBS asset unavailable"); });
    async function serve() {
      if (req.method !== "GET") { res.writeHead(405).end(); return; }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        const response = options.api ? await options.api.get(url.pathname + url.search) : { status: 503, body: { error: "Stats unavailable" } };
        res.writeHead(response.status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        res.end(JSON.stringify(response.body)); return;
      }
      const path = url.pathname === "/obs" ? "/obs.html" : decodeURIComponent(url.pathname);
      if (options.devUrl) {
        // Dev assets stay same-origin to the OBS browser; no game URL is ever proxied.
        const upstream = new URL(options.devUrl);
        upstream.pathname = path; upstream.search = url.search;
        const response = await fetch(upstream, { redirect: "error", signal: AbortSignal.timeout(2000) });
        res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "no-store" });
        res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      const root = resolve(options.rendererDir);
      const file = resolve(root, "." + path);
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { const content = await readFile(file); headers(res, mime[extname(file)] ?? "application/octet-stream"); res.end(content); }
      catch { res.writeHead(404).end(); }
    }
  });
  const sockets = new WebSocketServer({ noServer: true });
  const buffer = new ObsBuffer(frame => {
    if (!sockets.clients.size) return;
    const data = JSON.stringify(frame);
    for (const ws of sockets.clients) if (ws.readyState === WebSocket.OPEN) { if (ws.bufferedAmount > 1_000_000) ws.terminate(); else ws.send(data); }
  });
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    const port = (server.address() as { port: number }).port;
    if (req.url !== "/ws" || (origin && origin !== `http://127.0.0.1:${port}`)) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, ws => sockets.emit("connection", ws));
  });
  // No pre-roll without a viewer. A new subscription starts the complete configured delay.
  let latest: { frame: ObsFrame; settings?: ObsSettings } | undefined;
  sockets.on("connection", ws => {
    ws.on("error", () => ws.close());
    ws.on("close", () => { if (!sockets.clients.size) { buffer.close(); buffer.current = { snapshot: null }; } });
    if (sockets.clients.size === 1 && latest) { buffer.publish(latest.frame, latest.settings); if (!latest.settings?.obsDelaySec) return; }
    ws.send(JSON.stringify(buffer.current));
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 47474, "127.0.0.1", () => { server.removeListener("error", reject); resolveListen(); });
  });
  return {
    server,
    publish(frame: ObsFrame, settings?: ObsSettings) { latest = { frame, settings }; if (sockets.clients.size) buffer.publish(frame, settings); },
    async close() { buffer.close(); for (const ws of sockets.clients) ws.terminate(); sockets.close(); await new Promise<void>(r => server.close(() => r())); },
  };
}
function headers(res: ServerResponse, type: string) {
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
}
