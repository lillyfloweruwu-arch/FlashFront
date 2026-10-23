import { expect, it, vi } from "vitest";
import { HeatJobs } from "./hud/heat-jobs";

it("keeps one job in flight, replaces pending positions and discards hidden results", () => {
  const send = vi.fn(); const paint = vi.fn();
  const jobs = new HeatJobs<number>(send, paint);
  jobs.update(1, false); expect(send).not.toHaveBeenCalled();
  jobs.update(2, true); jobs.update(3, true); jobs.update(4, true);
  expect(send.mock.calls).toEqual([[2]]);
  jobs.complete(new Uint8ClampedArray(4));
  expect(send.mock.calls).toEqual([[2], [4]]);
  jobs.update(5, false); jobs.complete(new Uint8ClampedArray(4));
  expect(paint).toHaveBeenCalledTimes(1);
  jobs.update(6, true); expect(send.mock.calls.at(-1)).toEqual([6]);
});
it("does not paint a previous activation's late result", () => {
  const send = vi.fn(); const paint = vi.fn(); const jobs = new HeatJobs<number>(send, paint);
  jobs.update(1, true); jobs.update(2, false); jobs.update(3, true);
  jobs.complete(new Uint8ClampedArray(4)); expect(paint).not.toHaveBeenCalled();
  expect(send.mock.calls).toEqual([[1], [3]]);
  jobs.complete(new Uint8ClampedArray(4)); expect(paint).toHaveBeenCalledTimes(1);
});
