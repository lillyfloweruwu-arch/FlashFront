import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accuracyGames } from "./fixtures/accuracy-games";
import { parseGameRecord } from "./record";
import { gameReview } from "./review";

// These results use continuous send-size blame and Neutral credit rather than binary Good/Great counts.

it("reproduces the synthetic balanced and costly games for the owner formula checkpoint", () => {
  const results = accuracyGames.map(({ record, recording }) => gameReview(record, recording, { reserveFloorPct: 35 }));
  expect(results[0]).toMatchObject({ counts: { great: 0, good: 3, neutral: 1, costly: 0, blunder: 0 },
    accuracy: { rated: 4, goodOrGreat: 3, neutral: 1, base: 100, opening: 5, defense: 2, value: 100 } });
  expect(results[1]).toMatchObject({ counts: { great: 0, good: 0, costly: 0, blunder: 4, neutral: 0 },
    accuracy: { rated: 4, goodOrGreat: 0, neutral: 0, base: 0, opening: -5, defense: -10, value: 0 } });
});

it("reports three reproducible fixture games without any real identities", () => {
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
  const captured = gameReview(parseGameRecord(fixture("team-record.json"))!, fixture("team-recording.json"), { reserveFloorPct: 35 });
  const rows = [captured, ...accuracyGames.map(({ record, recording }) => gameReview(record, recording, { reserveFloorPct: 35 }))]
    .map((r, i) => ({ example: ["captured", "synthetic balanced", "synthetic costly"][i], counts: r.counts,
      coverage: r.coverage, accuracy: r.accuracy }));
  if (process.env.FLASHFRONT_REVIEW_EXAMPLES) console.log(JSON.stringify(rows, null, 2));
  expect(captured).toMatchObject({ counts: { great: 2, good: 7, costly: 22, blunder: 0, neutral: 0 },
    coverage: { ratedPushes: 31, totalPushes: 33 },
    accuracy: { rated: 31, goodOrGreat: 9, opening: 5, defense: 4, value: 82, neutral: 0 } });
  expect(captured.accuracy.base).toBeCloseTo(73.3436417615445, 8);
});
