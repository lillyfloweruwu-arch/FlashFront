import { parentPort, workerData } from "node:worker_threads";
import type { RecordDrillInput } from "./record-drill";
import { buildRecordDrill } from "../training-client/record-drill-build";
// One request per worker. The host terminates it when Training closes or a live match starts.
void buildRecordDrill(workerData as RecordDrillInput).then(result => {
  if (result.status === "ready") parentPort?.postMessage(result, [result.value.snapshot.buffer as ArrayBuffer]);
  else parentPort?.postMessage(result);
  parentPort?.close();
});
