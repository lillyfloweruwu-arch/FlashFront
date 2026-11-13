import { expect, it } from "vitest";
import type { GameReview, KeyMoment } from "@flashfront/core";
import { reviewCoachLine, reviewHeadline, retryRequest } from "./review-presentation";
const moment: KeyMoment = { tick: 4900, t: 370, kind: "push", mistake: "sendSize", landLostPct: 18, text: "Excluded identity" };
it("uses absolute ticks for retry and recording time for the observed-cost headline", () => {
  expect(retryRequest("recording.json", moment)).toEqual({ kind: "retry", file: "recording.json", tick: 4900, mistake: "sendSize" });
  expect(retryRequest("recording.json", { ...moment, mistake: undefined })).toBeUndefined();
  const headline = reviewHeadline({ keyMoments: [moment] } as GameReview);
  expect(headline).toContain("Head coach"); expect(headline).toContain("6:10"); expect(headline).toContain("18%");
  expect(headline).toContain("land fell"); expect(headline).not.toContain(moment.text);
  expect(reviewHeadline({ keyMoments: [] } as unknown as GameReview)).toBe("No clear costly moment in these observations.");
});

it("the review coach line speaks as the mistake's role, with the observed time and cost and no names", () => {
  const review = { keyMoments: [moment], players: [{ name: "Excluded identity" }] } as unknown as GameReview;
  const first = reviewCoachLine(review)!;
  expect(first.text).toMatch(/^At 6:10, land fell 18%\. Attack coach: /);
  expect(first.text).not.toContain("Excluded identity");
  const second = reviewCoachLine(review, first.id)!;
  expect(second.id).not.toBe(first.id);
  expect(second.text).toMatch(/^At 6:10, land fell 18%\. /);
  expect(reviewCoachLine({ keyMoments: [{ ...moment, mistake: undefined }] } as GameReview)).toBeUndefined();
});
