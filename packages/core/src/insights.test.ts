import { expect, it } from "vitest";
import { InsightFeed, isZoneReport } from "./insights";
import type { GameSnapshot, SelfState } from "./types";

const self = (patch: Partial<SelfState> = {}): SelfState => ({
  id: "me", troops: 1_000_000, maxTroops: 2_400_000, troopGrowthPerSec: 0, gold: 0, goldPerSec: 0, attackRatio: 0.2,
  tilesOwned: 0, tilesOwnedPct: 0, rank: 1, buildings: [], alliances: [], cityLevels: 0, portLevels: 0, factoryLevels: 0,
  defensePosts: 0, samLaunchers: 0, incomingAttacks: [], ...patch,
} as SelfState);
const snap = (tick: number, s: SelfState, phase: GameSnapshot["phase"] = "playing"): GameSnapshot => ({
  gameId: "g1", map: "World", mode: "FFA", tick, ticksPerSecond: 10, elapsedSec: tick / 10, winTargetPct: 80,
  self: s, players: [], events: [], phase,
});

it("reports FlashFront-only insights from the player's own numbers", () => {
  const feed = new InsightFeed();
  expect(feed.observe(snap(10, self()))).toEqual([]);                                    // 42%: nothing to say
  let events = feed.observe(snap(20, self({ troops: 1_900_000 })));                       // 79%
  expect(events.at(-1)?.text).toBe("Growth slowing · 70% of max or more.");
  expect(isZoneReport(events.at(-1)!)).toBe(true);
  events = feed.observe(snap(30, self({ troops: 400_000 })));                              // big drop to 17%
  expect(events.at(-1)?.text).toBe("Push left you exposed at 17% of max.");
  events = feed.observe(snap(40, self({ troops: 400_000, incomingAttacks: [{ from: "x", troops: 130_000 }] })));
  expect(events.at(-1)).toMatchObject({ kind: "incomingAttack", text: "Incoming attack: 13.0K vs your 40.0K." });
  expect(isZoneReport(events.at(-1)!)).toBe(false); expect(isZoneReport(events.at(-2)!)).toBe(true);
  events = feed.observe(snap(50, self({ troops: 400_000, cityLevels: 2, alliances: [{ with: "a", expiresAtTick: 0 }] })));
  // Builds are not reported: the game announces them itself, and live they flooded the feed.
  expect(events.at(-1)?.text).toBe("Alliance formed (1 active).");
  expect(events.some(e => /built/.test(e.text))).toBe(false);
  events = feed.observe(snap(60, self({ troops: 400_000, cityLevels: 2 })));
  expect(events.at(-1)?.text).toBe("Alliance ended (0 active).");
  expect(new Set(events.map(e => e.id)).size).toBe(events.length);
});

it("stays quiet during spawn, keeps at most 20 events and resets per game", () => {
  const feed = new InsightFeed();
  expect(feed.observe(snap(10, self({ troops: 100_000 }), "spawn"))).toEqual([]);
  for (let i = 0; i < 30; i++) feed.observe(snap(100 + i * 10, self({ alliances: i % 2 ? [{ with: "a", expiresAtTick: 0 }] : [] })));
  expect(feed.observe(snap(500, self())).length).toBe(20);
  expect(feed.observe({ ...snap(5, self()), gameId: "g2" })).toEqual([]);
});

it("drops everything observed up to the end of a spawn phase", () => {
  const feed = new InsightFeed();
  feed.observe(snap(10, self()));
  expect(feed.observe(snap(20, self({ troops: 1_900_000 })))).toHaveLength(1);
  feed.observe(snap(30, self(), "spawn"));
  expect(feed.observe(snap(40, self()))).toEqual([]);
});
