import { describe, expect, it } from "vitest";
import { atGrowthCap, attackPreview, percentOfMax, stableZone, troopZone, zoneLabel, zoneStatus } from "./attack";
import { simulateTroops, troopGrowthPerSec } from "./mechanics";

it("previews the playtest sends and recovery", () => {
  const preview = attackPreview(307_000, 381_000, 0.3);
  expect(preview.sent).toBe(92_100); expect(preview.remaining).toBe(214_900);
  expect(preview.zoneNow).toBe("wasting"); expect(preview.zoneAfter).toBe("high");
  expect(preview.remainingFraction).toBe(214_900 / 381_000);
  expect(preview.secondsBackToSweet).toBe(0);
  expect(preview.growthAfterPerSec).toBe(troopGrowthPerSec(preview.remaining, 381_000));
  const exposed = attackPreview(300_000, 430_000, 0.8);
  expect(exposed.zoneAfter).toBe("exposed"); expect(exposed.sent).toBe(240_000);
  expect(exposed.secondsBackToSweet).toBeGreaterThan(0);
  expect(simulateTroops(exposed.remaining, 430_000, exposed.secondsBackToSweet)).toBeGreaterThanOrEqual(exposed.sweet * 430_000);
});
it("floors sends and bounds invalid ratios without nonfinite results", () => {
  expect(attackPreview(101, 1000, 0.3).sent).toBe(30);
  expect(attackPreview(101, 1000, 2).remaining).toBe(0);
  expect(attackPreview(101, 1000, -1).sent).toBe(0);
  expect(attackPreview(0, 0, 0).remainingFraction).toBe(0);
  expect(attackPreview(NaN, NaN, NaN).growthNowPerSec).toBe(0);
});
it("assigns exact threshold boundaries", () => {
  const sweet = 0.42;
  expect(troopZone(0.2499, sweet)).toBe("exposed");
  expect(troopZone(0.25, sweet)).toBe("low");
  expect(troopZone(sweet - 0.08, sweet)).toBe("sweet");
  expect(troopZone(sweet + 0.08, sweet)).toBe("sweet");
  expect(troopZone(0.5001, sweet)).toBe("high");
  expect(troopZone(0.6999, sweet)).toBe("high");
  // One 70% threshold with the gauge's truncation: the zone turns when the gauge first reads 70%.
  expect(troopZone(0.7, sweet)).toBe("wasting");
  expect(troopZone(0.7001, sweet)).toBe("wasting");
});

describe("stableZone hysteresis", () => {
  it("keeps the previous zone until the value is clearly past a boundary", () => {
    expect(stableZone("high", 0.705, 0.42)).toBe("high");      // just over 0.70: stay
    expect(stableZone("high", 0.73, 0.42)).toBe("wasting");    // clearly over
    expect(stableZone("wasting", 0.69, 0.42)).toBe("wasting"); // just under: stay
    expect(stableZone("wasting", 0.67, 0.42)).toBe("high");
    expect(stableZone(undefined, 0.705, 0.42)).toBe("wasting");
    expect(stableZone("exposed", 0.9, 0.42)).toBe("wasting");  // big jumps are immediate
  });
});
it("names zones with the HUD vocabulary and never says high", () => {
  expect((["exposed", "low", "sweet", "high", "wasting"] as const).map(zoneLabel)).toEqual(["exposed", "low", "sweet spot", "above sweet spot", "growth slowing"]);
  expect((["exposed", "low", "sweet", "high", "wasting"] as const).map(zoneStatus)).toEqual(["exposed · under 25% of max", "low · rebuilding", "sweet spot", "above sweet spot", "growth slowing · 70% of max or more"]);
});
it("truncates percent of max once for gauge, zones and the practice goal", () => {
  expect(percentOfMax(0.29)).toBe(29); // 0.29 * 100 is 28.999… in floating point
  expect(percentOfMax(0.6999)).toBe(69); expect(percentOfMax(0.7)).toBe(70);
  expect(atGrowthCap(0.6999)).toBe(false); expect(atGrowthCap(0.7)).toBe(true);
});
