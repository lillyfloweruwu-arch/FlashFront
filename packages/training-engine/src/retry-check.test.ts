import { expect, it } from "vitest";
import { retryCheck } from "./retry-check";
it("derives send bounds from the retry reserve policy", () => {
  expect(retryCheck("sendSize", 30)).toEqual({ kind: "send", minSendPct: 0, maxSendPct: 100, minReservePct: 30 });
});
it("does not invent post locations or alliance targets", () => {
  expect(retryCheck("postsBeforePush", 30)).toBeUndefined();
  expect(retryCheck("allyDecision", 30)).toBeUndefined();
});
it("rejects invalid reserve policies", () => {
  expect(retryCheck("sendSize", NaN)).toBeUndefined();
  expect(retryCheck("sendSize", 101)).toBeUndefined();
});
