import * as nodeOs from "node:os";
import type { Hardware } from "../shared";

export function readHardware(
  os: {
    availableParallelism?: () => number;
    cpus: () => unknown[];
    totalmem: () => number;
  } = nodeOs
): Hardware {
  return {
    cpus: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
    totalMemBytes: os.totalmem(),
  };
}
