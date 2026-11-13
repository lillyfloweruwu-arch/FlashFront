import { expect, it } from "vitest";
import { accuracy } from "./accuracy";
import type { LabelledPush, PushLabel } from "./labels";
import type { Opening } from "./allies";
import { REVIEW_THRESHOLDS } from "./thresholds";
import type { IncomingWave } from "./waves";

const push = (label?: PushLabel): LabelledPush => ({
  id: "p", startTick: 0, endTick: 0, t: 0, target: null, targetKind: "wilderness", boat: false, sends: 1, sent: 1, rated: label !== undefined, label,
  accuracyCredit: label === undefined ? undefined : label === "costly" || label === "blunder" ? 0 : 1,
});
const wave = (post: IncomingWave["post"], landLostPct = 0, rated = true): IncomingWave => ({ startTick: 0, t: 0, attackers: [], source: "recording", post, rated, landLostPct });
const [g, gr, c, b, unrated] = [push("good"), push("great"), push("costly"), push("blunder"), push()];
const na: Opening = { applicable: false };

it("averages push credit rather than counting successful labels", () => {
  expect(accuracy([g, g, gr, c], [], na)).toMatchObject({ value: 75, base: 75, rated: 4, goodOrGreat: 3, opening: 0, defense: 0 });
  expect(accuracy([g, push("neutral"), { ...c, accuracyCredit: 0.7 }, b, unrated], [], na))
    .toMatchObject({ value: 68, base: 67.5, rated: 4, goodOrGreat: 1, neutral: 1 });
  expect(accuracy([{ ...c, accuracyCredit: 0.6 }, { ...c, accuracyCredit: 0.7 }, { ...c, accuracyCredit: 0.8 }], [], na).base).toBeCloseTo(70);
});
it("adds the opening bonus or penalty only when applicable", () => {
  expect(accuracy([g, g, gr, c], [], { applicable: true, portSec: 200, allySec: 250 }).value).toBe(80);
  expect(accuracy([g, g, gr, c], [], { applicable: true, portSec: 200 })).toMatchObject({ opening: 0, value: 75 });
  expect(accuracy([g, g, gr, c], [], { applicable: true, portSec: 301, allySec: 400 })).toMatchObject({ opening: -5, value: 70 });
  expect(accuracy([g, g, gr, c], [], { applicable: false, portSec: 200, allySec: 250 }).opening).toBe(0);
});
it("scores defense timing on rated waves and clamps it", () => {
  expect(accuracy([g, g, gr, c], [wave("onTime"), wave("none", 5)], na)).toMatchObject({ base: 75, defense: -1, value: 74 });
  expect(accuracy([g, g, gr, c], [wave("late", 0.5), wave("none", 5, false)], na).defense).toBe(0);
  expect(accuracy([g, g, g], Array(8).fill(wave("onTime")), na)).toMatchObject({ defense: 10, value: 100 });
});
it("is unavailable, never 0%, under 3 rated pushes", () => {
  const a = accuracy([g, g], [], na);
  expect(a).toMatchObject({ reason: "fewPushes", rated: 2 });
  expect([a.value, a.base]).toEqual([undefined, undefined]);
});
it("clamps to 0 and counts only rated pushes", () => {
  expect(accuracy([b, b, b], Array(6).fill(wave("none", 9)), { applicable: true }).value).toBe(0);
  expect(accuracy([g, g, g, unrated], [], na).rated).toBe(3);
  expect(accuracy([g, g, { ...g, rated: false }, { ...g, accuracyCredit: undefined }], [], na)).toMatchObject({ rated: 2, reason: "fewPushes" });
});
it("pins the continuous blame formula and unchanged opening/defense weights", () => {
  const { accuracyMinRated, openingSec, openingBonus, defenseOnTime, defenseMissed, defenseCap,
    lossTolerancePct, blunderReserve, lossBlameExponent, blunderLossPct, landWindowSec } = REVIEW_THRESHOLDS;
  expect({ accuracyMinRated, openingSec, openingBonus, defenseOnTime, defenseMissed, defenseCap,
    lossTolerancePct, blunderReserve, lossBlameExponent, blunderLossPct, landWindowSec }).toMatchInlineSnapshot(`
    {
      "accuracyMinRated": 3,
      "blunderLossPct": 25,
      "blunderReserve": 0.25,
      "defenseCap": 10,
      "defenseMissed": 3,
      "defenseOnTime": 2,
      "landWindowSec": 60,
      "lossBlameExponent": 1,
      "lossTolerancePct": 1,
      "openingBonus": 5,
      "openingSec": 300,
    }
  `);
});
