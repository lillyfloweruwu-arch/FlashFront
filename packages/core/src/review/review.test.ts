import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseGameRecord } from "./record";
import { gameReview } from "./review";
import { attack, match, rec, samples } from "./testHelpers";

const dir = new URL("./fixtures/", import.meta.url);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));

it("reviews the captured game end to end", () => {
  const json = fixture("team-record.json"), recording = fixture("team-recording.json");
  const review = gameReview(parseGameRecord(json)!, recording, { reserveFloorPct: 35 });
  const counted = Object.values(review.counts).reduce((a, b) => a + b, 0);
  expect(counted).toBe(review.coverage.ratedPushes);
  expect(review.accuracy.rated).toBe(review.coverage.ratedPushes);
  expect(review.coverage.totalPushes).toBe(review.pushes.length);
  expect(review.keyMoments.length).toBeLessThanOrEqual(5);
  expect(review.keyMoments.every((m, k) => k === 0 || m.landLostPct <= review.keyMoments[k - 1]!.landLostPct)).toBe(true);
  const text = JSON.stringify(review);
  const others = (json.info.players as { clientID: string }[]).map(p => p.clientID).filter(id => id !== recording.me.clientId);
  for (const id of others) expect(text).not.toContain(id);
  const names = [...text.matchAll(/"(\w+)":"Player \d+"/g)].map(m => m[1]);
  expect(new Set(names).size === 0 || [...new Set(names)].every(k => k === "name" || k === "targetName")).toBe(true);
});
it("names attackers and ally partners without their client ids", () => {
  const r = rec([attack(1000, "own00000", 5000, "OTHERCLI"), { kind: "allianceRequest", tick: 900, by: "OTHERCLI", to: "own00000" }]);
  const review = gameReview(r, match(samples()), { reserveFloorPct: 35 });
  expect(review.waves[0]!.attackers).toEqual([{ name: "Player 2" }]);
  expect(review.allies[0]!.other).toEqual({ playerId: "human002", kind: "human", name: "Player 2" });
  expect(JSON.stringify(review)).not.toContain("OTHERCLI");
});
it("a match not in the record is not reviewed", () => {
  expect(() => gameReview(rec(), match(samples(), { me: { clientId: "NOTHERE0" } }), { reserveFloorPct: 35 })).toThrow("notInRecord");
});

it("places the opening moment on the recording clock, and never after coverage ends", () => {
  const shifted = match(samples(200, 4000).map(s => ({ ...s, t: (s.tick - 200) / 10 })));
  const review = gameReview(rec(), shifted, { reserveFloorPct: 35 });
  expect(review.keyMoments.find(m => m.kind === "opening")).toMatchObject({ tick: 3000, t: 280,
    text: "4:40 no alliance by five minutes in." });
  const short = gameReview(rec(), match(samples(0, 2000)), { reserveFloorPct: 35 });
  expect(short.keyMoments.some(m => m.kind === "opening")).toBe(false);
  expect(short.accuracy.opening).toBe(0);
});

it("blames loss to any attacker equally, including an unrelated target and unidentified attacks", () => {
  const m = match(samples(0, 2000, tick => ({ tiles: tick >= 1100 ? 900 : 1000 })));
  const reviews = ["human002", "nation01", null].map(target => gameReview(rec([
    attack(1000, target, 120_000), attack(1050, "own00000", 50_000, "OTHERCLI"),
  ]), m, { reserveFloorPct: 35 }));
  const unverified = rec([attack(1000, null, 120_000)]); unverified.idsVerified = false;
  reviews.push(gameReview(unverified, m, { reserveFloorPct: 35 }));
  for (const r of reviews) expect(r.pushes[0]).toMatchObject({ label: "costly", sendShare: 0.2, blamedLandLostPct: 2, accuracyCredit: 0.92 });
});

it("keeps safe no-gain pushes rated and includes Neutral credit in the accuracy base", () => {
  const r = gameReview(rec([500, 1300, 2100].map(tick => attack(tick, null, 10_000))), match(), { reserveFloorPct: 35 });
  expect(r.counts).toEqual({ great: 0, good: 0, neutral: 3, costly: 0, blunder: 0 });
  expect(r.accuracy).toMatchObject({ rated: 3, goodOrGreat: 0, neutral: 3, base: 100 });
  expect(r.coverage).toMatchObject({ ratedPushes: 3, totalPushes: 3 });
  expect(r.keyMoments.some(m => m.kind === "push")).toBe(false);
});

it("a probe barely counts while a large send followed by an unrelated attack costs more credit", () => {
  const reviewPush = (sent: number, tiles: number) => gameReview(rec([
    attack(1000, null, sent), attack(1050, "own00000", 50_000, "OTHERCLI"),
  ]), match(samples(0, 2000, tick => ({ tiles: tick >= 1100 ? tiles : 1000 }))),
  { reserveFloorPct: 35 }).pushes[0]!;
  const probe = reviewPush(6000, 900);
  expect(probe).toMatchObject({ label: "neutral", blamedLandLostPct: 0.1, accuracyCredit: 0.996 });
  const safe = reviewPush(300_000, 1000), attacked = reviewPush(300_000, 900);
  expect(attacked).toMatchObject({ label: "costly", blamedLandLostPct: 5 });
  expect(attacked.accuracyCredit).toBeCloseTo(safe.accuracyCredit! * 0.8);
  expect(reviewPush(300_000, 500)).toMatchObject({ label: "blunder", reason: "largeLoss", accuracyCredit: 0 });
});
