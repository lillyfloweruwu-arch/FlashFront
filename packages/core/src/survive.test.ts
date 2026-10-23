import { afterEach, expect, it } from "vitest";
import { DecisionTracker, decisionSample, nextDecision } from "./decisions";
import { buildPin, nextBuild } from "./build";
import { PushTracker, pushReasons } from "./push";
import { TradeMonitor } from "./habits";
import { MatchRecorder, type RecordedMatch, type Sample } from "./recorder";
import { debrief } from "./debrief";
import { mapToSnapshot } from "./mapToSnapshot";
import { MockDataSource } from "./mock/MockDataSource";
import type { RawExtract } from "./raw";

const snapshot = (t = 170) => {
  const s = new MockDataSource().getSnapshot();
  Object.assign(s, { gameId: "survive", phase: "playing", elapsedSec: t, tick: t * 10 });
  Object.assign(s.self!, { troops: 600000, maxTroops: 1000000, troopGrowthPerSec: 0, gold: 0, outgoingAttacks: 0,
    incomingAttacks: [], alliances: [{ with: "Own pact" }] });
  return s;
};
afterEach(() => buildPin.clear());

it("keeps recovery after a large own push until the chosen floor, even beyond the history window", () => {
  const tracker = new DecisionTracker(); const s = snapshot();
  tracker.observe(s, 170, 40);
  s.tick += 10; s.elapsedSec++; s.self!.troops = 180000; s.self!.outgoingAttacks = 1;
  expect(tracker.observe(s, 171, 40)).toMatchObject({ kind: "recovery", text: expect.stringContaining("Recovering: 18% → 40%") });
  for (let t = 172; t <= 400; t++) {
    s.tick = t * 10; s.elapsedSec = t;
    expect(tracker.observe(s, t, 40)?.kind).toBe("recovery");
  }
  s.self!.incomingAttacks = [{ from: "Incoming", troops: 180000 }];
  expect(tracker.observe(s, 401, 40)?.kind).toBe("danger");
  s.self!.incomingAttacks = []; expect(tracker.observe(s, 402, 40)?.kind).toBe("recovery");
  s.self!.troops = 400000; s.tick++; s.elapsedSec += 0.1;
  expect(tracker.observe(s, 403, 40)?.kind).not.toBe("recovery");
  s.self!.troops = 180000; s.tick++; s.elapsedSec += 0.1;
  expect(tracker.observe(s, 404, 40)?.kind).not.toBe("recovery");
});

it("requires an observed outgoing push, and resets recovery on a new game or rewind", () => {
  const s = snapshot(); const before = decisionSample(s)!;
  s.self!.troops = 180000; s.elapsedSec++; s.tick += 10;
  expect(nextDecision(s, { samples: [before], shown: {} }, 171, {})?.kind).not.toBe("recovery");
  s.self!.outgoingAttacks = 1;
  expect(nextDecision(s, { samples: [before], shown: {} }, 171, {})?.kind).toBe("recovery");
  const tracker = new DecisionTracker(); tracker.observe(snapshot(), 170); tracker.observe(s, 171);
  s.tick--; expect(tracker.observe(s, 172)?.kind).not.toBe("recovery");
  s.gameId = "next"; expect(tracker.observe(s, 173)?.kind).not.toBe("recovery");
  s.mode = "Ranked"; expect(nextDecision(s, { samples: [before], shown: {} }, 174, {})).toBeUndefined();
  s.mode = "FFA"; s.observer = "replay";
  expect(nextDecision(s, { samples: [before], shown: {} }, 174, {})).toBeUndefined();
});

it("shows renew at 28 seconds or on request, with a 90-second cooldown after clearing", () => {
  const tracker = new DecisionTracker(); const s = snapshot(100);
  s.self!.alliances = [{ with: "Pact", expiresAtTick: 1400 }];
  expect(tracker.observe(s, 100)).toBeUndefined();
  s.self!.alliances[0]!.expiresAtTick = 1280;
  expect(tracker.observe(s, 101)).toMatchObject({ kind: "renew", text: "Alliance ends in 0:28 · renewal open." });
  s.self!.alliances[0]!.expiresAtTick = 1400; tracker.observe(s, 102);
  s.self!.alliances[0]!.renewRequested = true;
  expect(tracker.observe(s, 190)).toBeUndefined();
  expect(tracker.observe(s, 191)?.kind).toBe("renew");
});

it("marks incoming, stacked outgoing and observation gaps without inventing push causes", () => {
  for (const mode of ["incoming", "stacked", "gap", "clean"] as const) {
    const tracker = new PushTracker(); const s = snapshot(0); tracker.observe(s);
    s.elapsedSec = 1; s.tick = 10; s.self!.troops = 400000; s.self!.outgoingAttacks = 1; tracker.observe(s);
    s.tick = mode === "gap" ? 31 : 20;
    if (mode === "incoming") s.self!.incomingAttacks = [{ from: "Incoming", troops: 1 }];
    if (mode === "stacked") { s.self!.outgoingAttacks = 2; s.self!.troops = 200000; }
    tracker.observe(s);
    s.tick += 10; s.self!.incomingAttacks = []; s.self!.outgoingAttacks = 0;
    const result = tracker.observe(s)!;
    expect(result.overlapped).toBe(mode === "incoming" || mode === "stacked");
    expect(result.gaps).toBe(mode === "gap");
    expect(pushReasons(result)).toEqual(["Low yield. Common causes: a strong defender, a defense post or rough terrain."]);
    expect(pushReasons({ ...result, verdict: "good" })).toEqual([]);
  }
});

const raw = (tick: number): RawExtract => ({ inGame: true, visible: true, gameId: "recorded", tick,
  me: { alive: true, troops: 500000, maxTroops: 1000000, tiles: 100, gold: "0" } });
it("bookmarks the latest observed time and ignores inactive, completed and stale recordings", () => {
  let now = 0; const recorder = new MatchRecorder(() => now);
  recorder.bookmark(); recorder.consume(raw(0), mapToSnapshot(raw(0)));
  recorder.consume(raw(420), mapToSnapshot(raw(420))); recorder.bookmark();
  now = 3000; recorder.bookmark();
  const m = recorder.finish()!; recorder.bookmark();
  expect(m.events.filter(e => e.kind === "bookmark")).toEqual([{ kind: "bookmark", t: 42 }]);
});

it("aligns bookmarks in late-start recordings and ignores them after elimination", () => {
  const recorder = new MatchRecorder();
  recorder.consume(raw(1000), mapToSnapshot(raw(1000)));
  recorder.consume(raw(1420), mapToSnapshot(raw(1420))); recorder.bookmark(); recorder.bookmark();
  const dead = { ...raw(1430), me: { ...raw(1430).me, alive: false } };
  recorder.consume(dead, mapToSnapshot(dead)); recorder.bookmark();
  expect(recorder.finish()!.events.filter(e => e.kind === "bookmark")).toEqual([{ kind: "bookmark", t: 42 }]);
});

it("copies only the first own placed spawn with opt-in, never other positions or camera data", () => {
  for (const optedIn of [false, true]) {
    const recorder = new MatchRecorder();
    const r = { ...raw(10), inSpawnPhase: true, spawnHeat: { own: { x: 12, y: 34 }, others: [{ x: 9876, y: 5432 }] } };
    recorder.consume(r, mapToSnapshot(r), undefined, optedIn);
    r.spawnHeat.own.x = 56; r.tick = 20;
    recorder.consume(r, mapToSnapshot(r), undefined, optedIn);
    const m = recorder.finish()!;
    expect(m.spawn).toEqual(optedIn ? { x: 12, y: 34 } : undefined);
    expect(JSON.stringify(m)).not.toMatch(/9876|5432|others|camera|spawnHeat/);
  }
});

it("ignores unplaced, ranked and replay spawns, and removes the own coordinate when opt-in is disabled", () => {
  for (const mode of ["unplaced", "ranked", "replay", "disabled"] as const) {
    const recorder = new MatchRecorder();
    const r: RawExtract = { ...raw(10), inSpawnPhase: true, spawnHeat: { own: { x: 12, y: 34 }, others: [] } };
    if (mode === "unplaced") r.me!.alive = false;
    if (mode === "ranked") r.game = { rankedType: "ffa" };
    if (mode === "replay") r.replay = true;
    recorder.consume(r, mapToSnapshot(r), undefined, true);
    if (mode === "disabled") recorder.consume(r, mapToSnapshot(r), undefined, false);
    expect(recorder.finish()?.spawn).toBeUndefined();
  }
});

const sample = (t: number, troops: number, tiles: number, incoming = 0): Sample => ({ t, tick: (t + 100) * 10,
  troops, maxTroops: 1000000, tiles, incoming, gold: 0, attackRatio: 0.5, zone: "low", outgoingCount: 0 });
function eliminated(): RecordedMatch {
  const recorder = new MatchRecorder(); recorder.consume(raw(1000), mapToSnapshot(raw(1000)));
  return { ...recorder.finish()!, outcome: "eliminated", durationSec: 120, endedAtSec: 200,
    samples: [sample(40, 600000, 100), sample(60, 200000, 70, 300000), sample(100, 0, 0), sample(120, 0, 0, 999999)],
    events: [{ kind: "push", t: 60, sent: 400000, ratio: 0.5, fractionBefore: 0.6, fractionAfter: 0.2, zoneAfter: "exposed" }] };
}
it("describes the final minute before elimination on the recording axis, excluding later spectating", () => {
  const m = eliminated(); const d = debrief(m)!;
  expect(d).toMatchObject({ windowSec: 60, reserveBeforeLastPush: 0.6, reserveAfterLastPush: 0.2, peakIncoming: 300000, landLostPct: 100 });
  expect(d.lines.join(" ")).toContain("60% → 20%");
  expect(d.lines.join(" ")).not.toMatch(/because|defender|terrain|always|must|should/i);
  expect(debrief({ ...m, outcome: "won" })).toBeUndefined();
  const old = { ...m, endedAtSec: undefined, events: [] };
  expect(debrief(old)?.reserveAfterLastPush).toBeUndefined();
  expect(debrief({ ...m, samples: [], events: [] })?.lines.join(" ")).toContain("unavailable");
});

it("pins any available building with progress and silences idle gold only while pinned", () => {
  const s = snapshot(100); s.self!.gold = 500; s.self!.goldPerSec = 10;
  s.self!.buildings = [{ type: "City", count: 0, nextCost: 200 }, { type: "MissileSilo", count: 0, nextCost: 1000 }];
  expect(nextBuild(s.self, s.map, "MissileSilo")).toMatchObject({ type: "MissileSilo", progress: 0.5, seconds: 50 });
  const tracker = new DecisionTracker();
  for (let t = 100; t <= 131; t++) { s.tick = t * 10; s.elapsedSec = t; tracker.observe(s, t); }
  expect(tracker.observe(s, 131)?.kind).toBe("idleGold");
  buildPin.set(s.gameId, s.elapsedSec, "MissileSilo");
  expect(tracker.observe(s, 132)?.kind).not.toBe("idleGold");
  buildPin.clear(); expect(tracker.observe(s, 221)?.kind).toBe("idleGold");
  buildPin.set(s.gameId, s.elapsedSec, "MissileSilo");
  expect(buildPin.get("another", 0)).toBeUndefined();
  buildPin.set("another", 20, "City"); expect(buildPin.get("another", 0)).toBeUndefined();
});

it("separates ships and trains and compares adjacent non-overlapping 60-second windows", () => {
  const monitor = new TradeMonitor(); const s = snapshot(0);
  const at = (t: number, ships: number, trains: number) => {
    s.elapsedSec = t; s.self!.tradeGold = ships; s.self!.trainGold = trains; return monitor.observe(s);
  };
  at(0, 1000, 500); at(10, 1100, 520); at(60, 1200, 550);
  expect(at(70, 1250, 560)).toMatchObject({ ship60: 150, train60: 40, last60: 190, prev60: 120 });
  expect(monitor.status()).toMatchObject({ ship60: 150, train60: 40, prev60: 120 });
  expect(at(130, 1250, 560)).toMatchObject({ ship60: 0, train60: 0, last60: 0, prev60: 190 });
  at(131, 0, 600); expect(monitor.status().ship60).toBe(0);
  s.self!.trainGold = undefined;
  expect(monitor.observe(s)).toMatchObject({ ship60: 0, train60: undefined, last60: undefined, prev60: undefined });
});

it("detects a factory-only economy with no income and clears trade windows on a match change", () => {
  const monitor = new TradeMonitor(); const s = snapshot(0);
  Object.assign(s.self!, { portLevels: 0, factoryLevels: 1, tradeGold: 0, trainGold: 0 });
  monitor.observe(s); s.elapsedSec = 60;
  expect(monitor.observe(s).noIncome).toBe(true);
  s.self!.trainGold = 100; monitor.observe(s);
  s.gameId = "new";
  expect(monitor.observe(s)).toMatchObject({ ship60: 0, train60: 0, prev60: 0, noIncome: false });
});
// Live 2026-10-18: early expansion fired 7 recovery cards in 80 s for gaps like "32% → 35% · 0:01".
it("skips recovery cards that would clear within 5 seconds, but keeps a card it already shows", () => {
  const tracker = new DecisionTracker(); const s = snapshot();
  tracker.observe(s, 170, 35);
  s.tick += 10; s.elapsedSec++; s.self!.troops = 330000; s.self!.outgoingAttacks = 1;        // 33% of 1M, back to 35% in about a second
  expect(tracker.observe(s, 171, 35)?.kind).not.toBe("recovery");
  const long = new DecisionTracker(); const l = snapshot();
  long.observe(l, 170, 35);
  l.tick += 10; l.elapsedSec++; l.self!.troops = 180000; l.self!.outgoingAttacks = 1;        // far below the floor
  expect(long.observe(l, 171, 35)?.kind).toBe("recovery");
  l.tick += 10; l.elapsedSec++; l.self!.troops = 340000;                                         // nearly there: stays until the floor
  expect(long.observe(l, 172, 35)?.kind).toBe("recovery");
});
