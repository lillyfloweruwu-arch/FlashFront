import { expect, it } from "vitest";
import { MatchRecorder, MAX_MATCH_BYTES, repairSpawnElimination, type RecordedMatch } from "./recorder";
import { mapToSnapshot } from "./mapToSnapshot";
import type { RawExtract } from "./raw";
const raw = (tick: number, troops = 480_000, extra: Partial<RawExtract["me"]> = {}): RawExtract => ({
  inGame: true, visible: true, gameId: "game1234", tick, game: { map: "World", mode: "Free For All" },
  me: { name: "Own player", clientId: "own-client", troops, maxTroops: 1_000_000, gold: "0", tiles: 100,
    outgoingCount: 0, attackRatio: 0.8, cityLevels: 0, ...extra },
  leaderboard: [{ isMe: true, name: "Own player", rank: 4, landPct: 5, gold: "0", troops: "48K" },
    { isMe: false, name: "NEVER STORE THIS", rank: 1, landPct: 55, gold: "1M", troops: "1M" }],
});
const feed = (r: MatchRecorder, value: RawExtract) => r.consume(value, mapToSnapshot(value));
it("records exact own land percentages only when the denominator is known", () => {
  const r = new MatchRecorder();
  feed(r, { ...raw(0), landTiles: 400 }); feed(r, { ...raw(50), landTiles: 200 }); feed(r, raw(100));
  const m = r.finish()!;
  expect(m.samples.map(s => s.tilesOwnedPct)).toEqual([25, 50, undefined]); expect(m.summary.peakLandPct).toBe(50);
  for (const landTiles of [0, NaN, Infinity, 50]) {
    const invalid = new MatchRecorder(); feed(invalid, { ...raw(0), landTiles });
    expect(invalid.finish()!.summary.peakLandPct).toBeUndefined();
  }
});
it("saves displayed decision transitions on the recording clock, rejecting stale or foreign moments", () => {
  const r = new MatchRecorder(() => 0); feed(r, raw(600)); feed(r, raw(620));
  r.recordDecision("game1234", 620, { kind: "recovery", text: "Recovering" });
  r.recordDecision("game1234", 620, { kind: "recovery", text: "Recovering" });
  r.recordDecision("other", 620, { kind: "danger", text: "Wrong game" });
  r.recordDecision("game1234", 1000, { kind: "danger", text: "Future" });
  r.recordDecision("game1234", 620, { kind: "invented", text: "Bad kind" });
  feed(r, raw(630)); r.recordDecision("game1234", 630, undefined);
  feed(r, raw(640)); r.recordDecision("game1234", 640, { kind: "recovery", text: "Recovering again" });
  const m = r.finish()!;
  expect(m.events.filter(e => e.kind === "decision")).toEqual([
    { kind: "decision", t: 2, decisionKind: "recovery", text: "Recovering" },
    { kind: "decision", t: 4, decisionKind: "recovery", text: "Recovering again" },
  ]);
});
it("records 50-tick samples, notable own events, zone time, summary and no other player data", () => {
  const r = new MatchRecorder(() => Date.UTC(2026, 9, 16));
  feed(r, raw(0)); feed(r, raw(25)); feed(r, raw(50));
  feed(r, raw(75, 180_000, { outgoingCount: 1, incoming: [{ from: "SECRET ATTACKER", troops: 50_000 }] }));
  feed(r, raw(90, 180_000, { outgoingCount: 1, cityLevels: 1 }));
  feed(r, raw(100, 180_000, { outgoingCount: 1, cityLevels: 1 }));
  const [m] = feed(r, { inGame: false, visible: true });
  expect(m!.samples.map(s => s.tick)).toEqual([0, 50, 75, 100]);
  expect(m!.events).toContainEqual({ kind: "push", t: 7.5, sent: 300_000, ratio: 0.8, fractionBefore: 0.48, fractionAfter: 0.18, zoneAfter: "exposed" });
  expect(m!.events).toContainEqual({ kind: "incoming", t: 7.5, troops: 50_000 });
  expect(m!.events).toContainEqual({ kind: "build", t: 10, unit: "cityLevels", levels: 1 });
  expect(m!.summary).toMatchObject({ peakTroops: 480_000, peakTiles: 100, finalRank: 4, pushes: 1, exposedPushes: 1 });
  expect(m!.summary.bestRank).toBeUndefined(); // a 10 s match has no rank outside the spawn-tie window
  expect(m!.summary.timeInZone.sweet).toBe(7.5); expect(m!.summary.timeInZone.exposed).toBe(2.5);
  expect(m!.durationSec).toBe(10); expect(m!.endedAt).toBe("2026-10-16T00:00:00.000Z");
  expect(JSON.stringify(m)).not.toMatch(/NEVER STORE|SECRET ATTACKER|leaderboard|alliances|players/);
  expect(r.finish()).toBeUndefined();
});
it("ends on game changes, tick resets, game over and a 30-second data gap without duplicate endings", () => {
  let now = 0; const r = new MatchRecorder(() => now);
  feed(r, raw(100)); expect(feed(r, { ...raw(200), gameId: "next1234" })).toHaveLength(1);
  expect(feed(r, { ...raw(0), gameId: "next1234" })).toHaveLength(1);
  now = 29_999; expect(r.expire()).toBeUndefined(); now = 30_000; expect(r.expire()).toBeDefined();
  expect(r.expire()).toBeUndefined(); feed(r, { ...raw(100), gameId: "next1234" }); expect(r.finish()).toBeUndefined();
  feed(r, { inGame: false, visible: false }); feed(r, raw(0));
  expect(feed(r, { ...raw(50), gameOver: true })).toHaveLength(1);
  expect(feed(r, { ...raw(60), gameOver: true })).toHaveLength(0);
});
it("uses hysteresis and counts affordable idle City time only without observed spending", () => {
  const r = new MatchRecorder();
  feed(r, raw(0, 710_000, { gold: "200000" }));
  feed(r, raw(50, 690_000, { gold: "210000" }));
  feed(r, raw(100, 670_000, { gold: "220000" }));
  feed(r, raw(150, 670_000, { gold: "120000" }));
  const m = r.finish()!;
  expect(m.samples.map(s => s.zone)).toEqual(["wasting", "wasting", "high", "high"]);
  expect(m.summary.timeInZone.wasting).toBe(10); expect(m.summary.idleGoldSeconds).toBe(10);
});
it("uses 100-tick spacing after an hour and bounds a long recording below 2 MB", () => {
  const r = new MatchRecorder(); feed(r, raw(0));
  for (let tick = 50; tick <= 36_100; tick += 50) feed(r, raw(tick));
  const m = r.finish()!;
  expect(m.samples.filter(s => s.tick >= 35_950).map(s => s.tick)).toEqual([35_950, 36_050, 36_100]);
  const long = new MatchRecorder();
  for (let tick = 0; tick <= 864_000; tick += 100) feed(long, raw(tick, tick % 200 ? 100_000 : 800_000));
  expect(new TextEncoder().encode(JSON.stringify(long.finish())).length).toBeLessThanOrEqual(MAX_MATCH_BYTES);
});
it("keeps missing rank unknown and does not fabricate wins or losses on incomplete recordings", () => {
  const r = new MatchRecorder(); feed(r, { ...raw(0), leaderboard: [] });
  expect(r.finish()!.summary.finalRank).toBeUndefined();
  const winner = new MatchRecorder(); const v = raw(0, 500_000, { alive: true }); v.leaderboard![0]!.rank = 1;
  feed(winner, v); expect(feed(winner, { ...v, tick: 10, gameOver: true })[0]!.outcome).toBe("won");
  const partial = new MatchRecorder(); feed(partial, v); expect(partial.finish()!.outcome).toBe("unknown");
});
it("matches clan-tagged own ranks and records each ending", () => {
  const r = new MatchRecorder(); const v = raw(0, 500_000, { name: "Tidewalker", clanTag: "QX", alive: true });
  v.leaderboard = [{ rank: 20, name: "QX Tidewalker", isMe: false, landPct: 4, gold: "0", troops: "50K" }];
  feed(r, v); feed(r, { ...v, tick: 30, me: { ...v.me, alive: false } });
  expect(r.finish()).toMatchObject({ outcome: "eliminated", endedAtSec: 3, summary: { finalRank: 20 } });
  const left = new MatchRecorder(); feed(left, v);
  expect(feed(left, { inGame: false, visible: false })[0]?.outcome).toBe("left");
  const land = new MatchRecorder(); v.leaderboard[0]!.landPct = 80;
  expect(feed(land, { ...v, gameOver: true })[0]?.outcome).toBe("won");
  const unknown = new MatchRecorder(); feed(unknown, raw(0));
  expect(unknown.finish()?.outcome).toBe("unknown");
});
it("debounces build flapping, requires a full second, and caps builds per sample", () => {
  const r = new MatchRecorder();
  [3, 2, 3, 2, 3].forEach((cityLevels, i) => feed(r, raw(i * 10, 480_000, { cityLevels })));
  expect(r.finish()!.events.filter(e => e.kind === "build")).toHaveLength(0);
  const stable = new MatchRecorder(); feed(stable, raw(0));
  feed(stable, raw(5, 480_000, { cityLevels: 1 })); feed(stable, raw(10, 480_000, { cityLevels: 1 }));
  feed(stable, raw(15, 480_000, { cityLevels: 1 })); feed(stable, raw(25, 480_000, { cityLevels: 0 }));
  feed(stable, raw(35, 480_000, { cityLevels: 1 })); feed(stable, raw(45, 480_000, { cityLevels: 1 }));
  expect(stable.finish()!.events.filter(e => e.kind === "build")).toEqual([{ kind: "build", unit: "cityLevels", t: 1.5, levels: 1 }]);
  const capped = new MatchRecorder();
  const counts = (n: number) => ({ cityLevels: n, portLevels: n, factoryLevels: n, defensePosts: n, samLaunchers: n, silos: n });
  [0, 1, 1, 1].forEach((n, i) => feed(capped, raw(i * 10, 480_000, counts(n))));
  const builds = capped.finish()!.events.filter(e => e.kind === "build");
  expect(builds.filter(e => e.t === 2)).toHaveLength(5); expect(builds).toHaveLength(6);
});
// Live 2026-10-18: isAlive() is false until a spawn is picked; both matches were saved as eliminated at 0.7 s.
it("does not count the spawn phase as an elimination, and repairs old recordings that did", () => {
  const r = new MatchRecorder();
  feed(r, { ...raw(5, 0, { alive: false }), inSpawnPhase: true });
  feed(r, raw(200, 500_000, { alive: true }));
  expect(feed(r, { inGame: false, visible: false })[0]).toMatchObject({ outcome: "left" });
  const bad: RecordedMatch = { ...feedAndFinish(), outcome: "eliminated", endedAtSec: 0.7 };
  expect(repairSpawnElimination(bad)).toMatchObject({ outcome: "unknown" });
  expect(repairSpawnElimination(bad).endedAtSec).toBeUndefined();
  expect(repairSpawnElimination({ ...bad, endedAtSec: 300 }).outcome).toBe("eliminated");
});
function feedAndFinish(): RecordedMatch {
  const r = new MatchRecorder();
  for (let tick = 0; tick <= 1000; tick += 50) feed(r, raw(tick, 500_000, { alive: true }));
  return r.finish()!;
}

// Live 2026-10-18: two matches showed "best rank 1" from the spawn phase, where every player is tied.
it("ignores ranks from the first 30 seconds when picking the best rank", () => {
  const r = new MatchRecorder();
  const at = (tick: number, rank: number) => { const v = raw(tick); v.leaderboard![0]!.rank = rank; return v; };
  feed(r, at(50, 1)); feed(r, at(600, 7)); feed(r, at(900, 9));
  expect(r.finish()!.summary).toMatchObject({ bestRank: 7, finalRank: 9 });
});

it("never records ally display names or requests", () => {
  const r = new MatchRecorder();
  feed(r, raw(0, 480000, { alliances: [{ with: "ally:p7", name: "Ember" }], allianceRequests: [{ from: "ally:p7", name: "Ember", atWar: false }] }));
  expect(JSON.stringify(r.finish())).not.toMatch(/Ember|ally:p7/);
});
it("records nudge outcomes on the recording clock, never in ranked", () => {
  const r = new MatchRecorder(() => 0); feed(r, raw(600)); feed(r, raw(620));
  r.recordNudge("game1234", 620, "danger", "ignored");
  r.recordNudge("game1234", 620, "bogus", "ignored");
  r.recordNudge("game1234", 620, "noAlly", "bogus");
  r.recordNudge("other", 620, "noAlly", "cleared");
  r.recordNudge("game1234", 1000, "noAlly", "cleared");
  feed(r, raw(640)); r.recordNudge("game1234", 640, "allyRequest", "cleared");
  expect(r.finish()!.events.filter(e => e.kind === "nudge")).toEqual([
    { kind: "nudge", t: 2, nudgeKind: "danger", outcome: "ignored" },
    { kind: "nudge", t: 4, nudgeKind: "allyRequest", outcome: "cleared" },
  ]);
  const ranked = new MatchRecorder(() => 0);
  const rankedRaw = (tick: number): RawExtract => ({ ...raw(tick), game: { map: "World", mode: "Free For All", rankedType: "ffa" } });
  feed(ranked, rankedRaw(600)); feed(ranked, rankedRaw(620)); ranked.recordNudge("game1234", 620, "danger", "ignored");
  expect(ranked.finish()?.events.filter(e => e.kind === "nudge") ?? []).toEqual([]);
});
