import { describe, expect, it } from "vitest";
import type { Decision, DecisionKind } from "./decisions";
import { NudgeEngine, NudgeQueue, nudgeCandidates, requestRead, type NudgeCandidate, type NudgeContext, type NudgeStep } from "./nudges";
import type { GameSnapshot, SelfState } from "./types";

const self = (patch: Partial<SelfState> = {}): SelfState => ({
  id: "me", troops: 400_000, maxTroops: 1_000_000, troopGrowthPerSec: 0, gold: 0, goldPerSec: 0, attackRatio: 0.2,
  tilesOwned: 100, tilesOwnedPct: 10, rank: 1, alliances: [], cityLevels: 0, portLevels: 0, factoryLevels: 0,
  defensePosts: 0, samLaunchers: 0, incomingAttacks: [],
  buildings: [{ type: "City", count: 0, nextCost: 125_000 }, { type: "Port", count: 0, nextCost: 100_000 }, { type: "Factory", count: 0, nextCost: 100_000 }],
  ...patch,
} as SelfState);
const snap = (elapsedSec: number, s: SelfState | null = self(), patch: Partial<GameSnapshot> = {}): GameSnapshot => ({
  gameId: "g1", map: "World", mode: "FFA", tick: elapsedSec * 10, ticksPerSecond: 10, elapsedSec, winTargetPct: 80,
  self: s, players: [], events: [], phase: "playing", ...patch,
});
const decision = (kind: DecisionKind): Decision => ({ kind, text: kind, tone: "warning" });
const ctx = (patch: Partial<NudgeContext> = {}): NudgeContext => ({ reserveFloor: 35, decisions: [], portIdleSec: 0, ...patch });

describe("nudge sources", () => {
  it("maps decisions and own numbers to nudges, urgent first", () => {
    const s = snap(100, self({ alliances: [{ with: "ally:p7", expiresAtTick: 1200 }] }));
    const out = nudgeCandidates(s, ctx({ decisions: [decision("recovery"), decision("danger"), decision("noAlly")] }));
    expect(out.map(c => c.kind)).toEqual(["danger", "allianceEnding", "recovery", "noAlly"]);
    expect(out.map(c => c.urgent)).toEqual([true, true, false, false]);
    expect(out[1]!.situation).toBe("ending:ally:p7:1200");
    expect(out[2]!.text).toMatch(/^Attack coach: .*35%/);
  });

  it("fills the danger line from own troops and the game's incoming list", () => {
    const s = snap(100, self({ troops: 2_000_000, incomingAttacks: [{ from: "a", troops: 1_000_000 }, { from: "b", troops: 600_000 }] }));
    const [danger] = nudgeCandidates(s, ctx({ decisions: [decision("danger")] }));
    expect(danger!.text).toContain("160K");
    expect(danger!.text).toContain("200K");
  });

  it("opening port fires once per price, shared with the idle-port line", () => {
    const early = nudgeCandidates(snap(120, self({ gold: 150_000 })), ctx());
    expect(early).toContainEqual(expect.objectContaining({ kind: "openingPort", situation: "port:100000", urgent: false }));
    const late = nudgeCandidates(snap(400, self({ gold: 150_000 })), ctx({ portIdleSec: 30 }));
    expect(late.map(c => c.kind)).not.toContain("openingPort");
    expect(late).toContainEqual(expect.objectContaining({ kind: "portIdle", situation: "port:100000" }));
    expect(nudgeCandidates(snap(120, self({ gold: 150_000 }), { map: "Alps" }), ctx()).map(c => c.kind)).not.toContain("openingPort");
    expect(nudgeCandidates(snap(400, self({ gold: 150_000 })), ctx({ portIdleSec: 29 })).map(c => c.kind)).not.toContain("portIdle");
  });

  it("gives nothing outside a live unrestricted match", () => {
    const all = ctx({ decisions: [decision("danger"), decision("noAlly")] });
    expect(nudgeCandidates(snap(100, self(), { phase: "spawn" }), all)).toEqual([]);
    expect(nudgeCandidates(snap(100, self(), { observer: "replay" }), all)).toEqual([]);
    expect(nudgeCandidates(snap(100, self(), { mode: "Ranked" }), all)).toEqual([]);
    expect(nudgeCandidates(snap(100, null), all)).toEqual([]);
  });

  it("renewal asked is calm, ending is urgent", () => {
    const asked = nudgeCandidates(snap(100, self({ alliances: [{ with: "ally:p9", expiresAtTick: 3000, renewRequested: true }] })), ctx());
    expect(asked).toEqual([expect.objectContaining({ kind: "renewAsked", urgent: false, situation: "renewAsk:ally:p9:3000" })]);
    const ending = nudgeCandidates(snap(100, self({ alliances: [{ with: "ally:p9", expiresAtTick: 1100, renewRequested: true }] })), ctx());
    expect(ending.map(c => c.kind)).toEqual(["allianceEnding"]);
  });
});

describe("ally coaching", () => {
  it("reads a request from visible facts only", () => {
    expect(requestRead({ atWar: true, landPct: 30 }, 10)).toBe("atWar");
    expect(requestRead({ atWar: false, landPct: 18 }, 10)).toBe("bigger");
    expect(requestRead({ atWar: false, landPct: 15 }, 10)).toBe("bigger");
    expect(requestRead({ atWar: false, landPct: 5 }, 10)).toBe("smaller");
    expect(requestRead({ atWar: false, landPct: 11 }, 10)).toBe("similar");
    expect(requestRead({ atWar: false }, 10)).toBe("unknown");
    expect(requestRead({ atWar: false, landPct: 12 }, 0)).toBe("unknown");
  });

  it("an incoming request gives one calm coaching nudge without the requester's name", () => {
    const s = snap(100, self({ tilesOwnedPct: 10, allianceRequests: [{ from: "ally:p7", name: "Ember", atWar: false, landPct: 18 }] }));
    const out = nudgeCandidates(s, ctx());
    expect(out).toEqual([expect.objectContaining({ kind: "allyRequest", situation: "request:ally:p7", urgent: false })]);
    expect(out[0]!.text.startsWith("Head coach: Ally request from a bigger player.")).toBe(true);
    expect(out[0]!.text).not.toContain("Ember");
    s.self!.allianceRequests!.push({ from: "ally:p9", name: "Northstar", atWar: true });
    const two = nudgeCandidates(s, ctx());
    expect(two.map(c => c.situation)).toEqual(["request:ally:p7", "request:ally:p9"]);
    expect(two[1]!.text).toMatch(/^Head coach: Ally request from someone you're fighting\./);
    expect(JSON.stringify(two)).not.toMatch(/Ember|Northstar/);
  });

  it("requests sit after urgent nudges and before recovery", () => {
    const s = snap(100, self({ allianceRequests: [{ from: "ally:p7", name: "Ember", atWar: false }] }));
    const out = nudgeCandidates(s, ctx({ decisions: [decision("danger"), decision("recovery")] }));
    expect(out.map(c => c.kind)).toEqual(["danger", "allyRequest", "recovery"]);
  });
});

const cand = (situation: string, urgent = false): NudgeCandidate => ({ kind: urgent ? "danger" : "noAlly", situation, urgent, text: situation });
const a = cand("a"), b = cand("b"), u = cand("u", true), u2 = cand("u2", true);

describe("nudge queue", () => {
  it("shows a calm nudge for 4 s, then reports it ignored and never repeats it", () => {
    const q = new NudgeQueue();
    expect(q.step([a], 0).current?.kind).toBe(a.kind);
    expect(q.step([a], 3.9).current).toBeDefined();
    expect(q.step([a], 4)).toMatchObject({ current: undefined, ended: { outcome: "ignored" } });
    expect(q.step([a], 25).current).toBeUndefined();
  });
  it("disappears early when its condition clears", () => {
    const q = new NudgeQueue(); q.step([a], 0);
    expect(q.step([], 1)).toMatchObject({ current: undefined, ended: { outcome: "cleared" } });
  });
  it("one at a time, a new calm nudge at most every 20 s, highest priority first", () => {
    const q = new NudgeQueue();
    expect(q.step([a, b], 0).current?.situation).toBe(a.situation);
    q.step([b], 4); expect(q.step([b], 19.9).current).toBeUndefined();
    expect(q.step([b], 20).current?.situation).toBe(b.situation);
  });
  it("urgent jumps the queue, lasts 6 s, and the replaced calm nudge returns later", () => {
    const q = new NudgeQueue(); q.step([a], 0);
    const s = q.step([u, a], 1);
    expect(s.current).toMatchObject({ situation: u.situation, until: 7 }); expect(s.ended).toBeUndefined();
    expect(q.step([u, a], 7).ended?.outcome).toBe("ignored");
    expect(q.step([a], 21).current?.situation).toBe(a.situation);
  });
  it("urgent never replaces urgent", () => {
    const q = new NudgeQueue(); q.step([u], 0);
    expect(q.step([u, u2], 1).current?.situation).toBe(u.situation);
  });
  it("re-arms only after the situation was gone 30 s", () => {
    const early = new NudgeQueue(); early.step([a], 0); early.step([a], 4); early.step([], 5);
    expect(early.step([a], 20).current).toBeUndefined();
    const late = new NudgeQueue(); late.step([a], 0); late.step([a], 4); late.step([], 5);
    expect(late.step([a], 34).current?.situation).toBe(a.situation);
  });
  it("several conditions at once give one pill, then the next 20 s later, never a burst", () => {
    const q = new NudgeQueue(); const c = cand("c"); const shown: string[] = [];
    for (let t = 0; t <= 60; t += 0.25) { const s = q.step([a, b, c], t); if (s.current && !shown.includes(s.current.situation)) shown.push(s.current.situation); if (t === 10) expect(s.current).toBeUndefined(); }
    expect(shown).toEqual(["a", "b", "c"]);
  });
  it("suspend drops the pill without an outcome; reset forgets what fired", () => {
    const q = new NudgeQueue(); q.step([a], 0); q.suspend();
    expect(q.step([a], 1)).toEqual({ current: undefined, ended: undefined });
    q.reset(); expect(q.step([a], 2).current?.situation).toBe("a");
  });
});

describe("nudge engine", () => {
  const live = (elapsedSec: number, gameId = "g1", patch: Partial<SelfState> = {}) => snap(elapsedSec, self({ ...patch }), { gameId, tick: Math.round(elapsedSec * 10) });
  const opts = { enabled: true, reserveFloor: 35 };
  const run = (engine: NudgeEngine, from: number, to: number, make = (t: number) => live(t), o = opts) => {
    const steps: { t: number; step: NudgeStep }[] = [];
    for (let t = from; t <= to + 1e-9; t += 0.25) steps.push({ t, step: engine.observe(make(t), t, o) });
    return steps;
  };

  it("engine: no ally nudge at 1:30, once per game, back again in a new game", () => {
    const engine = new NudgeEngine();
    const steps = run(engine, 85, 130);
    const starts = steps.filter((s, i) => s.step.current && s.step.current.id !== steps[i - 1]?.step.current?.id);
    expect(starts.map(s => s.step.current!.kind)).toEqual(["noAlly"]);
    const start = starts[0]!.t; expect(start).toBeGreaterThanOrEqual(90);
    const ended = steps.filter(s => s.step.ended);
    expect(ended).toHaveLength(1);
    expect(ended[0]!.step.ended!.outcome).toBe("ignored"); expect(ended[0]!.t).toBe(start + 4);
    expect(engine.observe(live(131, "g2"), 131, opts).current?.kind).toBe("noAlly");
  });

  it("engine: forming an alliance clears the nudge", () => {
    const engine = new NudgeEngine();
    const steps = run(engine, 89, 100, t => live(t, "g1", t >= 91 ? { alliances: [{ with: "ally:p7" }] } : {}));
    expect(steps.find(s => s.t === 90)!.step.current?.kind).toBe("noAlly");
    expect(steps.find(s => s.t === 91)!.step.ended?.outcome).toBe("cleared");
  });

  it("engine: disabled hides without an outcome and doesn't re-fire", () => {
    const engine = new NudgeEngine();
    expect(engine.observe(live(90), 90, opts).current?.kind).toBe("noAlly");
    expect(engine.observe(live(91), 91, { ...opts, enabled: false })).toEqual({ current: undefined, ended: undefined });
    expect(engine.observe(live(92), 92, opts).current).toBeUndefined();
  });

  it("engine: game end and a new game drop the current nudge", () => {
    const engine = new NudgeEngine();
    expect(engine.observe(live(90), 90, opts).current?.kind).toBe("noAlly");
    expect(engine.observe({ ...live(91), phase: "ended" }, 91, opts)).toEqual({ current: undefined, ended: undefined });
    expect(engine.observe(live(90), 92, opts).current?.kind).toBe("noAlly");
    expect(engine.observe(null, 93, opts)).toEqual({ current: undefined, ended: undefined });
    expect(engine.observe(live(95, "g3"), 94, opts).current?.kind).toBe("noAlly");
    expect(engine.observe(live(96, "g4"), 95, opts).ended).toBeUndefined();
  });

  it("engine: idle-port timer counts game seconds of an affordable port at one price", () => {
    const engine = new NudgeEngine();
    const steps = run(engine, 400, 432, t => live(t, "g1", { gold: 150_000, alliances: [{ with: "ally:p7" }], buildings: [{ type: "City", count: 0, nextCost: 500_000 }, { type: "Port", count: 0, nextCost: 100_000 }] }));
    const first = steps.find(s => s.step.current);
    expect(first?.step.current?.kind).toBe("portIdle"); expect(first!.t).toBe(430);
  });
});

it("engine: a long alt-tab is not the situation going away", () => {
  const engine = new NudgeEngine(); const o = { enabled: true, reserveFloor: 35 };
  const at = (t: number) => snap(t, self(), { tick: t * 10 });
  expect(engine.observe(at(90), 90, o).current?.kind).toBe("noAlly");
  for (let t = 91; t <= 150; t++) engine.observe(at(t), t, { ...o, enabled: false });
  expect(engine.observe(at(151), 151, o).current).toBeUndefined();
});

it("no-posts nudge is urgent between 50% and 80% incoming and yields to danger", () => {
  const at = (incoming: number, defensePosts: number) => self({ troops: 1_000_000, defensePosts, incomingAttacks: [{ from: "a", troops: incoming }] });
  const sixty = nudgeCandidates(snap(200, at(600_000, 0)), ctx({ decisions: [decision("recovery")] }));
  expect(sixty.map(c => c.kind)).toEqual(["noPosts", "recovery"]);
  expect(sixty[0]).toMatchObject({ situation: "noPosts", urgent: true });
  expect(sixty[0]!.text).toMatch(/^Defense coach: /);
  expect(nudgeCandidates(snap(200, at(600_000, 1)), ctx()).map(c => c.kind)).not.toContain("noPosts");
  expect(nudgeCandidates(snap(200, at(400_000, 0)), ctx()).map(c => c.kind)).not.toContain("noPosts");
  expect(nudgeCandidates(snap(200, at(900_000, 0)), ctx({ decisions: [decision("danger")] })).map(c => c.kind)).toEqual(["danger"]);
});
