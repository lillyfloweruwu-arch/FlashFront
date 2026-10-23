import { expect, it } from "vitest";
import { PushTracker, pushReasons, pushVerdict } from "./push";
import { economyBoost, nextBuild, nextLevelBoost } from "./build";
import { MockDataSource } from "./mock/MockDataSource";
import type { GameSnapshot, SelfState } from "./types";

const self = (patch: Partial<SelfState>): SelfState => ({
  id: "self", troops: 1_000_000, maxTroops: 2_000_000, troopGrowthPerSec: 0, gold: 0, goldPerSec: 0, attackRatio: 0.2,
  tilesOwned: 1000, tilesOwnedPct: 1, rank: 1, buildings: [], alliances: [], cityLevels: 0, portLevels: 0, factoryLevels: 0,
  defensePosts: 0, samLaunchers: 0, incomingAttacks: [], outgoingAttacks: 0, ...patch,
});
const snap = (tick: number, s: SelfState): GameSnapshot => ({
  gameId: "g", map: "World", mode: "FFA", tick, ticksPerSecond: 10, elapsedSec: tick / 10, winTargetPct: 80, self: s, players: [], events: [], phase: "playing",
});

it("measures an own push from troop drop to land gained", () => {
  const t = new PushTracker();
  expect(t.observe(snap(10, self({})))).toBeUndefined();
  t.observe(snap(20, self({ troops: 800_000, outgoingAttacks: 1 })));          // sent 200K
  t.observe(snap(100, self({ troops: 850_000, tilesOwned: 3000, tilesOwnedPct: 3, outgoingAttacks: 1 })));
  const r = t.observe(snap(150, self({ troops: 900_000, tilesOwned: 3000, tilesOwnedPct: 3, outgoingAttacks: 0 })))!;
  expect(r).toMatchObject({ sent: 200_000, tilesGained: 2000, landGainedPct: 2, durationSec: 14, troopsPerTile: 100, verdict: "good" });
  expect(pushReasons(r)).toEqual([]);
});

it("adds growth back, sums stacked sends and flags a push that won no land", () => {
  const t = new PushTracker();
  t.observe(snap(10, self({ troopGrowthPerSec: 1000 })));
  t.observe(snap(20, self({ troops: 901_000, outgoingAttacks: 1, troopGrowthPerSec: 1000 }))); // 1 s growth: sent 100K
  t.observe(snap(30, self({ troops: 802_000, outgoingAttacks: 2, troopGrowthPerSec: 1000 }))); // +100K
  const r = t.observe(snap(60, self({ troops: 900_000, tilesOwned: 990, outgoingAttacks: 0 })))!;
  expect(r.sent).toBe(200_000);
  expect(r.verdict).toBe("failed");
  expect(pushReasons(r)).toHaveLength(1);
  expect(r.overlapped).toBe(true);
  expect(t.observe({ ...snap(5, self({})), gameId: "other" })).toBeUndefined();
});

it("calls big low-yield pushes costly", () => {
  expect(pushVerdict(300_000, 400, 2_000_000)).toBe("costly");
  expect(pushVerdict(300_000, 1000, 2_000_000)).toBe("good");
  expect(pushVerdict(100_000, 100, 2_000_000)).toBe("good");      // under 10% of max: not judged
  expect(pushVerdict(300_000, 2000, 2_000_000)).toBe("good");
});

it("ports the v0.35 small-economy spawn boost", () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(l => +economyBoost(l).toFixed(3))).toEqual([1, 1.5, 1.2, 1.1, 1.05, 1.02, 1]);
  expect(+nextLevelBoost("Port", 0).toFixed(2)).toBe(2.25);
  expect(+nextLevelBoost("Port", 1).toFixed(2)).toBe(1.44);
  expect(+nextLevelBoost("Factory", 0).toFixed(2)).toBe(1.5);
});

it("prefers boosted first and second economy levels unless troops are near the cap", () => {
  const s = new MockDataSource().getSnapshot().self!;
  s.maxTroops = 1e6; s.troops = 500_000; s.gold = 0;
  s.buildings = [{ type: "City", count: 0, nextCost: 200 }, { type: "Port", count: 0, nextCost: 100 }, { type: "Factory", count: 0, nextCost: 100 }];
  const order: string[] = [];
  for (const [ports, factories] of [[0, 0], [1, 0], [1, 1], [2, 1]] as const) {
    s.portLevels = ports; s.factoryLevels = factories;
    const next = nextBuild(s, "World")!;
    order.push(`${next.type} ${next.reason}`);
  }
  expect(order).toEqual(["Port 2.25× trade ships", "Factory 1.50× trains", "Port 1.44× trade ships", "Factory 1.20× trains"]);
  s.troops = 800_000; expect(nextBuild(s, "World")?.reason).toBe("+25K max · troops near cap");
});
