import { expect, it } from "vitest";
import { labelPushes } from "./labels";
import type { OwnPush } from "./pushes";

const push = (overrides: Partial<OwnPush> = {}): OwnPush => ({
  id: "push", startTick: 1000, endTick: 1000, t: 100, target: null, targetKind: "wilderness", boat: false,
  sends: 1, sent: 1000, rated: true, fractionBefore: 0.6, fractionAfter: 0.5, tilesBefore: 1000,
  tilesAfter: 1010, landChangePct: 1, landLostPct: 0, sendShare: 1 / 6, troopsPerTile: 100, ...overrides,
});
const floor = 35;
it("labels a below-quarter reserve plus land loss as a Blunder first", () => {
  expect(labelPushes([push({ fractionAfter: 0.2, landLostPct: 5 })], floor)[0]).toMatchObject({ label: "blunder", reason: "lowReserveLostLand" });
  expect(labelPushes([push({ fractionAfter: 0.25, landLostPct: 1 })], floor)[0]).toMatchObject({ label: "costly", reason: "lowReserve" });
});
it("weights any following loss by send share instead of blaming a probe for all of it", () => {
  const [probe, large] = labelPushes([0.01, 0.5].map(sendShare => push({ sendShare, landLostPct: 10, landChangePct: -10 })), floor);
  expect(probe).toMatchObject({ label: "neutral", reason: "noLand", blameWeight: 0.01, blamedLandLostPct: 0.1, accuracyCredit: 0.996 });
  expect(large).toMatchObject({ label: "costly", reason: "lostLand", blameWeight: 0.5, blamedLandLostPct: 5, accuracyCredit: 0.8 });
});
it("labels reserves below the selected floor as Costly without land loss", () => {
  expect(labelPushes([push({ fractionAfter: 0.3, landLostPct: 0, landChangePct: 4 })], floor)[0]).toMatchObject({ label: "costly", reason: "lowReserve" });
});
it("keeps a safe no-gain push Neutral and gives it full accuracy credit without loss", () => {
  expect(labelPushes([push({ landChangePct: 0 })], floor)[0]).toMatchObject({ label: "neutral", reason: "noLand", accuracyCredit: 1 });
  expect(labelPushes([push({ landLostPct: 0.5, landChangePct: 0 })], floor)[0]!.label).toBe("neutral");
});
it("scales credit with land loss and reaches Blunder at a quarter of land blamed", () => {
  const result = labelPushes([2, 20, 50, 80].map(landLostPct => push({ sendShare: 0.5, landLostPct })), floor);
  expect(result.map(p => p.label)).toEqual(["costly", "costly", "blunder", "blunder"]);
  expect(result.map(p => p.accuracyCredit)).toEqual([0.96, 0.6, 0, 0]);
  expect(result[2]!.reason).toBe("largeLoss");
});
it("uses a continuous clamped linear blame curve and the meaningful loss boundary", () => {
  const result = labelPushes([-1, 0, 0.099, 0.1, 0.101, 1, 2].map(sendShare => push({ sendShare, landLostPct: 10 })), floor);
  expect(result.map(p => p.blameWeight)).toEqual([0, 0, 0.099, 0.1, 0.101, 1, 1]);
  expect(result.map(p => p.label)).toEqual(["good", "good", "good", "costly", "costly", "costly", "costly"]);
  expect(result[2]!.accuracyCredit! - result[4]!.accuracyCredit!).toBeCloseTo(0.0008);
});
it("scales reserve cost by shortfall and following loss reduces the remaining credit", () => {
  const result = labelPushes([0.35, 0.3, 0.175, 0].map(fractionAfter => push({ fractionAfter })), floor);
  expect(result.map(p => p.label)).toEqual(["good", "costly", "costly", "costly"]);
  expect(result[1]!.accuracyCredit).toBeCloseTo(6 / 7);
  expect(result[2]!.accuracyCredit).toBe(0.5);
  expect(result[3]!.accuracyCredit).toBe(0);
  const weakened = [0, 2, 10].map(landLostPct =>
    labelPushes([push({ fractionAfter: 0.3, sendShare: 0.5, landLostPct })], floor)[0]!.accuracyCredit!);
  expect(weakened[0]).toBeCloseTo(6 / 7);
  expect(weakened[1]).toBeCloseTo(6 / 7 * 0.96);
  expect(weakened[2]).toBeCloseTo(6 / 7 * 0.8);
  expect(labelPushes([push({ fractionAfter: 0, landChangePct: 0 })], 0)[0]).toMatchObject({ label: "neutral", accuracyCredit: 1 });
});
it("preserves the original low-reserve Blunder even for a small send", () => {
  expect(labelPushes([push({ fractionAfter: 0.2, landLostPct: 1, sendShare: 0.01 })], floor)[0])
    .toMatchObject({ label: "blunder", reason: "lowReserveLostLand", accuracyCredit: 0 });
});
it("does not invent blame or a score when send share is unknown", () => {
  expect(labelPushes([push({ sendShare: undefined })], floor)[0]).toMatchObject({ rated: false });
  expect(labelPushes([push({ sendShare: undefined })], floor)[0]!.label).toBeUndefined();
});
it("charges losses of recently gained land but does not change the legacy Blunder trigger", () => {
  expect(labelPushes([push({ landLostPct: 0, landDrawdownPct: 10, sendShare: 0.5 })], floor)[0])
    .toMatchObject({ label: "costly", blamedLandLostPct: 5, accuracyCredit: 0.8 });
  expect(labelPushes([push({ fractionAfter: 0.2, landLostPct: 0, landDrawdownPct: 10, sendShare: 0.5 })], floor)[0]!.label).toBe("costly");
});
it("labels positive land and reserves at or above the floor as Good", () => {
  expect(labelPushes([push({ fractionAfter: 0.35, landChangePct: 2 })], floor)[0]).toMatchObject({ label: "good", reason: "gained" });
});
it("labels efficient pushes Great using at least three other comparable pushes", () => {
  const pushes = [100, 100, 100, 60].map(troopsPerTile => push({ troopsPerTile }));
  expect(labelPushes(pushes, floor).map(p => p.label)).toEqual(["good", "good", "good", "great"]);
  expect(labelPushes(pushes.slice(1), floor).map(p => p.label)).toEqual(["good", "good", "good"]);
  expect(labelPushes([push({ troopsPerTile: 75 }), ...pushes.slice(0, 3)], floor)[0]).toMatchObject({ label: "great", reason: "efficient" });
});
it("keeps human, wilderness and boat efficiency baselines separate", () => {
  const humans = [100, 100, 100].map(troopsPerTile => push({ targetKind: "human", troopsPerTile }));
  expect(labelPushes([push({ troopsPerTile: 60 }), ...humans], floor)[0]!.label).toBe("good");
  const unknown = [100, 100, 100].map(troopsPerTile => push({ targetKind: "unknown", troopsPerTile }));
  expect(labelPushes([push({ targetKind: "unknown", boat: true, troopsPerTile: 60 }), ...unknown], floor)[0]!.label).toBe("good");
});
it("excludes the judged push and averages the middle two comparable costs", () => {
  const list = [350, 10, 20, 1000, 2000].map(troopsPerTile => push({ troopsPerTile }));
  // Other median is (20 + 1000) / 2 = 510; 350 <= 75% of 510.
  expect(labelPushes(list, floor)[0]!.label).toBe("great");
});
it("excludes unrated, nongaining and low-reserve pushes from comparison", () => {
  const list = [push({ troopsPerTile: 60 }), push({ rated: false }), push({ landChangePct: 0 }), push({ fractionAfter: 0.2 })];
  expect(labelPushes(list, floor)[0]!.label).toBe("good");
});
it("leaves unrated pushes unlabelled and does not mutate inputs", () => {
  const list = [push({ rated: false }), push()]; const before = structuredClone(list);
  expect(labelPushes(list, floor)[0]!.label).toBeUndefined();
  expect(labelPushes(list, floor)[0]!.reason).toBeUndefined();
  expect(list).toEqual(before);
});
