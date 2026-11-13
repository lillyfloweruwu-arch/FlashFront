import { afterEach, expect, it, vi } from "vitest";
import { MockDataSource } from "@flashfront/core";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ObsBuffer, startObs, streamFrame } from "./obs";
import { StatsApi } from "./api";
let obs: Awaited<ReturnType<typeof startObs>> | undefined;
let directory: string | undefined;
it("does not traverse spawn data while cloning a stream frame", () => {
  const snapshot = new MockDataSource().getSnapshot();
  snapshot.spawnHeat = { get others(): never { throw Error("Spawn data reached clone"); } };
  expect(streamFrame({ snapshot }, false).snapshot).not.toHaveProperty("spawnHeat");
});
// 0.2.2 sweep: every player's troops and gold reached the OBS browser source though widgets show land only.
it("stream frames carry no other player's troops or gold", () => {
  const snapshot = new MockDataSource().getSnapshot();
  snapshot.players = snapshot.players.map(p => ({ ...p, troops: 5000, gold: 90000 }));
  const frame = streamFrame({ snapshot }, false);
  expect(frame.snapshot!.players.length).toBe(snapshot.players.length);
  for (const p of frame.snapshot!.players) {
    expect(p).not.toHaveProperty("troops"); expect(p).not.toHaveProperty("gold");
    expect(typeof p.tilesOwnedPct).toBe("number"); expect(typeof p.name).toBe("string");
  }
  expect(frame.snapshot!.self?.troops).toBe(snapshot.self!.troops);
  expect(streamFrame({ snapshot }, true).snapshot!.self?.troops).toBeNull();
});
it("skips cloning without subscribers and starts the full delay when they arrive", async () => {
  obs = await startObs({ rendererDir: ".", port: 0 });
  const snapshot = new MockDataSource().getSnapshot();
  const clone = vi.spyOn(globalThis, "structuredClone");
  try {
    obs.publish({ snapshot }, { obsDelaySec: 30, obsHideOwnNumbers: false });
    expect(clone).not.toHaveBeenCalled();
    const socket = new WebSocket(`ws://127.0.0.1:${(obs.server.address() as { port: number }).port}/ws`);
    const first = await new Promise<unknown>(resolve => socket.addEventListener("message", e => resolve(JSON.parse(String(e.data))), { once: true }));
    expect(first).toEqual({ snapshot: null }); socket.close();
  } finally { clone.mockRestore(); }
});
it("serves a frame at its delay boundary, including when no later frame arrives", () => {
  vi.useFakeTimers();
  const send = vi.fn(); const buffer = new ObsBuffer(send);
  try {
    buffer.publish({ snapshot: null, theme: "signal" }, { obsDelaySec: 30, obsHideOwnNumbers: false });
    vi.advanceTimersByTime(29_999); expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(send).toHaveBeenCalledExactlyOnceWith({ snapshot: null, theme: "signal" });
    expect(buffer.current).toEqual({ snapshot: null, theme: "signal" });
  } finally { buffer.close(); vi.useRealTimers(); }
});
it("blanks own numbers before buffering without leaking them through raw or player rows", () => {
  vi.useFakeTimers();
  const send = vi.fn(); const buffer = new ObsBuffer(send);
  const snapshot = new MockDataSource().getSnapshot(); snapshot.phase = "playing";
  try {
    buffer.publish({ snapshot, me: { troops: 123, gold: "456", maxTroops: 1000, troopRatePerTick: 12 } }, { obsDelaySec: 30, obsHideOwnNumbers: true });
    snapshot.self!.troops = 999; // The producer can reuse its snapshot after publish.
    vi.advanceTimersByTime(30_000);
    const frame = buffer.current;
    expect(frame.snapshot?.self?.troops).toBeNull(); expect(frame.snapshot?.self?.gold).toBeNull();
    expect(frame.snapshot?.players.find(p => p.id === snapshot.self!.id)).not.toHaveProperty("troops");
    expect(frame.me).not.toHaveProperty("troops"); expect(frame.me).not.toHaveProperty("gold");
    expect(frame.me).not.toHaveProperty("maxTroops"); expect(frame.me).not.toHaveProperty("troopRatePerTick");
    expect(snapshot.self!.gold).not.toBeNull();
  } finally { buffer.close(); vi.useRealTimers(); }
});
it("flushes old frames when privacy or delay changes and clears immediately for ranked/replay", () => {
  vi.useFakeTimers(); const send = vi.fn(); const buffer = new ObsBuffer(send);
  const snapshot = new MockDataSource().getSnapshot(); snapshot.phase = "playing";
  try {
    buffer.publish({ snapshot }, { obsDelaySec: 30, obsHideOwnNumbers: false });
    vi.advanceTimersByTime(10_000);
    buffer.publish({ snapshot }, { obsDelaySec: 60, obsHideOwnNumbers: true });
    vi.advanceTimersByTime(30_000); expect(buffer.current.snapshot).toBeNull();
    vi.advanceTimersByTime(30_000); expect(buffer.current.snapshot?.self?.troops).toBeNull();
    for (const patch of [{ mode: "Ranked" as const }, { observer: "replay" as const }]) {
      buffer.publish({ snapshot: { ...snapshot, ...patch } });
      expect(buffer.current.snapshot).toBeNull();
      vi.advanceTimersByTime(120_000); expect(buffer.current.snapshot).toBeNull();
    }
  } finally { buffer.close(); vi.useRealTimers(); }
});
afterEach(async () => {
  await obs?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it("serves OBS on loopback and pushes the current snapshot to websocket subscribers", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-obs-test-"));
  await writeFile(join(directory, "obs.html"), "<title>FlashFront OBS</title>");
  obs = await startObs({ rendererDir: directory, port: 0 });
  const address = obs.server.address() as { address: string; port: number };
  expect(address.address).toBe("127.0.0.1");
  const response = await fetch(`http://127.0.0.1:${address.port}/obs?widgets=stats`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("FlashFront OBS");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  const next = () => new Promise<unknown>(resolve => socket.addEventListener("message", e => resolve(JSON.parse(String(e.data))), { once: true }));
  expect(await next()).toEqual({ snapshot: null });
  const pushed = next();
  obs.publish({ snapshot: null, theme: "signal", me: { displayName: "Own player" } });
  expect(await pushed).toEqual({ snapshot: null, theme: "signal", me: { displayName: "Own player" } });
  const updated = next();
  obs.publish({ snapshot: null, theme: "daylight" });
  expect(await updated).toEqual({ snapshot: null, theme: "daylight" });
  socket.close();
});
it("serves the allowlisted public proxy, rejects non-GET requests and never forwards caller credentials", async () => {
  let called: RequestInit | undefined;
  const api = new StatsApi(async (_input, init) => { called = init; return new Response(JSON.stringify({ username: "Own player" }), { status: 200 }); });
  obs = await startObs({ rendererDir: ".", port: 0, api });
  const base = `http://127.0.0.1:${(obs.server.address() as { port: number }).port}`;
  const response = await fetch(`${base}/api/player/OWN12345`, { headers: { Cookie: "private", Authorization: "private" } });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ username: "Own player" });
  expect(called?.headers).toEqual({ Accept: "application/json" }); expect(called?.credentials).toBe("omit");
  expect((await fetch(`${base}/api/player/short`)).status).toBe(400);
  expect((await fetch(`${base}/api/player/OWN12345`, { method: "POST" })).status).toBe(405);
});

it("never streams ally names or incoming requests", () => {
  const snapshot = new MockDataSource().getSnapshot(); snapshot.players = [];
  snapshot.self!.alliances = [{ with: "ally:p7", name: "Ember" }];
  snapshot.self!.allianceRequests = [{ from: "ally:p7", name: "Ember", atWar: false }];
  expect(JSON.stringify(streamFrame({ snapshot }, false))).not.toMatch(/Ember|ally:p7/);
});
