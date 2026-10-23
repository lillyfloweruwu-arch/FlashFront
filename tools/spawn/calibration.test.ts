import { expect, it } from "vitest";
import { readCachedMap } from "./fetch-maps.ts";
import { landExits, percentileRanks, reasonsFor, scoreMap, selectPicks, spacingFor, type ReasonTerms } from "./score.ts";

const neutral: ReasonTerms = { reach120: 0, largestLandmass: false, componentShare: 0.5, closure: 0.5, exits: 0, defense: 0, coast: 0, nationDistance: Infinity, edge: 0.5 };
const rules: [Partial<ReasonTerms>, string, boolean?][] = [
  [{ reach120: 0.98 }, "Biggest cheap-land pocket nearby (top 2% of map)"],
  [{ reach120: 0.9 }, "Biggest cheap-land pocket nearby (top 10% of map)"],
  [{ reach120: 0.7 }, "Plenty of cheap land within 120 tiles"],
  [{ largestLandmass: true, componentShare: 1 }, "On the main landmass"],
  [{ componentShare: 0.09 }, "Island start: port-dependent, slow early growth", true],
  [{ closure: 0.04, exits: 1 }, "Open on all sides: watch every front"],
  [{ closure: 0.5, exits: 1 }, "One land front, 50% of horizon closed"],
  [{ exits: 2 }, "Two land exits"],
  [{ exits: 3 }, "3 land exits: hard to wall off"],
  [{ defense: 0.5 }, "Mountain core: defends well"],
  [{ defense: 0.25 }, "Hilly core"],
  [{ coast: 1 }, "Shore within 24 tiles: early port possible"],
  [{ nationDistance: 79 }, "AI nation anchor 79 tiles away: expect early pressure", true],
  [{ edge: 0.09 }, "Hugs the map edge: one side is dead space", true],
];
it.each(rules)("implements the calibration reason rule %j", (change, text, warning) => {
  const result = reasonsFor({ ...neutral, ...change });
  expect(warning ? result.warning : result.reasons[0]).toBe(text);
});
it("keeps one warning independent of the top three reasons, in reference salience order", () => {
  const rich = { ...neutral, reach120: 0.99, largestLandmass: true, defense: 1, coast: 1, exits: 2 };
  for (const [change, text, warning] of rules.filter(r => r[2])) {
    const result = reasonsFor({ ...rich, ...change, largestLandmass: false });
    expect(warning).toBe(true); expect(result.warning).toBe(text); expect(result.reasons).toHaveLength(3);
  }
  expect(reasonsFor({ ...neutral, componentShare: 0.01, nationDistance: 10, edge: 0 }).warning).toMatch(/^Island start/);
  expect(reasonsFor({ ...neutral, nationDistance: 10, edge: 0 }).warning).toMatch(/^AI nation/);
  expect(reasonsFor({ ...neutral, reach120: 0.699, componentShare: 0.1, defense: 0.249, nationDistance: 80, edge: 0.1 })).toEqual({ reasons: [] });
  expect(reasonsFor({ ...neutral, closure: 0.05, exits: 1 }).reasons).toEqual(["One land front, 5% of horizon closed"]);
});
it("ranks only valid tiles with explicit ties and finite empty-map output", () => {
  const a = Float64Array.from([0, 1, 1, 2, 999]); const valid = Uint8Array.from([1, 1, 1, 1, 0]);
  expect([...percentileRanks(a, valid)]).toEqual([0, 0.25, 0.25, 0.75, 0]);
  expect([...percentileRanks(a, valid, true)]).toEqual([0.125, 0.5, 0.5, 0.875, 0]);
  expect([...percentileRanks(a, new Uint8Array(5))]).toEqual([0, 0, 0, 0, 0]);
  const empty = scoreMap(new Uint8Array(16), { map: { width: 16, height: 16 }, map16x: { width: 4, height: 4 }, nations: [] });
  expect(empty.picks).toEqual([]);
});
it("counts circular land runs and treats the map edge as closed", () => {
  const open = new Uint8Array(41 * 41).fill(1);
  expect(landExits(open, 41, 41, 20 * 41 + 20)).toBe(1);
  expect(landExits(new Uint8Array(41 * 41), 41, 41, 20 * 41 + 20)).toBe(0);
  const strips = Uint8Array.from(open, (_, i) => Number(i % 41 >= 18 && i % 41 <= 22));
  expect(landExits(strips, 41, 41, 20 * 41 + 20)).toBe(2);
  expect(landExits(open, 41, 41, 0)).toBe(1);
});
it("scales spacing for short maps, keeps row-major ties, and returns fewer picks when needed", () => {
  const manifest = { map: { width: 2000, height: 276 }, map16x: { width: 500, height: 69 }, nations: [] };
  expect(spacingFor(manifest)).toBe(69);
  expect(spacingFor({ ...manifest, map: { width: 1000, height: 2000 } })).toBe(250);
  expect(selectPicks(Float64Array.from([1, 1, 1]), 3, 8)).toEqual([0, 2]);
});

// Transcribed from propose_out.txt: its max-scaled/raw terms and 120-tile
// spacing differ from the explicit v4b percentile/250-tile production rules.
const reference = [
  { folder: "world", picks: [[1360, 240, 0.683, 2], [1456, 168, 0.662, 3], [1576, 172, 0.649, 6]] },
  { folder: "europe", picks: [[2096, 692, 0.712, 1], [2672, 708, 0.698, 1], [2560, 660, 0.694, 4]] },
  { folder: "japan", picks: [[1544, 1084, 0.721, 1], [1464, 1176, 0.669, 7], [1876, 260, 0.662, 1]] },
];
it.each(reference)("ports Python features/picks for $folder under the reference settings", async ({ folder, picks }) => {
  const { terrain, manifest } = await readCachedMap(folder);
  const r = scoreMap(terrain, manifest); const w = manifest.map16x.width;
  const originalScores = Float64Array.from(r.valid, (v, i) => v ? 0.60 * r.raw.reach120[i]! + 0.05 * r.raw.reach60[i]! + 0.10 * r.raw.defense[i]! + 0.05 * r.raw.coast[i]! - 0.10 * r.raw.nationNear[i]! - 0.10 * r.raw.smallIsland[i]! : -Infinity);
  const selected = selectPicks(originalScores, w, 120);
  selected.forEach((i, k) => {
    const [x, y, score, top] = picks[k]!;
    expect(Math.abs(i % w * 4 - x!)).toBeLessThanOrEqual(4);
    expect(Math.abs(Math.floor(i / w) * 4 - y!)).toBeLessThanOrEqual(4);
    expect(Math.abs(originalScores[i]! - score!)).toBeLessThanOrEqual(0.00051);
    expect(Math.max(1, Math.round(100 * (1 - r.terms.reach120[i]!)))).toBe(top);
    for (const term of Object.keys(r.raw) as (keyof typeof r.raw)[]) {
      let below = 0; let count = 0;
      for (let j = 0; j < r.valid.length; j++) if (r.valid[j]) {
        count++; if (r.raw[term][j]! < r.raw[term][i]! - 1e-9) below++;
      }
      expect(r.terms[term][i]).toBeCloseTo(below / count, 4);
    }
  });
  for (const p of r.picks) {
    const i = p.y / 4 * w + p.x / 4;
    const expected = 0.60 * r.terms.reach120[i]! + 0.05 * r.terms.reach60[i]! + 0.10 * r.terms.defense[i]! + 0.05 * r.terms.coast[i]! - 0.10 * r.terms.nationNear[i]! - 0.10 * r.terms.smallIsland[i]!;
    expect(r.scores[i]).toBeCloseTo(expected, 12);
    let below = 0; let tied = 0; let count = 0;
    for (let j = 0; j < r.valid.length; j++) if (r.valid[j]) {
      count++; if (r.scores[j]! < r.scores[i]! - 1e-9) below++;
      else if (Math.abs(r.scores[j]! - r.scores[i]!) <= 1e-9) tied++;
    }
    expect(p.percentile).toBeCloseTo((below + tied / 2) / count, 5);
  }
}, 30_000);
