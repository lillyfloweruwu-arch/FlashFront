import { expect, it } from "vitest";
import { gameReview } from "../review/review";
import { attack, match, rec, samples } from "../review/testHelpers";
import { retryFeedback } from "./retry-feedback";

const START = 4900;
const growing = (end: number) => samples(START, end, (tick) => ({ tiles: 1000 + Math.max(0, tick - START) / 5 }));
const trace = (intents: Parameters<typeof rec>[0], end = 5600) => ({ record: rec(intents), match: match(growing(end), { durationSec: (end - START) / 10 }) });

it("feedback is exactly C's review of the branch, with the same reserve floor", () => {
  const t = trace([attack(4910, null, 100_000)]);
  const fb = retryFeedback(t, 30, "sendSize");
  expect(fb.review).toEqual(gameReview(t.record, t.match, { reserveFloorPct: 30 }));
});

it("a rated good send with a safe reserve counts as improved for send size", () => {
  const fb = retryFeedback(trace([attack(4910, null, 100_000)]), 30, "sendSize");
  expect(fb.review.pushes.some((p) => p.label === "good" || p.label === "great")).toBe(true);
  expect(fb.verdict).toBe("improved");
  expect(fb.line).toMatch(/^Attack coach: /);
});

it("a push without a full window of evidence stays unavailable, never improved", () => {
  const fb = retryFeedback(trace([attack(5500, null, 100_000)]), 30, "sendSize");
  expect(fb.review.pushes.filter((p) => p.label).length).toBe(0);
  expect(fb.verdict).toBe("unavailable");
});

it("not sending at all on a send-size retry is unavailable, not a success", () => {
  expect(retryFeedback(trace([]), 30, "sendSize").verdict).toBe("unavailable");
});

it("an exposing send is needs practice", () => {
  const t = { record: rec([attack(4910, null, 500_000)]), match: match(samples(START, 5600, (tick) => ({ troops: tick > 4910 ? 100_000 : 600_000, tiles: tick > 5000 ? 900 : 1000 })), { durationSec: 70 }) };
  const fb = retryFeedback(t, 30, "sendSize");
  expect(fb.review.pushes.some((p) => p.label === "costly" || p.label === "blunder")).toBe(true);
  expect(fb.verdict).toBe("needsPractice");
});

it("posts and ally retries without applicable evidence are unavailable with a plain line", () => {
  for (const m of ["postsBeforePush", "allyDecision"] as const) {
    const fb = retryFeedback(trace([]), 30, m);
    expect(fb.verdict).toBe("unavailable");
    expect(fb.line).not.toMatch(/undefined|NaN|\{/);
  }
});

it("an ally retry is never judged from a window shorter than C's two-minute ally evidence", () => {
  const t = { record: rec([{ kind: "allianceReject", tick: 4920, by: "OWNCLI00", requestor: "human002" }]), match: match(growing(5500), { durationSec: 60 }) };
  const fb = retryFeedback(t, 30, "allyDecision");
  expect(fb.verdict).toBe("unavailable");
  expect(fb.line).toMatch(/two minutes/);
});
