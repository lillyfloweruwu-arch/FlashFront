import { expect, it } from "vitest";
import { readHardware } from "./hardware";

it("prefers availableParallelism and falls back to the CPU list", () => {
  expect(readHardware({ availableParallelism: () => 6, cpus: () => [], totalmem: () => 8 })).toEqual({ cpus: 6, totalMemBytes: 8 });
  expect(readHardware({ cpus: () => [1, 2], totalmem: () => 8 })).toEqual({ cpus: 2, totalMemBytes: 8 });
  expect(readHardware({ cpus: () => [], totalmem: () => 0 })).toEqual({ cpus: 0, totalMemBytes: 0 });
});
