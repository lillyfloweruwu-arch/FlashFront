import { describe, expect, it } from "vitest";
import { mapToSnapshot } from "./mapToSnapshot";
import { formatTroops, formatTroopRate } from "./format";
import type { RawExtract } from "./raw";

// Captured simultaneously by the read-only probe on 2026-10-15.
const sample: RawExtract = {
  inGame: true, visible: true, tick: 461, inSpawnPhase: false, gameOver: false,
  me: { name: "Tidewalker", displayName: "Tidewalker", troops: 146020, gold: "42800",
    maxTroops: 364227.77, troopRatePerTick: 887.97, attackRatio: 0.2, outgoingCount: 1, incoming: [] },
};
describe("mapToSnapshot", () => {
  it("maps optional own income counters without inventing missing values", () => {
    const mapped = mapToSnapshot({ ...sample, me: { ...sample.me, goldEarned: "1000", tradeGold: "200", trainGold: "20", piracyGold: "10", readyMissiles: 3, alliances: [{ with: "Own pact" }] } })!;
    expect(mapped.self).toMatchObject({ goldEarned: 1000, tradeGold: 200, trainGold: 20, piracyGold: 10, readyMissiles: 3 });
    expect(mapped.self!.alliances).toHaveLength(1);
    expect(mapped.self!.alliances[0]!.expiresAtTick).toBeUndefined();
    expect(mapToSnapshot(sample)!.self!.goldEarned).toBeUndefined();
    expect(mapToSnapshot({ ...sample, me: { ...sample.me, tradeGold: "invalid" } })!.self!.tradeGold).toBeUndefined();
  });
  it("preserves captured internal units and converts only display values", () => {
    const snapshot = mapToSnapshot(sample)!;
    expect(snapshot.phase).toBe("playing");
    expect(snapshot).toMatchObject({ map: "Unknown", mode: "FFA", tick: 461, elapsedSec: 46.1 });
    expect(snapshot.self).toMatchObject({ troops: 146020, maxTroops: 364227.77, gold: 42800, attackRatio: 0.2 });
    expect(formatTroops(snapshot.self!.troops)).toBe("14.6K");
    expect(formatTroops(snapshot.self!.maxTroops)).toBe("36.4K");
    expect(snapshot.self!.troopGrowthPerSec).toBeCloseTo(8879.7);
    expect(formatTroopRate(snapshot.self!.troopGrowthPerSec)).toBe("+887/s") /* game: +${renderTroops(troopIncreaseRate*10)}/s, truncated */;
  });
  it("maps menus, spectators and phase flags", () => {
    expect(mapToSnapshot({ inGame: false, visible: true })).toBeNull();
    expect(mapToSnapshot({ inGame: true, visible: true })?.self).toBeNull();
    expect(mapToSnapshot({ ...sample, inSpawnPhase: true })?.phase).toBe("spawn");
    expect(mapToSnapshot({ ...sample, inSpawnPhase: true, gameOver: true })?.phase).toBe("ended");
  });
  it("smooths positive gold deltas and ignores spending, duplicate ticks and time rewinds", () => {
    const first = mapToSnapshot(sample)!;
    const earned = mapToSnapshot({ ...sample, tick: 471, me: { ...sample.me, gold: "43800" } }, first)!;
    expect(earned.self!.goldPerSec).toBe(1000);
    const smoothed = mapToSnapshot({ ...sample, tick: 481, me: { ...sample.me, gold: "45800" } }, earned)!;
    // ~15 s smoothing (trade arrives in lumps): one second at 2000/s moves 1000 → 1000 + (1 - e^(-1/15)) × 1000.
    const expected = 1000 + (1 - Math.exp(-1 / 15)) * 1000;
    expect(smoothed.self!.goldPerSec).toBeCloseTo(expected, 6);
    const spent = mapToSnapshot({ ...sample, tick: 491, me: { ...sample.me, gold: "100" } }, smoothed)!;
    expect(spent.self!.goldPerSec).toBeCloseTo(expected, 6);
    expect(mapToSnapshot(sample, spent)!.self!.goldPerSec).toBe(0);
    expect(mapToSnapshot({ ...sample, tick: 491 }, spent)!.self!.goldPerSec).toBeCloseTo(expected, 6);
  });
  it("uses only rendered rows and only known building counts", () => {
    const snapshot = mapToSnapshot({ ...sample, me: { ...sample.me, cityLevels: 1, portLevels: 1, factoryLevels: 2 },
      leaderboard: [{ rank: 3, name: "Tidewalker", landPct: 4.2, gold: "42.8K", troops: "14.6K", isMe: true }],
    })!;
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]).toMatchObject({ id: "self", troops: 146000, gold: 42800 });
    expect(snapshot.self).toMatchObject({ rank: 3, tilesOwnedPct: 4.2 });
    expect(snapshot.self!.buildings).toEqual([
      { type: "City", count: 1, nextCost: 250000 },
      { type: "Port", count: 1, nextCost: 1000000 },
      { type: "Factory", count: 2, nextCost: 1000000 },
    ]);
    expect(mapToSnapshot(sample)!.self!.buildings).toEqual([]);
    expect(mapToSnapshot(sample)!.players).toEqual([]);
  });
});

// Values read live from g.config().gameConfig() on 2026-10-16.
describe("map and mode from gameConfig", () => {
  it.each([
    [{ map: "World", mode: "Free For All", type: "Singleplayer" }, "World", "FFA"],
    [{ map: "Iceland", mode: "Team", type: "Public" }, "Iceland", "Teams"],
    [{ map: "Europe", mode: "Free For All", type: "Ranked" }, "Europe", "Ranked"], // old recordings only
    // v0.35.2 source: ranked is a Public game with rankedType set; no "Ranked" gameType exists.
    [{ map: "Europe", mode: "Free For All", type: "Public", rankedType: "ffa" }, "Europe", "Ranked"],
    [{ map: "Iceland", mode: "Team", type: "Public", rankedType: "2v2" }, "Iceland", "Ranked"],
    [{ map: "Baikal", mode: "Free For All", type: "Private" }, "Baikal", "Custom"],
    [undefined, "Unknown", "FFA"],
  ])("%j", (game, map, mode) => {
    const snapshot = mapToSnapshot({ ...sample, game })!;
    expect(snapshot.map).toBe(map);
    expect(snapshot.mode).toBe(mode);
  });
});

describe("non-live contexts", () => {
  it("marks replays, spectating after elimination and cheat lobbies", () => {
    expect(mapToSnapshot({ ...sample, replay: true })!.observer).toBe("replay");
    expect(mapToSnapshot({ ...sample, me: { ...sample.me, alive: false } })!.observer).toBe("spectating");
    expect(mapToSnapshot({ ...sample, me: { ...sample.me, alive: false }, gameOver: true })!.observer).toBeUndefined();
    // Live 2026-10-18: before picking a spawn, isAlive() is false. That is not spectating.
    expect(mapToSnapshot({ ...sample, me: { ...sample.me, alive: false }, inSpawnPhase: true })!.observer).toBeUndefined();
    expect(mapToSnapshot(sample)!.observer).toBeUndefined();
    expect(mapToSnapshot({ ...sample, game: { map: "World", cheats: true } })!.cheats).toBe(true);
  });
  it("computes own land % from map land tiles when the leaderboard has no % column", () => {
    const snapshot = mapToSnapshot({ ...sample, leaderboard: [], landTiles: 200_000, me: { ...sample.me, tiles: 5_000 } })!;
    expect(snapshot.self!.tilesOwnedPct).toBeCloseTo(2.5);
  });
});

// Live bug 2026-10-17: with ~1.15M/min trade income and constant building, the planner said a City
// was "in 9:36" at 312K gold. Spending made most gold deltas negative, so only passive income
// counted. The rate now comes from goldEarned, which spending never lowers.
describe("gold rate from gold earned", () => {
  it("averages lumpy trade income instead of showing only passive gold between ship arrivals", () => {
    // 1K/s passive + a 100K trade ship every 5 s = ~21K/s real income; sampled 4x/s for 60 s.
    let earned = 5_000_000; let gold = 312_000;
    let prev = mapToSnapshot({ ...sample, tick: 1000, me: { ...sample.me!, gold: String(gold), goldEarned: String(earned) } })!;
    let tick = 1000;
    for (let i = 1; i <= 240; i++) {
      tick += i % 2 === 0 ? 3 : 2;                 // 2.5 ticks per sample on average
      const lump = i % 20 === 0 ? 100_000 : 0;     // every 5 s
      earned += 250 + lump; gold += 250 + lump;
      if (i % 37 === 0) gold -= 200_000;           // occasional big purchase
      prev = mapToSnapshot({ ...sample, tick, me: { ...sample.me!, gold: String(Math.max(0, gold)), goldEarned: String(earned) } }, prev)!;
      if (i === 241 - 7) break;                    // stop between two ship arrivals
    }
    expect(prev.self!.goldPerSec).toBeGreaterThan(15_000);
    expect(prev.self!.goldPerSec).toBeLessThan(28_000);
  });
});

it("ally names and requests reach the snapshot, sized only from unambiguous rendered rows", () => {
  const raw: RawExtract = { ...sample, me: { ...sample.me, alliances: [{ with: "ally:p7", name: "Ember" }], allianceRequests: [{ from: "ally:p7", name: "Ember", atWar: true }] }, leaderboard: [{ rank: 1, name: "[TAG] Ember", landPct: 12, gold: "", troops: "", isMe: false }] };
  expect(mapToSnapshot(raw)?.self?.alliances[0]?.name).toBe("Ember");
  expect(mapToSnapshot(raw)?.self?.allianceRequests?.[0]).toMatchObject({ name: "Ember", atWar: true, landPct: 12 });
  expect(mapToSnapshot({ ...raw, leaderboard: [...raw.leaderboard!, ...raw.leaderboard!] })?.self?.allianceRequests?.[0]?.landPct).toBeUndefined();
  for (const restricted of [{ ...raw, replay: true }, { ...raw, game: { rankedType: "ffa" } }]) {
    expect(mapToSnapshot(restricted)?.self?.alliances[0]?.name).toBeUndefined();
    expect(mapToSnapshot(restricted)?.self?.allianceRequests).toBeUndefined();
  }
});
