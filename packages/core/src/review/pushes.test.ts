import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { extractPushes, toRecordingSec } from "./pushes";
import { parseGameRecord } from "./record";
import { attack, match, rec, sample, samples } from "./testHelpers";

it("groups own sends to one target and measures reserves and land from own samples", () => {
  const m = match(samples(0, 2200, tick => ({ tiles: 1000 + tick, troops: tick >= 1050 ? 500_000 : 600_000, t: tick / 10 + 7 })));
  const p = extractPushes(rec([attack(1000, "human002", 50_000), attack(1080, "human002", 40_000), attack(1500, null, 10_000)]), m);
  expect(p.map(x => [x.sends, x.sent, x.target])).toEqual([[2, 90_000, "human002"], [1, 10_000, null]]);
  expect(p[0]).toMatchObject({ rated: true, fractionBefore: 0.6, fractionAfter: 0.46, tilesBefore: 2000, tilesAfter: 2650 });
  expect(p[0]!.landChangePct).toBeCloseTo(32.5);
  expect(p[0]!.troopsPerTile).toBeCloseTo(90_000 / 650);
  expect(p[0]!.t).toBe(107); expect(toRecordingSec(m, 1000)).toBe(107);
});
it("ignores other players' sends and leaves pushes before coverage unrated", () => {
  const p = extractPushes(rec([attack(200, null, 5000), attack(3000, null, 5000, "OTHERCLI")]), match(samples(3440, 4440)));
  expect(p).toHaveLength(1); expect(p[0]!.rated).toBe(false); expect(p[0]!.landLostPct).toBeUndefined();
});
it("records the worst land dip even when some land is recovered", () => {
  const p = extractPushes(rec([attack(1000, null, 50_000)]), match(samples(0, 2000, tick => ({ tiles: tick < 1100 ? 1000 : tick < 1400 ? 820 : 900 }))));
  expect(p[0]).toMatchObject({ landLostPct: 18, landChangePct: -10, tilesAfter: 900 });
});
it("attaches a target name only for verified humans", () => {
  const r = rec([attack(1000, "human002", 50), attack(1300, "nation01", 50)]);
  expect(extractPushes(r, match()).map(p => p.targetName)).toEqual(["Player 2", undefined]);
  r.idsVerified = false;
  expect(extractPushes(r, match()).every(p => p.targetName === undefined && p.targetKind === "unknown")).toBe(true);
});
it("requires follow-up coverage unless the recording reaches elimination", () => {
  const r = rec([attack(1000, null, 5000)]);
  const m = match(samples(0, 1200));
  expect(extractPushes(r, m)[0]!.rated).toBe(false);
  m.outcome = "eliminated"; m.endedAtSec = 120;
  expect(extractPushes(r, m)[0]!.rated).toBe(true);
  m.endedAtSec = 200;
  expect(extractPushes(r, m)[0]!.rated).toBe(false);
});
it("keeps boats distinct from wilderness sends, including their IDs", () => {
  const p = extractPushes(rec([attack(1000, null, 100), { kind: "boat", tick: 1000, by: "OWNCLI00", troops: 200 },
    { kind: "boat", tick: 1100, by: "OWNCLI00", troops: 300 }]), match());
  expect(p.map(p => [p.boat, p.targetKind, p.sent])).toEqual([[false, "wilderness", 100], [true, "unknown", 500]]);
  expect(new Set(p.map(p => p.id)).size).toBe(2);
});
it("does not invent ratings from unknown sends, stale samples or zero denominators", () => {
  expect(extractPushes(rec([attack(1000, null, null)]), match())[0]!.rated).toBe(false);
  const stale = match([sample(900), sample(1100), sample(1600)]);
  expect(extractPushes(rec([attack(1000, null, 50)]), stale)[0]!.rated).toBe(false);
  const emptyLand = match(samples(0, 2000, () => ({ tiles: 0 })));
  expect(extractPushes(rec([attack(1000, null, 50)]), emptyLand)[0]!.rated).toBe(false);
  expect(extractPushes(rec([attack(1000, null, 50)]), match([sample(1000), sample(2000)]))[0]!.rated).toBe(false);
});
it("includes the grouping boundary and clamps an overdrawn reserve to zero", () => {
  const p = extractPushes(rec([attack(1000, null, 700_000), attack(1150, null, 10), attack(1301, null, 10)]), match());
  expect(p.map(p => p.sends)).toEqual([2, 1]);
  expect(p[0]!.fractionAfter).toBe(0);
});
it("finds at least three rated pushes in the captured game", () => {
  const fixture = (file: string) => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
  const p = extractPushes(parseGameRecord(fixture("team-record.json"))!, fixture("team-recording.json"));
  expect(p.filter(x => x.rated).length).toBeGreaterThanOrEqual(3);
});

it("subtracts all own sends sharing a baseline, including sends to another target", () => {
  const m = match(samples(0, 2000));
  const r = rec([attack(1001, null, 200_000), attack(1002, "human002", 200_000), attack(1003, null, 100_000)]);
  expect(extractPushes(r, m).map(p => p.fractionAfter)).toEqual([0.1, 0.2]);
  // A new observed sample resets the subtraction; those sends are already reflected.
  r.intents.push(attack(1051, "human002", 100_000));
  expect(extractPushes(r, m).map(p => p.fractionAfter)).toEqual([0.1, 0.2]);
});

it("does not rate a window with an unobserved interior land gap", () => {
  const m = match([sample(1000), sample(1600)]);
  expect(extractPushes(rec([attack(1000, null, 10_000)]), m)[0]!.rated).toBe(false);
  // The recorder intentionally samples every ten seconds in long games.
  const sparse = match(samples(0, 2000).filter(s => s.tick % 100 === 0));
  expect(extractPushes(rec([attack(1000, null, 10_000)]), sparse)[0]!.rated).toBe(true);
});

it("leaves a reserve unknown until a new sample after an unknown send", () => {
  const r = rec([attack(1001, null, null), attack(1002, "human002", 10_000), attack(1201, "human002", 10_000)]);
  expect(extractPushes(r, match()).map(p => p.rated)).toEqual([false, false, true]);
});

it("measures send share from troops available after earlier sends to every target", () => {
  const r = rec([attack(1001, null, 200_000), attack(1002, "human002", 200_000), attack(1003, null, 100_000)]);
  const p = extractPushes(r, match());
  // Wilderness commits 1/3, then 1/2 of what remains: 1 - (2/3 * 1/2).
  expect(p[0]!.sendShare).toBeCloseTo(2 / 3);
  expect(p[1]!.sendShare).toBe(0.5);
});
it("combines grouped sends across fresh samples without confusing reserve recovery with send size", () => {
  const r = rec([attack(1001, null, 300_000), attack(1101, null, 100_000)]);
  const m = match(samples(0, 2000, tick => ({ troops: tick >= 1100 ? 400_000 : 600_000 })));
  expect(extractPushes(r, m)[0]!.sendShare).toBe(0.625);
});
it("bounds overdrawn send shares and requires a valid troop baseline", () => {
  expect(extractPushes(rec([attack(1000, null, 700_000)]), match())[0]!.sendShare).toBe(1);
  expect(extractPushes(rec([attack(1000, null, 0)]), match())[0]!.sendShare).toBe(0);
  for (const troops of [0, -1, NaN]) {
    expect(extractPushes(rec([attack(1000, null, 50)]), match(samples(0, 2000, () => ({ troops }))))[0]!.rated).toBe(false);
  }
});

it("observes losses after gains inside the window, without counting earlier or later losses", () => {
  const m = match(samples(0, 2000, tick => ({ tiles: tick < 1000 ? 1500 : tick < 1100 ? 1000 : tick < 1200 ? 1200 : tick <= 1600 ? 1100 : 500 })));
  const p = extractPushes(rec([attack(1000, null, 50_000)]), m)[0]!;
  expect(p.landLostPct).toBe(0); // The original below-start loss used by the legacy Blunder rule.
  expect(p.landDrawdownPct).toBeCloseTo(100 / 1200 * 100);
});
