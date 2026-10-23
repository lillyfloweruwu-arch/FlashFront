import { expect, it } from "vitest";
import { attackSizes } from "./attack";
import { nextBuild } from "./build";
import { formatTroops } from "./format";
import { MockDataSource } from "./mock/MockDataSource";
import { matchTrend } from "./trend";
import { MatchRecorder } from "./recorder";
import { nextMatchNotes } from "./coach";
it("compares 20, 30 and 50 percent with internal troop units", () => {
  const rows = attackSizes(3070000, 3810000);
  expect(rows.map(r => formatTroops(r.sent))).toEqual(["61.4K", "92.1K", "153K"]);
  expect(rows.map(r => Math.floor(r.remainingFraction * 100))).toEqual([64, 56, 40]);
});
it("chooses next build by capacity, ocean access, then cheapest affordable economy option", () => {
  const self = new MockDataSource().getSnapshot().self!;
  self.maxTroops = 1e6; self.gold = 100; self.portLevels = 0;
  self.buildings = [{ type: "City", count: 0, nextCost: 200 }, { type: "Port", count: 0, nextCost: 100 }, { type: "Factory", count: 0, nextCost: 50 }];
  for (const [troops, ports, map, expected] of [[800000, 0, "World", "City"], [1000000, 1, "World", "City"], [500000, 0, "World", "Port"], [500000, 1, "World", "Factory"], [500000, 0, "Unknown", "Factory"]] as const) {
    self.troops = troops; self.portLevels = ports; expect(nextBuild(self, map)?.type).toBe(expected);
  }
  self.gold = 0; self.portLevels = 2; self.factoryLevels = 2; expect(nextBuild(self, "Unknown")).toBeUndefined(); expect(nextBuild(null, "World")).toBeUndefined();
});
it("computes honest public sample counts, medians and current-goal hit rates", () => {
  const recorder = new MatchRecorder(); recorder.consume({ inGame: true, visible: true }, null);
  const m = recorder.finish()!;
  const matches = [1, 2, 3].map(n => ({ ...m, type: "Public", startedAt: `2026-10-${10 + n}`, endedAtSec: n * 200, durationSec: n * 200,
    summary: { ...m.summary, idleGoldSeconds: n * 10, attackTempo: n, timeInZone: { ...m.summary.timeInZone, wasting: n * 20 } },
    practiceGoal: { id: "under70" as const, status: n === 1 ? "hit" as const : n === 2 ? "miss" as const : "unknown" as const } }));
  const trend = matchTrend([...matches, { ...m, type: "Singleplayer" }, { ...m, type: undefined }], "under70");
  expect(trend.current).toMatchObject({ count: 3, survived: 2, idleGold: { value: 3, count: 3 }, over70: { value: 6 }, attackTempo: { value: 2 }, goal: { hits: 1, count: 2 } });
  expect(trend.previous.count).toBe(0);
  expect(matchTrend(Array.from({ length: 23 }, (_, i) => ({ ...matches[0]!, startedAt: String(i).padStart(3, "0") }))).previous.count).toBe(10);
  expect(nextMatchNotes(m)).toHaveLength(3);
  expect(nextMatchNotes(m)[0]?.severity).toBe("good");
});
