import { afterEach, expect, it, vi } from "vitest";
import { CdpClient } from "./client";
import { CAMERA_MIN_MS, CdpDataSource, type CdpStatus } from "./source";
import { EXTRACT_EXPRESSION, CAMERA_EXPRESSION } from "./extract";
import type { GameSnapshot, RawExtract } from "@flashfront/core";
let source: CdpDataSource | undefined;
afterEach(() => { source?.stop(); vi.restoreAllMocks(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const client = new CdpClient();
  vi.spyOn(client, "connected", "get").mockReturnValue(true);
  vi.spyOn(client, "setTarget").mockImplementation(() => {});
  const call = vi.spyOn(client, "call");
  const log = vi.fn();
  source = new CdpDataSource(9222, { client, log, discover: async () => ({ id: "fake", type: "page", url: "app://openfront/", webSocketDebuggerUrl: "ws://127.0.0.1:9222/fake" }) });
  return { source, call, log };
}
it("emits exactly one coherent observation per read", async () => {
  const { source, call } = setup();
  const observe = vi.fn(); source.subscribeObservation(observe); observe.mockClear();
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 10, me: { troops: 123 } } } });
  source.start(); await vi.advanceTimersByTimeAsync(1000);
  expect(observe).toHaveBeenCalledTimes(4);
  for (const [{ raw, snapshot }] of observe.mock.calls) {
    expect(snapshot.tick).toBe(raw.tick); expect(snapshot.self.troops).toBe(raw.me.troops);
  }
});
it("runs the bounded camera lane only while Space is held during a live spawn", async () => {
  const { source, call } = setup();
  let spawning = false;
  const camera = { scale: 1, offsetX: 0, offsetY: 0, mapWidth: 2000, mapHeight: 1000, left: 0, top: 0, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080 };
  call.mockImplementation(async (_method, params) => ({ result: { value: params.expression === CAMERA_EXPRESSION ? camera : { inGame: true, visible: true, inSpawnPhase: spawning, tick: 1 } } }));
  const updates = vi.fn(); source.subscribeCamera(updates); source.setCameraHeld(true); source.start();
  await vi.advanceTimersByTimeAsync(1000); expect(updates).not.toHaveBeenCalled();
  spawning = true; await vi.advanceTimersByTimeAsync(250); updates.mockClear();
  await vi.advanceTimersByTimeAsync(1000); expect(updates.mock.calls.length).toBeGreaterThanOrEqual(100); expect(updates.mock.calls.length).toBeLessThanOrEqual(Math.ceil(1000 / CAMERA_MIN_MS) + 1);
  source.setCameraHeld(false); updates.mockClear(); await vi.advanceTimersByTimeAsync(500); expect(updates).not.toHaveBeenCalled();
  source.setCameraHeld(true); spawning = false; await vi.advanceTimersByTimeAsync(250); updates.mockClear();
  await vi.advanceTimersByTimeAsync(500); expect(updates).not.toHaveBeenCalled();
});
it("does not queue camera evaluations and discards a late response after release", async () => {
  const { source, call } = setup();
  let resolveCamera: (value: unknown) => void = () => {};
  call.mockImplementation((_method, params) => params.expression === CAMERA_EXPRESSION ? new Promise(resolve => { resolveCamera = resolve; })
    : Promise.resolve({ result: { value: { inGame: true, visible: true, inSpawnPhase: true, tick: 1 } } }));
  const updates = vi.fn(); source.subscribeCamera(updates); source.setCameraHeld(true); source.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(call.mock.calls.filter(([, p]) => p.expression === CAMERA_EXPRESSION)).toHaveLength(1);
  source.setCameraHeld(false);
  resolveCamera({ result: { value: { scale: 1, offsetX: 0, offsetY: 0, mapWidth: 2000, mapHeight: 1000, left: 0, top: 0, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080 } } });
  await vi.advanceTimersByTimeAsync(100);
  expect(updates).not.toHaveBeenCalled();
});
it("polls at 4 Hz, emits menu/game states and clears stale data", async () => {
  const { source, call } = setup();
  const statuses: CdpStatus[] = [];
  const snapshots: GameSnapshot[] = [];
  const raws: (RawExtract | null)[] = [];
  source.subscribeStatus(s => statuses.push(s));
  source.subscribeGame(s => snapshots.push(s));
  source.subscribeRaw(s => raws.push(s));
  call.mockResolvedValue({ result: { value: { inGame: false, visible: true } } });
  source.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(call).toHaveBeenCalledTimes(4);
  expect(statuses).toContain("connected-menu");
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 461, me: { troops: 146020 } } } });
  await vi.advanceTimersByTimeAsync(250);
  expect(statuses.at(-1)).toBe("connected-game");
  expect(snapshots.at(-1)?.self?.troops).toBe(146020);
  call.mockClear();
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 470, inSpawnPhase: true, me: { troops: 25000 } } } });
  await vi.advanceTimersByTimeAsync(1000);
  expect(call.mock.calls.length).toBeGreaterThanOrEqual(7); // 8 Hz while the spawn heat map is up
  call.mockRejectedValue(new Error("Socket gone"));
  await vi.advanceTimersByTimeAsync(250);
  expect(statuses.at(-1)).toBe("disconnected");
  expect(raws.at(-1)).toBeNull();
  expect(await source.getLobbies()).toEqual([]);
  expect(await source.getProfile()).toBeNull();
  expect(await source.getMatches()).toEqual([]);
  expect(await source.getMatch()).toBeNull();
});
it("falls back only for a side-effect EvalError, using the identical expression and logging once", async () => {
  const { source, call, log } = setup();
  call.mockResolvedValueOnce({ exceptionDetails: { exception: { className: "EvalError", description: "EvalError: Possible side-effect in debug-evaluate" } } })
    .mockResolvedValue({ result: { value: { inGame: false, visible: true } } });
  source.start();
  await vi.advanceTimersByTimeAsync(750);
  expect(call.mock.calls.map(c => c[1].throwOnSideEffect)).toEqual([true, false, false, false]);
  expect(call.mock.calls.every(c => c[0] === "Runtime.evaluate" && c[1].expression === EXTRACT_EXPRESSION)).toBe(true);
  expect(log).toHaveBeenCalledExactlyOnceWith("FlashFront extraction: throwOnSideEffect=false");
});
it("never retries ordinary extraction errors in relaxed mode", async () => {
  const { source, call } = setup();
  call.mockResolvedValue({ exceptionDetails: { exception: { className: "TypeError", description: "broken getter" } } });
  source.start();
  await vi.advanceTimersByTimeAsync(500);
  expect(call.mock.calls.map(c => c[1].throwOnSideEffect)).toEqual([true, true]);
  expect(source.status).toBe("disconnected");
});
it("reports a closed port without contacting the game", async () => {
  vi.useFakeTimers();
  source = new CdpDataSource(9222, { discover: async () => { throw new Error("ECONNREFUSED"); } });
  source.start(); await vi.advanceTimersByTimeAsync(1);
  expect(source.status).toBe("port-closed");
});
it("gives separate matches unique identities even when they start at the same tick", async () => {
  const { source, call } = setup();
  const games: GameSnapshot[] = [];
  source.subscribeGame(s => games.push(s));
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 0 } } });
  source.start(); await vi.advanceTimersByTimeAsync(250);
  call.mockResolvedValue({ result: { value: { inGame: false, visible: true } } });
  await vi.advanceTimersByTimeAsync(250);
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 0 } } });
  await vi.advanceTimersByTimeAsync(250);
  expect(games).toHaveLength(2);
  expect(games[0]!.gameId).not.toBe(games[1]!.gameId);
});
// OpenFront's Electron has no Browser.getWindowForTarget ("wasn't found", verified 2026-10-16), so
// window bounds come from the page's own screenX/screenY/outerWidth/outerHeight in the extraction.
it("derives window bounds from the extraction, never from a Browser.* call", async () => {
  const { source, call } = setup();
  expect(await source.getWindowBounds()).toBeNull();
  call.mockResolvedValue({ result: { value: { inGame: true, visible: true, tick: 1, window: { x: 0, y: 0, width: 1920, height: 1080, hidden: false } } } });
  source.start();
  await vi.advanceTimersByTimeAsync(250);
  expect(await source.getWindowBounds()).toEqual({ left: 0, top: 0, width: 1920, height: 1080, windowState: "normal" });
  call.mockResolvedValue({ result: { value: { inGame: true, visible: false, tick: 2, window: { x: -32000, y: -32000, width: 160, height: 28, hidden: true } } } });
  await vi.advanceTimersByTimeAsync(250);
  expect((await source.getWindowBounds())?.windowState).toBe("minimized");
  expect(call.mock.calls.every(([method]) => method === "Runtime.evaluate")).toBe(true);
});
