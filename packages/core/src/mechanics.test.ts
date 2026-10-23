import { describe, expect, it } from "vitest";
import { buildCost, maxTroops, projectedTroopsAt, RULES_VERSION, secondsToAfford, secondsToReach, secondsToReachTroops, simulateTroops, sweetSpotFraction, TICKS_PER_SECOND, troopGrowthPerSec, troopGrowthPerTick, unitCost } from "./mechanics";

it.each([[10, 20, 2, 5], [20, 20, 0, 0], [30, 20, -1, 0], [0, 20, 0, Infinity], [0, 20, -2, Infinity], [NaN, 20, 2, Infinity]])("time to reach %s -> %s at %s", (current, target, rate, expected) => {
  expect(secondsToReach(current!, target!, rate!)).toBe(expected);
  expect(secondsToAfford(current!, rate!, target!)).toBe(expected);
});

it("uses the tagged growth and capacity formulas", () => {
  expect(RULES_VERSION).toBe("0.35.2"); expect(TICKS_PER_SECOND).toBe(10);
  expect(troopGrowthPerTick(100, 100)).toBe(0);
  expect(troopGrowthPerTick(100, 0)).toBe(0);
  expect(troopGrowthPerTick(0, 100_000)).toBe(10);
  expect(troopGrowthPerSec(1000, 100_000)).toBe(troopGrowthPerTick(1000, 100_000) * 10);
  expect(maxTroops(1000, 0)).toBeCloseTo(226191, 0);
  expect(maxTroops(1000, 2) - maxTroops(1000, 0)).toBe(500_000);
});
it("prices levels, shared port/factory levels, defenses and units", () => {
  for (const type of ["City", "Port", "Factory"] as const) expect([0, 1, 2, 3, 4].map(n => buildCost(type, n))).toEqual([125_000, 250_000, 500_000, 1_000_000, 1_000_000]);
  expect([0, 1, 2, 3, 4, 5].map(n => buildCost("DefensePost", n))).toEqual([50_000, 100_000, 150_000, 200_000, 250_000, 250_000]);
  expect(buildCost("SAMLauncher", 0)).toBe(1_500_000); expect(buildCost("SAMLauncher", 1)).toBe(3_000_000);
  expect(buildCost("MissileSilo", 10)).toBe(1_000_000);
  expect([0, 1, 2, 3, 4].map(n => unitCost("Warship", n))).toEqual([250_000, 500_000, 750_000, 1_000_000, 1_000_000]);
  expect(unitCost("AtomBomb")).toBe(750_000); expect(unitCost("HydrogenBomb")).toBe(5_000_000);
  expect(unitCost("MIRV", 2)).toBe(55_000_000);
});
it.each([100_000, 430_000, 2_000_000])("finds the numerical growth peak for %s", max => {
  const fraction = sweetSpotFraction(max);
  expect(fraction).toBeGreaterThan(0.3); expect(fraction).toBeLessThan(0.5);
  const growth = troopGrowthPerTick(fraction * max, max);
  expect(growth).toBeGreaterThanOrEqual(troopGrowthPerTick(0.25 * max, max));
  expect(growth).toBeGreaterThanOrEqual(troopGrowthPerTick(0.7 * max, max));
  expect(growth).toBeGreaterThanOrEqual(troopGrowthPerTick((fraction - 0.001) * max, max));
  expect(growth).toBeGreaterThanOrEqual(troopGrowthPerTick((fraction + 0.001) * max, max));
  expect(sweetSpotFraction(max + 0.1)).toBe(fraction);
});
it("integrates per tick, caps horizons, and handles unreachable targets", () => {
  const growth = troopGrowthPerTick(1000, 100_000);
  expect(simulateTroops(1000, 100_000, 0.1)).toBe(1000 + growth);
  expect(simulateTroops(1000, 100_000, -1)).toBe(1000);
  expect(simulateTroops(1000, 100_000, 5000)).toBe(simulateTroops(1000, 100_000, 3600));
  expect(secondsToReachTroops(1000, 100_000, 500)).toBe(0);
  expect(secondsToReachTroops(1000, 100_000, 100_000)).toBe(Infinity);
  expect(secondsToReachTroops(1000, 100_000, 200_000)).toBe(Infinity);
  const seconds = secondsToReachTroops(1000, 100_000, 40_000);
  expect(simulateTroops(1000, 100_000, seconds)).toBeGreaterThanOrEqual(40_000);
  expect(simulateTroops(1000, 100_000, seconds - 0.1)).toBeLessThan(40_000);
  expect(secondsToReachTroops(0, 1e30, 1e29)).toBe(Infinity);
});
it("projects troops from the nonlinear model, not the snapshot rate", async () => {
  const { MockDataSource } = await import("./mock/MockDataSource");
  const self = new MockDataSource().getSnapshot().self!;
  self.troopGrowthPerSec = 0;
  expect(projectedTroopsAt(self, 30)).toBe(simulateTroops(self.troops, self.maxTroops, 30));
  expect(projectedTroopsAt(self, 30)).toBeGreaterThan(self.troops);
});

// Regression against the 2026-10-15 playtest (Steam v0.34.25). The game shows troops / 10, so the
// screenshot numbers are multiplied by 10 to get internal units; displayed growth is the formula / 10.
describe("matches live game readouts", () => {
  it.each([
    ["00:33", 13_500, 35_300, 865],
    ["03:34", 63_400, 179_000, 2_780],
    ["05:34", 139_000, 287_000, 3_940],
    ["06:44", 307_000, 381_000, 2_650],
    ["07:34", 68_800, 430_000, 3_840],
  ])("%s growth readout", (_t, shownTroops, shownMax, shownRate) => {
    const displayed = troopGrowthPerSec(shownTroops * 10, shownMax * 10) / 10;
    expect(Math.abs(displayed - shownRate) / shownRate).toBeLessThan(0.02);
  });
});
