// The only place a Training worker is created. Import this module dynamically, from Training only.
import { scheduledProblem, TrainingEngineError } from "./contracts";
import type { BoardFrame, BoardHandle, BoardSource, EngineCheckpoint, EngineResult, TrainingEngine, TrainingTrace } from "./contracts";
import { RECORD_COMMITS, sourceMap } from "./protocol";
import type { MapBytes, RunInput, WorkerRequest, WorkerResponse } from "./protocol";

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface TrainingEngineOptions {
  /** Map files for one map; null when this install has no such map. */
  loadMap?: (mapId: string, mapSize: "Normal" | "Compact") => Promise<MapBytes | null>;
  /** True while a live match runs; checked before and after every await. */
  isInMatch?: () => boolean;
  /** Lite mode paints rewinds at 15 fps instead of 30. */
  lite?: () => boolean;
  createWorker?: () => WorkerLike;
}

type Distribute<T> = T extends unknown ? Omit<T, "id" | "session"> : never;
type Body = Distribute<WorkerRequest>;
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; onStream?: (msg: Extract<WorkerResponse, { kind: "frame" | "patch" }>) => void }

const defaultWorker = (): WorkerLike => new Worker(new URL("./training.worker.ts", import.meta.url), { type: "module", name: "flashfront-training" }) as unknown as WorkerLike;
const transfers = (map: MapBytes) => [map.mapBin, map.map4xBin, map.map16xBin].flatMap((b) => (b ? [b.buffer as ArrayBuffer] : []));

function unwrap<T>(result: EngineResult<T>): T {
  if (result.status === "ready") return result.value;
  throw new TrainingEngineError(result.reason);
}

export function createTrainingEngine(options: TrainingEngineOptions = {}): TrainingEngine {
  let worker: WorkerLike | null = null;
  let disposed = false;
  let session = "";
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const inMatch = () => options.isInMatch?.() ?? false;

  const ensureWorker = () => {
    if (worker) return worker;
    const w = (options.createWorker ?? defaultWorker)();
    w.onmessage = (event) => {
      const msg = event.data;
      const call = pending.get(msg.id);
      if (!call || msg.session !== session) return; // late answer from an older session
      if (msg.kind === "frame" || msg.kind === "patch") { call.onStream?.(msg); return; }
      pending.delete(msg.id);
      if (msg.kind === "error") call.reject(new TrainingEngineError(msg.reason, msg.message));
      else call.resolve(msg.result);
    };
    w.onerror = (event) => failAll(new TrainingEngineError("desync", event.message || "training worker failed"));
    return (worker = w);
  };
  const failAll = (error: Error) => {
    const calls = [...pending.values()];
    pending.clear();
    for (const call of calls) call.reject(error);
  };
  function send<T>(body: Body, transfer: Transferable[] = [], onStream?: Pending["onStream"]): { id: number; done: Promise<T> } {
    if (disposed) return { id: 0, done: Promise.reject(new TrainingEngineError("cancelled", "engine disposed")) };
    const id = nextId++;
    const done = new Promise<T>((resolve, reject) => pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onStream }));
    ensureWorker().postMessage({ ...body, id, session } as WorkerRequest, transfer);
    return { id, done };
  }
  /** Resolves `cancelled` at once on abort and tells the worker to stop at its next yield. */
  function cancellable<T>(body: Body, signal: AbortSignal, transfer: Transferable[] = [], onStream?: Pending["onStream"]): Promise<EngineResult<T>> {
    if (signal.aborted) return Promise.resolve({ status: "unavailable", reason: "cancelled" });
    const call = send<EngineResult<T>>(body, transfer, onStream);
    return new Promise((resolve, reject) => {
      const abort = () => {
        const call0 = pending.get(call.id);
        pending.delete(call.id);
        if (call0 && worker) worker.postMessage({ op: "cancel", target: call.id, id: nextId++, session });
        resolve({ status: "unavailable", reason: "cancelled" });
      };
      signal.addEventListener("abort", abort, { once: true });
      call.done.then((r) => { signal.removeEventListener("abort", abort); resolve(inMatch() ? { status: "unavailable", reason: "inMatch" } : r); },
        (e) => { signal.removeEventListener("abort", abort); reject(e); });
    });
  }

  return {
    async rebuild(source: BoardSource, signal: AbortSignal): Promise<EngineResult<BoardHandle>> {
      if (inMatch()) return { status: "unavailable", reason: "inMatch" };
      const target = sourceMap(source);
      if (!target) return { status: "unavailable", reason: "invalidRecord" };
      if (target.commit === null || !RECORD_COMMITS.includes(target.commit)) return { status: "unavailable", reason: "unsupportedVersion" };
      // A new board is a new session: answers still in flight for the old one are dropped.
      failAll(new TrainingEngineError("staleSession", "a new board replaced this session"));
      session = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const map = options.loadMap ? await options.loadMap(target.mapId, target.mapSize).catch(() => null) : null;
      if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
      if (inMatch()) return { status: "unavailable", reason: "inMatch" };
      if (!map) return { status: "unavailable", reason: "missingMap" };
      return cancellable<BoardHandle>({ op: "rebuild", source, map }, signal, transfers(map));
    },
    frame: () => send<EngineResult<BoardFrame>>({ op: "frame" }).done.then(unwrap),
    checkpoint: () => send<EngineResult<EngineCheckpoint>>({ op: "checkpoint" }).done.then(unwrap),
    async restore(checkpoint: EngineCheckpoint) {
      if (checkpoint.sessionId !== session) throw new TrainingEngineError("staleSession", "checkpoint belongs to another session");
      unwrap(await send<EngineResult<void>>({ op: "restore", tick: checkpoint.tick, bytes: checkpoint.bytes.slice() }).done);
    },
    run(input: RunInput, signal: AbortSignal): Promise<EngineResult<TrainingTrace>> {
      if (inMatch()) return Promise.resolve({ status: "unavailable", reason: "inMatch" });
      const scripted = input.opponents === "recorded" ? [] : input.opponents;
      for (const s of [...input.own, ...scripted]) {
        const problem = scheduledProblem(s);
        if (problem) return Promise.reject(new TrainingEngineError("invalidRecord", problem));
      }
      if (!Number.isInteger(input.untilTick) || input.untilTick < 0) return Promise.reject(new TrainingEngineError("invalidRecord", "untilTick must be a non-negative integer"));
      return cancellable<TrainingTrace>({ op: "run", input: { untilTick: input.untilTick, own: input.own, opponents: input.opponents } }, signal);
    },
    rewind(opts, signal) {
      const fps = options.lite?.() ? 15 : 30;
      // The worker sends the latest frame once, then ownership patches; one owners buffer is reused,
      // so a frame passed to onFrame is only valid until the next call.
      let frame: BoardFrame | null = null;
      return cancellable<void>({ op: "rewind", toTick: opts.toTick, durationMs: opts.durationMs, fps }, signal, [], (msg) => {
        if (signal.aborted) return;
        if (msg.kind === "frame") frame = msg.frame;
        else if (frame) {
          for (let k = 0; k < msg.idx.length; k++) frame.owners[msg.idx[k]!] = msg.values[k]!;
          frame = { ...frame, ...msg.meta };
        } else return;
        opts.onFrame(frame);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = null;
      failAll(new TrainingEngineError("cancelled", "engine disposed"));
    },
  };
}
