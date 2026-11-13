// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import { createClientBridge, type ClientBridge } from "./bridge";
import { snapshotFor } from "./session";

const mock = vi.hoisted(() => ({ joins: [] as any[] }));
vi.mock("../../../../vendor/openfront/client/packages/shared/src/SharedUtil", () => ({ toWireGameStartInfo: (info: unknown) => info }));
vi.mock("../../../../vendor/openfront/packages/engine-api/src/game/GameTypes", () => ({ GameType: { Singleplayer: "Singleplayer" }, Cell: class { constructor(public x: number, public y: number) {} } }));
vi.mock("../../../../vendor/openfront/client/src/client/ClientGameRunner", () => ({ joinLobby: (bus: unknown, lobby: any) => {
  const handle = { stop: vi.fn(() => true), join: Promise.resolve(), prestart: Promise.resolve() };
  lobby.training.server = { endGame: vi.fn() };
  mock.joins.push({ bus, lobby, handle });
  return handle;
} }));
const data: DrillClientData = {
  drillId: "sends-01", engineCommit: "abc", snapshotFormat: "1", startTick: 100, ownClientId: "own",
  gameStartInfo: { gameID: "game", config: { gameType: "Public" } }, opponents: [], coach: [],
  check: { kind: "send", minSendPct: 15, maxSendPct: 25, minReservePct: 40 }, window: { openTick: 100, deadlineTick: 700 },
};
let bridge: ClientBridge;
const showGame = (tick = 100) => {
  const game = { ticks: () => tick };
  Object.assign(document.querySelector("control-panel")!, { game });
  return game;
};
beforeEach(() => {
  vi.useFakeTimers(); mock.joins = [];
  document.body.innerHTML = '<control-panel></control-panel><build-menu></build-menu><canvas id="webgl-debug-canvas"></canvas>';
  bridge = createClientBridge();
});
afterEach(() => { bridge.stop(); vi.useRealTimers(); });
it("waits for the restored game, exposes the upstream transform, and restarts with an intact snapshot", async () => {
  const original = new Uint8Array([1, 2, 3]);
  const started = bridge.start(data, original, "play");
  original.fill(9);
  const transferred = snapshotFor("game"); transferred.fill(8);
  expect(snapshotFor("game")).toEqual(new Uint8Array([1, 2, 3]));
  showGame(99); await vi.advanceTimersByTimeAsync(10); expect(bridge.game()).toBeUndefined();
  const first = showGame(); await vi.advanceTimersByTimeAsync(5); await started;
  expect(bridge.game()).toBe(first);
  const transform = vi.fn(({ x, y }) => ({ x: x + 20, y: y + 30 }));
  Object.assign(document.querySelector("build-menu")!, { transformHandler: { worldToScreenCoordinates: transform } });
  expect(bridge.worldToScreen(2, 3)).toEqual({ x: 22, y: 33 });
  expect(bridge.canvas()?.id).toBe("webgl-debug-canvas");
  const restart = bridge.restart("demo");
  expect(mock.joins[0].handle.stop).toHaveBeenCalledWith(true);
  expect(mock.joins[1].bus).not.toBe(mock.joins[0].bus);
  expect(mock.joins[1].lobby.training.mode).toBe("demo");
  expect(mock.joins[1].lobby.gameStartInfo.config.gameType).toBe("Singleplayer");
  expect(snapshotFor("game")).toEqual(new Uint8Array([1, 2, 3]));
  await vi.advanceTimersByTimeAsync(20); expect(bridge.game()).toBeUndefined();
  showGame(); await vi.advanceTimersByTimeAsync(5); expect(await restart).toBeGreaterThanOrEqual(20);
  bridge.stop(); expect(bridge.game()).toBeUndefined(); expect(bridge.canvas()).toBeUndefined();
  expect(() => snapshotFor("game")).toThrow();
});
it("cancels startup and also stops a runner that finishes creating after stop", async () => {
  const started = bridge.start(data, new Uint8Array([1]), "play");
  const rejected = expect(started).rejects.toThrow("cancelled");
  await Promise.resolve(); // upstream join resolves BEFORE it creates the runner
  bridge.stop(); await rejected;
  const { lobby, handle } = mock.joins[0];
  handle.stop.mockClear();
  lobby.training.onRunnerStarted();
  await Promise.resolve();
  expect(handle.stop).toHaveBeenCalledWith(true);
  expect(vi.getTimerCount()).toBe(0);
});
it("fails a stalled start and clears its clock", async () => {
  const started = bridge.start(data, new Uint8Array([1]), "play");
  const rejected = expect(started).rejects.toThrow("did not become live");
  await vi.advanceTimersByTimeAsync(30_010); await rejected;
  expect(mock.joins[0].handle.stop).toHaveBeenCalledWith(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("replay starts without a drill check and uses an immutable read-only session", async () => {
  const { drillId: _id, check: _check, window: _window, ...common } = data;
  const started = bridge.startReplay({ ...common, endTick: 900 }, new Uint8Array([4]));
  expect(mock.joins[0].lobby.training.mode).toBe("replay");
  expect(mock.joins[0].lobby.training.data).not.toHaveProperty("check");
  showGame(); await vi.advanceTimersByTimeAsync(5); await started;
});
