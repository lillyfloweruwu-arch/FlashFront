import type { BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { RECORD_COMMITS } from "@flashfront/training-engine/protocol";
import { validateDrillClient, type DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import type { EngineResult } from "@flashfront/training-engine/contracts";
import type { TrainingLoad, TrainingOutcome, TrainingRequest } from "../shared";
import { loadTrainingMap, type TrainingDeps } from "./training";
import type { DrillStore } from "./drills";

export const BOOT_TIMEOUT_MS = 15_000;
export interface TrainingWindowDeps {
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindow;
  bounds(): { x: number; y: number; width: number; height: number };
  preload: string; rendererDir: string; drillsDir: string; dev?: boolean;
  training: TrainingDeps;
  loadMap?: typeof loadTrainingMap;
  /** Supplied by the main-process record snapshot task; never trusts renderer-supplied snapshots. */
  retry?: (request: Extract<TrainingRequest, { kind: "retry" }>, signal: AbortSignal) => Promise<EngineResult<{ data: DrillClientData; snapshot: Uint8Array }>>;
  preferences(): { lite: boolean; reducedMotion: boolean };
  drills: Pick<DrillStore, "complete" | "recordVisit">;
  ended(request: TrainingRequest, outcome: TrainingOutcome): void;
  log(cause: string): void;
  cancelPending?(): void;
}

export function trainingNetworkAllowed(value: string, dev: boolean): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "fftraining:" && url.host === "app" && !url.username && !url.password)
      || (dev && url.origin === "http://127.0.0.1:5174") || ["data:", "blob:"].includes(url.protocol);
  } catch { return false; }
}

function parseRequest(input: TrainingRequest): TrainingRequest {
  if (input?.kind === "prepared" && typeof input.drillId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(input.drillId)) return { kind: "prepared", drillId: input.drillId };
  if (input?.kind === "retry" && typeof input.file === "string" && /^[^/\\:]+\.json$/.test(input.file)
    && Number.isSafeInteger(input.tick) && input.tick >= 0 && ["allyDecision", "postsBeforePush", "sendSize"].includes(input.mistake)) return { kind: "retry", file: input.file, tick: input.tick, mistake: input.mistake };
  throw new Error("Invalid Training request");
}
function parseOutcome(input: TrainingOutcome): TrainingOutcome {
  if (input?.kind === "passed" && ["Great", "Good"].includes(input.verdict)) return { kind: "passed", verdict: input.verdict };
  if (input?.kind === "failed" || input?.kind === "left") return { kind: input.kind };
  if (input?.kind === "error" && ["inMatch", "missingRecord", "unsupportedVersion", "missingMap", "invalidRecord", "desync", "cancelled", "historyLimit", "bootFailed"].includes(input.reason)) return { kind: "error", reason: input.reason };
  throw new Error("Invalid Training outcome");
}
const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ttf": "font/woff2" };

export class TrainingWindow {
  private win?: BrowserWindow;
  private request?: TrainingRequest;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private loading?: Promise<TrainingLoad>;
  private loaded = false;
  private loadController?: AbortController;
  private finishing: Promise<void> = Promise.resolve();
  private mapFiles = new Map<string, string>();
  constructor(private readonly deps: TrainingWindowDeps) {}
  isOpen(): boolean { return !!this.win && !this.win.isDestroyed(); }
  authorized(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    const win = this.win;
    return !!win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  }
  async open(input: TrainingRequest): Promise<void> {
    const request = parseRequest(input);
    if (this.deps.training.inMatch()) { this.close({ kind: "left" }); this.deps.ended(request, { kind: "error", reason: "inMatch" }); return; }
    // Complete the replaced attempt without destroying the reusable window.
    this.finish({ kind: "left" });
    const generation = ++this.generation;
    this.request = request; this.loading = undefined; this.loaded = false; this.mapFiles.clear();
    this.loadController = new AbortController();
    if (!this.isOpen()) {
      const win = this.deps.createWindow({ ...this.deps.bounds(), frame: false, fullscreen: true, backgroundColor: "#0A0A0B",
        webPreferences: { preload: this.deps.preload, partition: "persist:training", contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
      this.win = win;
      win.webContents.on("will-navigate", event => event.preventDefault());
      win.webContents.on("will-redirect", event => event.preventDefault());
      win.webContents.on("will-attach-webview", event => event.preventDefault());
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("render-process-gone", (_event, details) => { if (this.win === win) this.bootFailed(`render-process-gone: ${details.reason}`); });
      win.on("closed", () => { if (this.win === win) this.close({ kind: "left" }); });
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.bootFailed("ready timeout"), BOOT_TIMEOUT_MS);
    const win = this.win!;
    win.focus();
    try { await win.loadURL(this.deps.dev ? "http://127.0.0.1:5174/training.html" : "fftraining://app/"); }
    catch { if (generation === this.generation) this.bootFailed("page load failed"); }
  }
  private bootFailed(cause: string): void { this.deps.log(`Training: ${cause}`); this.close({ kind: "error", reason: "bootFailed" }); }
  matchChanged(): void { if (this.deps.training.inMatch()) this.close({ kind: "left" }); }
  ready(): void { if (this.loaded) { clearTimeout(this.timer); this.timer = undefined; } }
  load(): Promise<TrainingLoad> {
    if (!this.request || !this.isOpen()) return Promise.resolve({ status: "unavailable", reason: "cancelled" });
    return this.loading ??= this.prepare(this.request, this.generation, this.loadController!.signal);
  }
  private async prepare(request: TrainingRequest, generation: number, signal: AbortSignal): Promise<TrainingLoad> {
    const stale = () => signal.aborted || generation !== this.generation || !this.isOpen();
    try {
      if (this.deps.training.inMatch()) return { status: "unavailable", reason: "inMatch" };
      let data: DrillClientData, snapshot: Uint8Array;
      if (request.kind === "prepared") {
        let raw: unknown;
        try { raw = JSON.parse(await readFile(join(this.deps.drillsDir, `${request.drillId}.json`), "utf8")); }
        catch { return { status: "unavailable", reason: "missingRecord" }; }
        data = validateDrillClient(raw);
        if (data.drillId !== request.drillId) return { status: "unavailable", reason: "invalidRecord" };
        if (!RECORD_COMMITS.includes(data.engineCommit) || data.snapshotFormat !== "1") return { status: "unavailable", reason: "unsupportedVersion" };
        snapshot = new Uint8Array(await readFile(join(this.deps.drillsDir, `${request.drillId}.snapshot.bin`)));
      } else {
        const result = await this.deps.retry?.(request, signal);
        if (stale()) return { status: "unavailable", reason: "cancelled" };
        if (!result) return { status: "unavailable", reason: "missingRecord" };
        if (result.status === "unavailable") return result;
        data = validateDrillClient(result.value.data); snapshot = result.value.snapshot;
      }
      if (stale()) return { status: "unavailable", reason: "cancelled" };
      if (!RECORD_COMMITS.includes(data.engineCommit) || data.snapshotFormat !== "1") return { status: "unavailable", reason: "unsupportedVersion" };
      if (!snapshot.length) return { status: "unavailable", reason: "invalidRecord" };
      const config = (data.gameStartInfo as { config?: { gameMap?: unknown; gameMapSize?: unknown } }).config;
      if (typeof config?.gameMap !== "string" || typeof config.gameMapSize !== "string") return { status: "unavailable", reason: "invalidRecord" };
      const map = await (this.deps.loadMap ?? loadTrainingMap)(this.deps.training, config.gameMap, config.gameMapSize);
      if (stale()) return { status: "unavailable", reason: "cancelled" };
      if (map.status === "unavailable") return map;
      const manifest = await this.deps.training.manifest();
      if (stale()) return { status: "unavailable", reason: "cancelled" };
      if (this.deps.training.inMatch()) { this.matchChanged(); return { status: "unavailable", reason: "inMatch" }; }
      const entry = manifest.maps.find(m => m.id === config.gameMap);
      if (!entry || !/^[a-z0-9_-]+$/.test(entry.key) || !/^[a-zA-Z0-9_-]+$/.test(manifest.upstream.commit)) return { status: "unavailable", reason: "missingMap" };
      const files = config.gameMapSize === "Normal" ? ["manifest.json", "map.bin", "map4x.bin"] : ["manifest.json", "map4x.bin", "map16x.bin"];
      for (const file of files) this.mapFiles.set(`maps/${entry.key}/${file}`, join(this.deps.training.cacheDir, manifest.upstream.commit, entry.key, file));
      this.loaded = true;
      return { status: "ready", data, snapshot, ...this.deps.preferences(), names: request.kind === "prepared" ? "generated" : "record" };
    } catch { return { status: "unavailable", reason: stale() ? "cancelled" : "invalidRecord" }; }
  }
  close(input: TrainingOutcome): void {
    const outcome = parseOutcome(input);
    const win = this.win; this.win = undefined; ++this.generation;
    clearTimeout(this.timer); this.timer = undefined; this.loading = undefined; this.loaded = false; this.mapFiles.clear();
    if (win && !win.isDestroyed()) win.destroy();
    this.finish(outcome);
  }
  private finish(outcome: TrainingOutcome): void {
    this.loadController?.abort(); this.loadController = undefined;
    this.deps.cancelPending?.();
    const request = this.request; this.request = undefined;
    if (!request) return;
    // Retry sessions do not have a catalog drill id; their result still goes to the launcher.
    // Serialize finished attempts and publish only after saving: the hub reads progress
    // immediately on ended, and recordVisit alone does not include the completion write.
    this.finishing = this.finishing.then(async () => {
      if (request.kind === "prepared") {
        try {
          await this.deps.drills.recordVisit(request.drillId);
          if (outcome.kind === "passed") await this.deps.drills.complete(request.drillId);
        } catch { this.deps.log("Training: progress could not be saved"); }
      }
      this.deps.ended(request, outcome);
    }).catch(() => this.deps.log("Training: outcome could not be delivered"));
  }
  async serve(value: string, allowedMaps: ReadonlyMap<string, string> = this.mapFiles): Promise<Response> {
    const missing = () => new Response(null, { status: 404 });
    try {
      // Inspect before URL normalization removes literal/encoded dot segments.
      const raw = decodeURIComponent(value.split(/[?#]/)[0]!);
      if (raw.includes("\\") || raw.includes("\0") || raw.split("/").some(p => p === "." || p === "..")) return missing();
      const url = new URL(value);
      if (url.protocol !== "fftraining:" || url.host !== "app" || url.username || url.password) return missing();
      const path = decodeURIComponent(url.pathname).slice(1) || "training.html";
      if (path.includes(":") || path.includes("\\") || path.split("/").some(p => p === "." || p === "..")) return missing();
      const map = path.startsWith("maps/");
      const candidate = map ? allowedMaps.get(path) : resolve(this.deps.rendererDir, path);
      if (!candidate) return missing();
      const root = await realpath(map ? this.deps.training.cacheDir : this.deps.rendererDir);
      const file = await realpath(candidate);
      const rel = relative(root, file);
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) return missing();
      const bytes = new Uint8Array(await readFile(file));
      return new Response(bytes, { headers: { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "Access-Control-Allow-Origin": this.deps.dev ? "http://127.0.0.1:5174" : "fftraining://app", "X-Content-Type-Options": "nosniff" } });
    } catch { return missing(); }
  }
}

export function wireTrainingIpc(ipc: Pick<IpcMain, "handle" | "on">, training: TrainingWindow, launcher: () => BrowserWindow): void {
  const authorized = (event: IpcMainEvent | IpcMainInvokeEvent) => { if (!training.authorized(event)) throw new Error("Training-only action"); };
  ipc.handle("training-start", (event, request: TrainingRequest) => {
    const win = launcher();
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error("Launcher-only action");
    return training.open(request);
  });
  ipc.handle("training-load", event => { authorized(event); return training.load(); });
  // One-way IPC must ignore invalid messages rather than throw into Electron's event loop.
  ipc.on("training-ready", event => { if (training.authorized(event)) training.ready(); });
  ipc.on("training-report", (event, outcome: TrainingOutcome) => {
    if (!training.authorized(event)) return;
    let parsed: TrainingOutcome;
    try { parsed = parseOutcome(outcome); } catch { return; }
    training.close(parsed);
  });
  ipc.on("training-close", event => { if (training.authorized(event)) training.close({ kind: "left" }); });
}
