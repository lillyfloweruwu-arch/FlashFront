import { afterEach, expect, it, vi } from "vitest";
import type { BoardSource, ScheduledAction, TrainingAction } from "./contracts";
import type { WorkerLike } from "./client";
import { ENGINE_COMMIT } from "./protocol";
import type { MapBytes, WorkerRequest, WorkerResponse } from "./protocol";

class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = [];
  terminated = 0;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: WorkerRequest) { this.sent.push(message); }
  terminate() { this.terminated++; }
  reply(msg: WorkerResponse) { this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>); }
  last() { return this.sent.at(-1)!; }
}
const record = (commit = ENGINE_COMMIT): BoardSource => ({ kind: "record", ownClientId: "abc", startTick: 300, record: { gitCommit: commit, info: { config: { gameMap: "World", gameMapSize: "Normal" } } } });
const map: MapBytes = { mapId: "World", mapSize: "Normal", manifest: {}, mapBin: new Uint8Array(4), map4xBin: new Uint8Array(1) };
const handle = { sessionId: "", startTick: 300, endTick: 900, ticksPerSecond: 10, ownPlayer: "p1", mapId: "World", mapSize: "Normal" as const };

async function engineWithBoard(extra: Record<string, unknown> = {}) {
  const { createTrainingEngine } = await import("./client");
  const worker = new FakeWorker();
  const engine = createTrainingEngine({ createWorker: () => worker, loadMap: async () => ({ ...map }), ...extra });
  const pending = engine.rebuild(record(), new AbortController().signal);
  await vi.waitFor(() => expect(worker.sent.length).toBe(1));
  const req = worker.last();
  worker.reply({ id: req.id, session: req.session, kind: "result", result: { status: "ready", value: { ...handle, sessionId: req.session } } });
  return { engine, worker, board: await pending, session: req.session };
}

afterEach(() => vi.unstubAllGlobals());

it("importing the contracts or the client creates no worker and loads no engine module", async () => {
  const ctor = vi.fn();
  vi.stubGlobal("Worker", ctor);
  const contracts = await import("./contracts");
  await import("./client");
  expect(ctor).not.toHaveBeenCalled();
  expect(Object.keys(contracts).sort()).toEqual(["PLAYER_ID", "TrainingEngineError", "actionProblem", "scheduledProblem"]);
});

it("rejects invalid actions before they reach the worker", async () => {
  const { actionProblem, scheduledProblem } = await import("./contracts");
  const bad: TrainingAction[] = [
    { kind: "attack", target: "p2", troops: -5 }, { kind: "attack", target: "p2", troops: Number.NaN },
    { kind: "buildPost", tile: 10.5 }, { kind: "buildPost", tile: -1 },
    { kind: "allianceRequest", target: "" }, { kind: "allianceAccept", target: undefined as unknown as string },
    { kind: "attack", target: "Alice", troops: 10 },
  ];
  for (const a of bad) expect(actionProblem(a), JSON.stringify(a)).not.toBeNull();
  expect(actionProblem({ kind: "attack", target: null, troops: 12.5 })).toBeNull();
  expect(scheduledProblem({ tick: 300.5, actor: "p1", action: { kind: "wait" } })).toMatch(/tick/);
  expect(scheduledProblem({ tick: 300, actor: "me", action: { kind: "wait" } })).toMatch(/actor/);

  const { engine, worker } = await engineWithBoard();
  const own: ScheduledAction[] = [{ tick: 301, actor: "p1", action: { kind: "attack", target: "p2", troops: -1 } }];
  await expect(engine.run({ untilTick: 400, own, opponents: "recorded" }, new AbortController().signal)).rejects.toMatchObject({ reason: "invalidRecord" });
  expect(worker.sent.map((m) => m.op)).toEqual(["rebuild"]);
});

it("rebuild refuses an unsupported build and a missing map without starting a worker", async () => {
  const { createTrainingEngine } = await import("./client");
  const create = vi.fn(() => new FakeWorker());
  const loadMap = vi.fn(async () => null);
  const engine = createTrainingEngine({ createWorker: create, loadMap });
  const signal = new AbortController().signal;
  expect(await engine.rebuild(record("0000000"), signal)).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
  expect(loadMap).not.toHaveBeenCalled();
  expect(await engine.rebuild(record(), signal)).toEqual({ status: "unavailable", reason: "missingMap" });
  expect(await engine.rebuild({ kind: "record", ownClientId: "a", startTick: 0, record: {} }, signal)).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(create).not.toHaveBeenCalled();
});

it("returns inMatch before loading anything and when a match starts mid-call", async () => {
  const { createTrainingEngine } = await import("./client");
  let live = true;
  const loadMap = vi.fn(async () => ({ ...map }));
  const engine = createTrainingEngine({ createWorker: () => new FakeWorker(), loadMap, isInMatch: () => live });
  expect(await engine.rebuild(record(), new AbortController().signal)).toEqual({ status: "unavailable", reason: "inMatch" });
  expect(loadMap).not.toHaveBeenCalled();
  live = false;
  const worker = new FakeWorker();
  const engine2 = createTrainingEngine({ createWorker: () => worker, loadMap, isInMatch: () => live });
  const pending = engine2.rebuild(record(), new AbortController().signal);
  await vi.waitFor(() => expect(worker.sent.length).toBe(1));
  live = true;
  const req = worker.last();
  worker.reply({ id: req.id, session: req.session, kind: "result", result: { status: "ready", value: handle } });
  expect(await pending).toEqual({ status: "unavailable", reason: "inMatch" });
});

it("abort resolves cancelled at once and tells the worker to stop", async () => {
  const { engine, worker } = await engineWithBoard();
  const controller = new AbortController();
  const run = engine.run({ untilTick: 900, own: [], opponents: "recorded" }, controller.signal);
  const runReq = worker.last();
  controller.abort();
  expect(await run).toEqual({ status: "unavailable", reason: "cancelled" });
  expect(worker.last()).toMatchObject({ op: "cancel", target: runReq.id });
  worker.reply({ id: runReq.id, session: runReq.session, kind: "result", result: { status: "ready", value: {} } });
});

it("dispose terminates the one worker once and rejects every outstanding call with cancelled", async () => {
  const { engine, worker } = await engineWithBoard();
  const frame = engine.frame();
  const checkpoint = engine.checkpoint();
  engine.dispose();
  engine.dispose();
  expect(worker.terminated).toBe(1);
  await expect(frame).rejects.toMatchObject({ reason: "cancelled" });
  await expect(checkpoint).rejects.toMatchObject({ reason: "cancelled" });
  await expect(engine.frame()).rejects.toMatchObject({ reason: "cancelled" });
});

it("a checkpoint from another session is rejected, and stale answers are dropped", async () => {
  const { engine, worker, session } = await engineWithBoard();
  await expect(engine.restore({ sessionId: "other", tick: 300, bytes: new Uint8Array(1) })).rejects.toMatchObject({ reason: "staleSession" });
  const frame = engine.frame();
  const req = worker.last();
  worker.reply({ id: req.id, session: "other", kind: "frame", frame: {} as never });
  worker.reply({ id: req.id, session: "old", kind: "result", result: { status: "ready", value: 1 } });
  worker.reply({ id: req.id, session, kind: "result", result: { status: "ready", value: 2 } as never });
  expect(await frame).toBe(2);
});
