import { afterEach, expect, it, vi } from "vitest";
import { MockDataSource } from "./MockDataSource";
import { buildCost, maxTroops, troopGrowthPerSec } from "../mechanics";
import { attackPreview } from "../attack";
import type { GameSnapshot } from "../types";

afterEach(() => vi.useRealTimers());
it("is deterministic across speed settings and stops after unsubscribe", () => {
  vi.useFakeTimers();
  const a = new MockDataSource({ seed: 73 });
  const b = new MockDataSource({ seed: 73, speed: 20 });
  const onA = vi.fn(); const onB = vi.fn();
  const offA = a.subscribeGame(onA); const offB = b.subscribeGame(onB);
  vi.advanceTimersByTime(3000);
  expect(onA).toHaveBeenCalledTimes(11); // Initial state plus 10 timer emissions.
  offB();
  vi.advanceTimersByTime(57000);
  expect(a.getSnapshot()).toEqual(b.getSnapshot());
  offA();
  expect(vi.getTimerCount()).toBe(0);
});
it("runs a complete bounded game with buildings, alliances, combat and no snapshot mutation", () => {
  vi.useFakeTimers();
  const source = new MockDataSource({ speed: 20 });
  const events = new Set<string>(); let initial: GameSnapshot | undefined;
  const off = source.subscribeGame(s => { initial ??= s; s.events.forEach(e => events.add(e.kind)); });
  vi.advanceTimersByTime(45000);
  const s = source.getSnapshot();
  expect(s.tick).toBe(9000); expect(s.phase).toBe("ended");
  expect(s.self!.tilesOwnedPct).toBeGreaterThan(28);
  expect(s.players).toHaveLength(40); expect(s.events.length).toBeLessThanOrEqual(50);
  expect(s.players.reduce((n, p) => n + p.tilesOwnedPct, 0)).toBeLessThanOrEqual(100);
  expect(s.self!.buildings.some(b => b.count > 0)).toBe(true);
  for (const kind of ["allianceRequest", "allianceExpired", "incomingAttack", "incomingNuke", "playerEliminated", "buildingDestroyed"]) expect(events.has(kind)).toBe(true);
  expect(initial!.tick).toBe(0); expect(initial!.self!.buildings.every(b => b.count === 0)).toBe(true);
  off();
});
it("states the spawn as a fact and clears its events when the phase changes", () => {
  vi.useFakeTimers();
  const source = new MockDataSource({ speed: 20 });
  expect(source.getSnapshot().events.map(e => e.text)).toEqual(["Spawn selected."]);
  const off = source.subscribeGame(() => {});
  vi.advanceTimersByTime(300); // 60 ticks = 6 s: spawn ended at 5 s
  const s = source.getSnapshot();
  expect(s.phase).toBe("playing"); expect(s.events.some(e => e.text.startsWith("Spawn selected"))).toBe(false);
  off();
});
it("provides seeded history, limits and not-found states without sharing mutable data", async () => {
  const source = new MockDataSource({ seed: 1 });
  const profile = await source.getProfile("Ember");
  expect(profile!.eloHistory).toHaveLength(30);
  const matches = await source.getMatches("self"); expect(matches).toHaveLength(20);
  expect(matches[0]!.timeline).toHaveLength(61);
  expect(await source.getMatches("self", 3)).toHaveLength(3);
  expect(await source.getMatch(matches[0]!.gameId)).toEqual(matches[0]);
  matches[0]!.map = "changed";
  expect((await source.getMatches("self"))[0]!.map).not.toBe("changed");
  expect(await source.getProfile("missing")).toBeNull();
  expect(await source.getMatch("missing")).toBeNull();
  expect(await source.getMatches("missing")).toEqual([]);
  expect(await source.getLobbies()).toHaveLength(3);
  expect(new MockDataSource({ seed: 2 }).getSnapshot()).not.toEqual(source.getSnapshot());
});

it.each([1, 42, 73])("replays every growth zone, hoarding and the push deterministically for seed %s", seed => {
  vi.useFakeTimers();
  const source = new MockDataSource({ seed, speed: 20 });
  const zones = new Set<string>(); let wastingAtSixMinutes = false; let exposedAfterPush = false; let incoming = false;
  let priorGold = 0; let hoarded = false;
  const off = source.subscribeGame(s => {
    const self = s.self!; const preview = attackPreview(self.troops, self.maxTroops, self.attackRatio);
    zones.add(preview.zoneNow);
    expect(self.maxTroops).toBe(maxTroops(self.tilesOwned, self.cityLevels));
    expect(self.troopGrowthPerSec).toBe(troopGrowthPerSec(self.troops, self.maxTroops));
    expect(self.goldPerSec).toBe(1000);
    for (const building of self.buildings) expect(building.nextCost).toBe(buildCost(building.type, building.type === "Port" || building.type === "Factory" ? self.portLevels + self.factoryLevels : building.count));
    if (s.elapsedSec >= 360 && s.elapsedSec <= 420 && preview.zoneNow === "wasting") wastingAtSixMinutes = true;
    if (s.elapsedSec >= 450 && s.elapsedSec < 454 && preview.zoneNow === "exposed") exposedAfterPush = true;
    if (self.incomingAttacks.length) incoming = true;
    if (s.elapsedSec === 330) priorGold = self.gold;
    if (s.elapsedSec === 438) hoarded = self.gold > priorGold && self.gold >= buildCost("City", self.cityLevels);
  });
  vi.advanceTimersByTime(45000); off();
  expect([...zones].sort()).toEqual(["exposed", "high", "low", "sweet", "wasting"]);
  expect(wastingAtSixMinutes).toBe(true); expect(exposedAfterPush).toBe(true); expect(incoming).toBe(true); expect(hoarded).toBe(true);
  expect(source.getSnapshot().phase).toBe("ended");
});
