import type { DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import type { ClientBridge } from "./bridge";
import type { DrillReferee } from "./DrillReferee";
import type { RewindBuffer, RewindFrame } from "./RewindBuffer";

export type FlowStep = "playing" | "rewinding" | "demo" | "retry" | "result";
export interface DrillFlowDependencies {
  bridge: Pick<ClientBridge, "restart">;
  referee: Pick<DrillReferee, "reset"> | (() => Pick<DrillReferee, "reset">);
  data: Pick<DrillClientData, "startTick" | "coach">;
  buffer: RewindBuffer | null;
  playRewind(frames: readonly RewindFrame[], ms: number, signal?: AbortSignal): Promise<void>;
  /** Rebind to the newly created server before resetting the current referee. */
  onRestart?(mode: "play" | "demo"): void | Promise<void>;
}

export class DrillFlow {
  private current: FlowStep = "playing";
  private listeners = new Set<(step: FlowStep) => void>();
  private active: Promise<void> | undefined;
  private pending: "retry" | "demo" | undefined;
  private controller: AbortController | undefined;
  private finishDemo: (() => void) | undefined;
  private disposed = false;
  private readonly demoEndTick: number;

  constructor(private readonly deps: DrillFlowDependencies) {
    this.demoEndTick = deps.data.startTick + Math.max(0, ...deps.data.coach.map(intent => intent.turn)) + 30;
  }

  step(): FlowStep { return this.current; }
  subscribe(listener: (step: FlowStep) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private setStep(step: FlowStep): void {
    if (this.disposed) return;
    this.current = step;
    for (const listener of this.listeners) listener(step);
  }

  /** The renderer feeds absolute engine ticks; no background polling survives teardown. */
  onTurn(tick: number): void {
    if (this.current === "demo" && tick >= this.demoEndTick) this.finishDemo?.();
  }
  result(): void { if (!this.active) this.setStep("result"); }
  rewindAndDemo(): Promise<void> { return this.request("demo"); }
  tryAgain(): Promise<void> { return this.request("retry"); }

  private request(action: "retry" | "demo"): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pending = action;
    if (this.active) {
      // Coalesce all requests during a restart to one successor. Abort presentation/demo
      // waiting, but await the in-flight restart before starting the successor.
      this.controller?.abort();
      return this.active;
    }
    this.active = this.drain().finally(() => { this.active = undefined; });
    return this.active;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending && !this.disposed) {
        const action = this.pending;
        this.pending = undefined;
        const controller = new AbortController();
        this.controller = controller;
        const signal = controller.signal;
        if (action === "demo") {
          this.setStep("rewinding");
          await this.untilAbort(this.deps.playRewind(this.deps.buffer?.frames() ?? [], 1500, signal), signal);
          if (signal.aborted) continue;
          await this.restart("demo");
          if (signal.aborted || this.disposed) continue;
          const demo = new Promise<void>(resolve => { this.finishDemo = resolve; });
          this.setStep("demo");
          await this.untilAbort(demo, signal);
          this.finishDemo = undefined;
          if (signal.aborted) continue;
        }
        await this.restart("play");
        if (!signal.aborted) this.setStep("retry");
      }
    } finally {
      this.pending = undefined;
      this.controller = undefined;
      this.finishDemo = undefined;
    }
  }

  private async restart(mode: "play" | "demo"): Promise<void> {
    this.deps.buffer?.clear();
    await this.deps.bridge.restart(mode);
    if (this.disposed) return;
    await this.deps.onRestart?.(mode);
    const referee = typeof this.deps.referee === "function" ? this.deps.referee() : this.deps.referee;
    referee.reset();
  }

  private untilAbort(work: Promise<void>, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = () => { signal.removeEventListener("abort", finish); resolve(); };
      signal.addEventListener("abort", finish, { once: true });
      work.then(finish, error => { signal.removeEventListener("abort", finish); if (signal.aborted) resolve(); else reject(error); });
      if (signal.aborted) finish();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.pending = undefined;
    this.controller?.abort();
    this.finishDemo?.();
    this.finishDemo = undefined;
    this.listeners.clear();
    this.deps.buffer?.clear();
  }
}
