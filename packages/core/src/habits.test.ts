import { expect, it } from "vitest";
import { allianceTone, GoalTracker, incomingAlarm, maxSendPercent, openingItems, openingVisible, suggestedGoals, TradeMonitor, tradeShare } from "./habits";
import { MockDataSource } from "./mock/MockDataSource";
import { MatchRecorder } from "./recorder";
import { mapToSnapshot } from "./mapToSnapshot";
import { coachMatch } from "./coach";
import type { RawExtract } from "./raw";
import type { PracticeGoal } from "./habits";

it("floors the safe send percentage, bounds settings and handles an empty reserve", () => {
  expect(maxSendPercent(300_000, 430_000, 35)).toBe(49);
  expect(maxSendPercent(100_000, 430_000, 35)).toBe(0);
  expect(maxSendPercent(0, 430_000)).toBe(0);
  expect(maxSendPercent(430_000, 430_000, 60)).toBe(40);
  expect(maxSendPercent(NaN, 430_000)).toBe(0);
});
it("tracks deltas in a trailing 60-second window, never spending or an initial total", () => {
  const monitor = new TradeMonitor(); const s = new MockDataSource().getSnapshot();
  s.self!.portLevels = 1;
  const at = (t: number, total: number) => {
    s.elapsedSec = t; s.self!.tradeGold = total; s.self!.trainGold = 20; s.self!.goldEarned = 1000;
    return monitor.observe(s);
  };
  expect(at(0, 100).last60).toBe(0);
  expect(at(10, 200)).toMatchObject({ last60: 100, share: 0.22 });
  expect(at(60, 400).last60).toBe(300);
  expect(at(70, 400).last60).toBe(200);
  expect(at(120, 400).last60).toBe(0);
  expect(at(121, 0).last60).toBe(0); // reset counter, no negative income
  s.gameId = "new"; expect(at(130, 100).last60).toBe(0);
  expect(at(0, 100).last60).toBe(0); // time rewind
  s.self!.tradeGold = undefined;
  expect(monitor.observe(s).last60).toBeUndefined();
  expect(at(1, 500).last60).toBe(0); // unavailable interval is not invented
  expect(tradeShare(undefined, 100)).toBeUndefined();
  expect(tradeShare(0, 0)).toBe(0);
});
it("waits for a port to exist for 60 game seconds before showing no income", () => {
  const monitor = new TradeMonitor(); const s = new MockDataSource().getSnapshot();
  s.self!.tradeGold = 0; s.self!.trainGold = 0;
  expect(monitor.observe(s).noIncome).toBe(false);
  s.elapsedSec = 20; s.self!.portLevels = 1; monitor.observe(s);
  s.elapsedSec = 79; expect(monitor.observe(s).noIncome).toBe(false);
  s.elapsedSec = 80; expect(monitor.observe(s).noIncome).toBe(true);
  s.self!.trainGold = 1; expect(monitor.observe(s).noIncome).toBe(false);
  s.self!.portLevels = 0; s.self!.trainGold = 0; expect(monitor.observe(s).noIncome).toBe(false);
});
it("gates opening items by ocean, phase, completion and game time", () => {
  const s = new MockDataSource().getSnapshot(); s.map = "World";
  expect(openingVisible(s)).toBe(false);
  s.phase = "playing"; s.elapsedSec = 20;
  expect(openingItems(s).map(i => i.done)).toEqual([false, false, false]);
  expect(openingItems(s)[1]).toMatchObject({ cost: 125000, seconds: 122.5 });
  s.self!.portLevels = 1; expect(openingItems(s)[1]!.done).toBe(true);
  s.self!.alliances = [{ with: "Own pact" }]; s.self!.cityLevels = 1;
  expect(openingVisible(s)).toBe(false);
  s.self!.cityLevels = 0; s.elapsedSec = 300; expect(openingVisible(s)).toBe(false);
  s.elapsedSec = 299; expect(openingVisible(s)).toBe(true);
  s.map = "Alps"; expect(openingItems(s).map(i => i.label)).not.toContain("Build a port");
  s.map = "Unknown"; expect(openingItems(s)).toHaveLength(2);
});
it("uses inclusive alliance and summed incoming thresholds", () => {
  expect([61, 60, 16, 15, 0].map(allianceTone)).toEqual(["ally", "warning", "warning", "danger", "danger"]);
  const s = new MockDataSource().getSnapshot().self!; s.troops = 200;
  s.incomingAttacks = [{ from: "A", troops: 49 }, { from: "B", troops: 50 }]; expect(incomingAlarm(s)).toBeUndefined();
  s.incomingAttacks[0]!.troops = 50; expect(incomingAlarm(s)).toBe(100);
  s.troops = 0; expect(incomingAlarm(s)).toBe(100);
  s.incomingAttacks = []; expect(incomingAlarm(s)).toBeUndefined();
});
function fixture(goal: PracticeGoal, options: { portAt?: number; allyAt?: number; pushAfter?: number; high?: boolean; start?: number; completed?: boolean } = {}) {
  const r = new MatchRecorder(); let result;
  for (let t = options.start ?? 0; t <= 300; t += 5) {
    const raw: RawExtract = { inGame: true, visible: true, tick: t * 10, gameId: "habits", gameOver: t === 300 && options.completed !== false,
      inSpawnPhase: t < 20, game: { map: "World", mode: "Free For All" }, me: {
        troops: t >= 150 && options.pushAfter !== undefined ? options.pushAfter * 1_000_000 : options.high ? 800_000 : 600_000,
        maxTroops: 1_000_000, gold: "100", goldEarned: "1000", tradeGold: "120", trainGold: "100", portLevels: t >= (options.portAt ?? Infinity) ? 1 : 0,
        alliances: t >= (options.allyAt ?? Infinity) ? [{ with: "Not recorded" }] : [], outgoingCount: t >= 150 && options.pushAfter !== undefined ? 1 : 0,
      } };
    result = r.consume(raw, mapToSnapshot(raw), t === (options.start ?? 0) ? goal : "port180")[0] ?? result;
  }
  return result ?? r.finish()!;
}
it("records own income, committed troops, tempo, opening observations and fixed goal selection", () => {
  const m = fixture("reserve35", { pushAfter: 0.4, portAt: 100, allyAt: 150 });
  expect(m.samples[0]).toMatchObject({ tradeGoldTotal: 220, goldEarnedTotal: 1000 });
  expect(m.summary).toMatchObject({ troopsCommitted: 200000, attackTempo: 1 / 3, tradeShare: 0.22, firstPortSec: 100, firstAllySec: 150 });
  expect(m.practiceGoal).toEqual({ id: "reserve35", status: "hit" });
  const copy = coachMatch(m).map(n => n.text).join(" ");
  expect(copy).toContain("You committed 0.3× your peak troops in attacks this match.");
  expect(copy).toContain("Trade and trains made 22% of your gold. Your first port came at 1:40.");
  expect(copy).toContain("Port and ally by 2:30 — solid opening.");
  expect(copy).not.toMatch(/always|must|betray|winners/i);
});
it("evaluates hit, miss and incomplete goals on recorded fixtures", () => {
  expect(fixture("under70").practiceGoal?.status).toBe("hit");
  expect(fixture("under70", { high: true }).practiceGoal?.status).toBe("miss");
  expect(fixture("reserve35", { pushAfter: 0.2 }).practiceGoal?.status).toBe("miss");
  expect(fixture("reserve35").practiceGoal?.status).toBe("unknown");
  expect(fixture("port180", { portAt: 175 }).practiceGoal?.status).toBe("hit");
  expect(fixture("port180", { portAt: 180 }).practiceGoal?.status).toBe("miss");
  expect(fixture("under70", { start: 100 }).practiceGoal?.status).toBe("unknown");
  expect(fixture("under70", { completed: false }).practiceGoal?.status).toBe("unknown");
  const m = fixture("under70", { high: true, pushAfter: 0.2 });
  expect(suggestedGoals(m)).toEqual(["under70", "port180", "reserve35"]);
  for (const match of [m, fixture("reserve35", { pushAfter: 0.4, portAt: 100, allyAt: 150 }), fixture("port180", { portAt: 250 })]) {
    expect(coachMatch(match).map(n => n.text).join(" ")).not.toMatch(/always|must|betray|winners/i);
  }
  expect(coachMatch(m).map(n => n.text).join(" ")).toContain("No alliance in the first 5 minutes.");
  const gap = new GoalTracker("under70"); gap.observe(0, "playing", 0.5, 0); gap.observe(20, "playing", 0.5, 0);
  expect(gap.progress(true, true).status).toBe("unknown");
});
