import { parentPort, workerData } from "node:worker_threads";
import { ReplaySnapshots } from "../training-client/review-snapshots";
import type { ReviewBuildInput } from "../review-types";
const input = workerData as ReviewBuildInput;
const snapshots = new ReplaySnapshots(input.record, input.ownClientId, input.map);
let queue = Promise.resolve();
parentPort?.on("message", (message: { id: number; tick: number }) => {
  queue = queue.then(async () => {
    const result = await snapshots.seek(message.tick);
    // Keep the cache's buffers owned by this worker; structured clone isolates the renderer.
    parentPort?.postMessage({ id: message.id, result });
  });
});
