// The Training worker: owns one board session at a time. It has no network transports and
// never reads files; the host sends map bytes and records.
import type { EngineResult } from "./contracts";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { paintPlan } from "./history";
import { BoardSession } from "./rebuild";

const scope = self as unknown as { postMessage(m: WorkerResponse, t?: Transferable[]): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };
for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"]) {
  Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
}

let session: BoardSession | null = null;
let sessionId = "";
const cancelled = new Set<number>();
const yieldNow = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const reply = (m: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const result = (req: WorkerRequest, r: EngineResult<unknown>, transfer: Transferable[] = []) => reply({ id: req.id, session: req.session, kind: "result", result: r }, transfer);
const error = (req: WorkerRequest, reason: "staleSession" | "invalidRecord" | "desync", message: string) => reply({ id: req.id, session: req.session, kind: "error", reason, message });

async function handle(req: WorkerRequest): Promise<void> {
  const control = { cancelled: () => cancelled.has(req.id) || req.session !== sessionId, yieldNow };
  if (req.op === "cancel") { cancelled.add(req.target); return; }
  if (req.op === "rebuild") {
    session = null;
    sessionId = req.session;
    const built = await BoardSession.rebuild(req.session, req.source, req.map, control);
    if (built.status === "ready" && req.session === sessionId) session = built.value;
    result(req, built.status === "ready" ? { status: "ready", value: built.value.handle } : built);
    return;
  }
  if (!session || req.session !== sessionId) { error(req, "staleSession", "no board for this session"); return; }
  switch (req.op) {
    case "frame": {
      const frame = session.frame();
      result(req, { status: "ready", value: frame }, [frame.owners.buffer as ArrayBuffer]);
      return;
    }
    case "checkpoint": {
      const bytes = session.checkpoint();
      result(req, { status: "ready", value: { sessionId, tick: session.tick, bytes } }, [bytes.buffer as ArrayBuffer]);
      return;
    }
    case "restore":
      await session.restore(req.tick, req.bytes);
      result(req, { status: "ready", value: undefined });
      return;
    case "run":
      result(req, await session.run(req.input, control));
      return;
    case "rewind": {
      // Reverse render history only; the playable state comes back from the start's engine snapshot.
      const start = session.history.start;
      const plan = start && start.tick === req.toTick ? session.history.reversePatches(req.toTick) : null;
      if (!start || !plan) { result(req, { status: "unavailable", reason: "historyLimit" }); return; }
      // Frame k of the reverse is the latest capture with patches[0..k-1] applied.
      reply({ id: req.id, session: req.session, kind: "frame", frame: plan.first }, [plan.first.owners.buffer as ArrayBuffer]);
      const steps = [...new Set(paintPlan(plan.patches.length, req.durationMs, req.fps).map((i) => i + 1))];
      const interval = req.durationMs / Math.max(1, steps.length);
      let applied = 0;
      // Paint against deadlines from the start, so slow patches on big maps don't stretch the rewind.
      const began = performance.now();
      for (const [n, step] of steps.entries()) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, began + (n + 1) * interval - performance.now())));
        if (control.cancelled()) { result(req, { status: "unavailable", reason: "cancelled" }); return; }
        const merged = plan.patches.slice(applied, step);
        const idx = new Uint32Array(merged.reduce((n, p) => n + p.idx.length, 0)), values = new Uint16Array(idx.length);
        let k = 0;
        for (const p of merged) { idx.set(p.idx, k); values.set(p.values, k); k += p.idx.length; }
        reply({ id: req.id, session: req.session, kind: "patch", meta: merged.at(-1)!.meta, idx, values }, [idx.buffer, values.buffer]);
        applied = step;
      }
      if (steps.length === 0) await new Promise((resolve) => setTimeout(resolve, req.durationMs));
      await session.restore(start.tick, start.bytes);
      result(req, { status: "ready", value: undefined });
      return;
    }
  }
}

scope.onmessage = (event) => {
  const req = event.data;
  handle(req).catch((e: unknown) => error(req, "desync", e instanceof Error ? e.message : String(e))).finally(() => cancelled.delete(req.id));
};
