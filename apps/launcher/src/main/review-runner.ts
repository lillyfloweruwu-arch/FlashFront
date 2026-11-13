import { Worker } from "node:worker_threads";
import type { ReviewBuildInput, ReviewLoad } from "../review-types";

/** One worker per open review. Its snapshot cache survives seeks, but never survives closing. */
export class ReviewRunner {
  private worker?: Worker;
  private next = 0;
  private pending = new Map<number, { resolve(value: ReviewLoad): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly workerFile: string) {}
  start(input: ReviewBuildInput): Promise<ReviewLoad> {
    this.close();
    const worker = new Worker(this.workerFile, { workerData: input });
    this.worker = worker;
    worker.on("message", (message: { id: number; result: ReviewLoad }) => {
      if (this.worker !== worker) return;
      const pending = this.pending.get(message.id);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); pending.resolve(message.result); }
    });
    worker.on("error", () => { if (this.worker === worker) this.close(); });
    worker.on("exit", () => { if (this.worker === worker) this.close(); });
    return this.seek(input.tick);
  }
  seek(tick: number): Promise<ReviewLoad> {
    if (!this.worker) return Promise.resolve({ status: "unavailable", reason: "cancelled" });
    const id = ++this.next;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.close(), 60_000);
      this.pending.set(id, { resolve, timer });
      this.worker!.postMessage({ id, tick });
    });
  }
  close(): void {
    const worker = this.worker; this.worker = undefined;
    for (const { resolve, timer } of this.pending.values()) { clearTimeout(timer); resolve({ status: "unavailable", reason: "cancelled" }); }
    this.pending.clear();
    if (worker) void worker.terminate();
  }
}
