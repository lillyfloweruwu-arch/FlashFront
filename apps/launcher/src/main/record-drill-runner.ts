import { Worker } from "node:worker_threads";
import type { RecordDrillInput, RecordDrillResult } from "./record-drill";

/** One bounded rebuild at a time; cancelling Training also stops CPU work. */
export class RecordDrillRunner {
  private cancel?: () => void;
  stop(): void { this.cancel?.(); }
  run(input: RecordDrillInput): Promise<RecordDrillResult> {
    this.stop();
    return new Promise(resolve => {
      const worker = new Worker(new URL("./record-drill.worker.js", import.meta.url), { workerData: input });
      let settled = false;
      const finish = (result: RecordDrillResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.cancel = undefined;
        void worker.terminate(); resolve(result);
      };
      const timer = setTimeout(() => finish({ status: "unavailable", reason: "historyLimit" }), 60_000);
      this.cancel = () => finish({ status: "unavailable", reason: "cancelled" });
      worker.once("message", finish);
      worker.once("error", () => finish({ status: "unavailable", reason: "invalidRecord" }));
      worker.once("exit", () => finish({ status: "unavailable", reason: "invalidRecord" }));
    });
  }
}
