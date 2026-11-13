import { afterEach, expect, it, vi } from "vitest";
import type { BoardFrame, TrainingEngine } from "./contracts";
import type { WorkerLike } from "./client";
import { onionMap } from "./fixtures/maps";
import { SYNTH } from "./fixtures/ids";
import synthetic from "./fixtures/synthetic-record.json";
import { HISTORY_BUDGET_BYTES, paintPlan, SnapshotHistory } from "./history";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const frame = (tick: number, owners: number[], unitTile = 0): BoardFrame => ({
  tick, width: owners.length, height: 1, terrain: new Uint8Array(owners.length), owners: Uint16Array.from(owners),
  requests: [], alliances: [], units: [{ id: "u1", tile: unitTile, owner: 1, kind: "Transport", troops: 50 }], players: [{ id: "p1", troops: 100 + tick, gold: 0, tiles: 0 }],
});
const checkpoint = { sessionId: "s", tick: 100, bytes: new Uint8Array(1000) };

afterEach(() => vi.useRealTimers());

it("rewinding 110 to 100 paints 110, 105, 100 with borders and units moving back", () => {
  const h = new SnapshotHistory();
  h.begin(checkpoint, frame(100, [1, 0, 0, 0], 0));
  h.capture(frame(105, [1, 1, 0, 0], 1));
  h.capture(frame(110, [1, 1, 1, 2], 2));
  const frames = h.reverseFrames(100);
  expect(frames.map((f) => f.tick)).toEqual([110, 105, 100]);
  expect(frames.map((f) => Array.from(f.owners))).toEqual([[1, 1, 1, 2], [1, 1, 0, 0], [1, 0, 0, 0]]);
  expect(frames.map((f) => f.units[0]!.tile)).toEqual([2, 1, 0]);
  expect(h.bytesUsed).toBeLessThanOrEqual(HISTORY_BUDGET_BYTES);
});

it("over budget a capture reports historyLimit and keeps the start reachable", () => {
  const h = new SnapshotHistory(1000 + 8 + 400);
  expect(h.begin(checkpoint, frame(100, [0, 0, 0, 0]))).toBeUndefined();
  expect(h.capture(frame(105, [1, 1, 1, 1]))).toBeUndefined();
  const used = h.bytesUsed;
  expect(h.capture(frame(110, [2, 2, 2, 2]))).toBe("historyLimit");
  expect(h.bytesUsed).toBe(used);
  expect(h.start).toBe(checkpoint);
  expect(h.reverseFrames(100).map((f) => f.tick)).toEqual([105, 100]);
  expect(new SnapshotHistory(10).begin(checkpoint, frame(100, [0]))).toBe("historyLimit");
});

it("a rewind paints at most 30 frames a second, 15 in Lite, and always ends on the target", () => {
  expect(paintPlan(120, 1500, 30)).toHaveLength(45);
  expect(paintPlan(120, 1500, 15)).toHaveLength(22);
  expect(paintPlan(120, 1500, 15).at(-1)).toBe(119);
  expect(paintPlan(6, 1500, 30)).toEqual([0, 1, 2, 3, 4, 5]);
});

/** The real worker module, run in-process behind the real client. */
async function bridgedEngine(lite = false): Promise<TrainingEngine> {
  vi.resetModules();
  let toClient: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  const scope = { postMessage: (m: WorkerResponse) => queueMicrotask(() => toClient?.({ data: m } as MessageEvent<WorkerResponse>)), onmessage: null as ((e: MessageEvent<WorkerRequest>) => void) | null };
  vi.stubGlobal("self", scope);
  await import("./training.worker");
  const worker: WorkerLike = {
    postMessage: (m) => queueMicrotask(() => scope.onmessage?.({ data: structuredClone(m) } as MessageEvent<WorkerRequest>)),
    terminate: () => { scope.onmessage = null; },
    get onmessage() { return toClient; }, set onmessage(fn) { toClient = fn; },
    onerror: null,
  };
  const { createTrainingEngine } = await import("./client");
  return createTrainingEngine({ createWorker: () => worker, loadMap: async () => onionMap(), lite: () => lite });
}

it("a real rewind reverses the attempt over 1.5 s, then restores a start that replays identically", async () => {
  const engine = await bridgedEngine();
  const signal = new AbortController().signal;
  const board = await engine.rebuild({ kind: "record", record: synthetic, ownClientId: SYNTH.me, startTick: 300 }, signal);
  if (board.status !== "ready") throw new Error(board.reason);
  const own = [{ tick: 302, actor: board.value.ownPlayer, action: { kind: "attack" as const, target: null, troops: 500 } }];
  await engine.run({ untilTick: 360, own, opponents: "recorded" }, signal);
  const end = await engine.frame();

  vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
  const painted: { tick: number; owned: number }[] = [];
  let done = false;
  const rewind = engine.rewind({ toTick: 300, durationMs: 1500, onFrame: (f) => painted.push({ tick: f.tick, owned: f.owners.filter((o) => o !== 0).length }) }, signal).then((r) => { done = true; return r; });
  await vi.advanceTimersByTimeAsync(1400);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  expect(await rewind).toEqual({ status: "ready", value: undefined });
  vi.useRealTimers();
  expect(painted[0]!.tick).toBe(360);
  expect(painted.at(-1)!.tick).toBe(300);
  expect(painted.map((p) => p.tick)).toEqual([...painted.map((p) => p.tick)].sort((a, b) => b - a));
  expect(new Set(painted.map((p) => p.owned)).size).toBeGreaterThan(1);
  expect(painted.length).toBeLessThanOrEqual(1 + 45);

  expect((await engine.frame()).tick).toBe(300);
  await engine.run({ untilTick: 360, own, opponents: "recorded" }, signal);
  const again = await engine.frame();
  expect(Array.from(again.owners)).toEqual(Array.from(end.owners));
  expect(again.players).toEqual(end.players);
  expect(again.units).toEqual(end.units);
  engine.dispose();
});

it("a cancelled rewind paints nothing after the cancel", async () => {
  const engine = await bridgedEngine(true);
  const signal = new AbortController().signal;
  const board = await engine.rebuild({ kind: "record", record: synthetic, ownClientId: SYNTH.me, startTick: 300 }, signal);
  if (board.status !== "ready") throw new Error(board.reason);
  await engine.run({ untilTick: 400, own: [], opponents: "recorded" }, signal);
  vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
  const controller = new AbortController();
  let painted = 0;
  const rewind = engine.rewind({ toTick: 300, durationMs: 1500, onFrame: () => { painted++; } }, controller.signal);
  await vi.advanceTimersByTimeAsync(500);
  const before = painted;
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThanOrEqual(1 + 8); // Lite: 15 fps
  controller.abort();
  expect(await rewind).toEqual({ status: "unavailable", reason: "cancelled" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(painted).toBe(before);
  engine.dispose();
});
