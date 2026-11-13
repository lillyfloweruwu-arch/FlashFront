import { nextBuild } from "./build";
import { DecisionTracker, floorPercent, type Decision, type DecisionKind } from "./decisions";
import { formatTroops } from "./format";
import { incomingAlarm } from "./habits";
import { nudgeLine, type LineValues, type NudgeKind } from "./nudge-lines";
import { spotsFor } from "./spawn";
import type { Alliance, AllianceRequest, GameSnapshot } from "./types";

export interface NudgeCandidate { kind: NudgeKind; situation: string; urgent: boolean; text: string }
export interface NudgeContext { reserveFloor: number; decisions: readonly Decision[]; portIdleSec: number }

export type RequestRead = "atWar" | "bigger" | "smaller" | "similar" | "unknown";
const REQUEST_READS: readonly RequestRead[] = ["atWar", "bigger", "smaller", "similar", "unknown"];
/** What the screen shows about a requester: at war with you, and relative land from the rendered leaderboard. */
export function requestRead(request: Pick<AllianceRequest, "atWar" | "landPct">, ownLandPct: number): RequestRead {
  if (request.atWar) return "atWar";
  if (request.landPct === undefined || !Number.isFinite(request.landPct) || !(ownLandPct > 0)) return "unknown";
  const ratio = request.landPct / ownLandPct;
  return ratio >= 1.5 ? "bigger" : ratio <= 0.67 ? "smaller" : "similar";
}

/**
 * Every nudge that applies right now, urgent first, then by priority. Own numbers, the game's own
 * incoming-attack list and own alliances only. Empty outside a live, unrestricted match.
 */
export function nudgeCandidates(snapshot: GameSnapshot, ctx: NudgeContext): NudgeCandidate[] {
  const me = snapshot.self;
  if (snapshot.phase !== "playing" || snapshot.observer || snapshot.mode === "Ranked" || !me) return [];
  const has = (kind: DecisionKind) => ctx.decisions.some(d => d.kind === kind);
  const incoming = me.incomingAttacks.reduce((sum, a) => sum + (Number.isFinite(a.troops) ? Math.max(0, a.troops) : 0), 0);
  const values: LineValues = {
    incoming: formatTroops(incoming), troops: formatTroops(me.troops), floor: floorPercent(ctx.reserveFloor),
    percent: me.maxTroops > 0 ? Math.floor(me.troops / me.maxTroops * 100) : 0,
  };
  const out: NudgeCandidate[] = [];
  const add = (kind: NudgeKind, situation: string, urgent: boolean, pick?: number) =>
    out.push({ kind, situation, urgent, text: nudgeLine(kind, `${snapshot.gameId}:${situation}`, pick === undefined ? values : { ...values, pick }) });
  const secondsLeft = (a: Alliance) => a.expiresAtTick === undefined || snapshot.ticksPerSecond <= 0
    ? Infinity : (a.expiresAtTick - snapshot.tick) / snapshot.ticksPerSecond;
  const ending = (a: Alliance) => { const s = secondsLeft(a); return s > 0 && s < 30; };

  if (has("danger")) add("danger", "danger", true);
  // Only the game's own incoming list and own posts: it fires as a push lands, never before, and names no border.
  else if (incomingAlarm(me) !== undefined && me.defensePosts === 0) add("noPosts", "noPosts", true);
  for (const a of me.alliances) if (ending(a)) add("allianceEnding", `ending:${a.with}:${a.expiresAtTick}`, true);
  // A request expires in about 20 s, so it outranks every calm nudge. The game's popup names the requester.
  for (const r of me.allianceRequests ?? []) add("allyRequest", `request:${r.from}`, false, REQUEST_READS.indexOf(requestRead(r, me.tilesOwnedPct)));
  for (const kind of ["recovery", "losingGround", "exposed"] as const) if (has(kind)) add(kind, kind, false);
  if (has("idleGold")) add("idleGold", `idleGold:${me.buildings.find(b => b.type === "City")?.nextCost}`, false);
  const port = me.buildings.find(b => b.type === "Port");
  if (port) {
    const situation = `port:${port.nextCost}`;
    if (snapshot.elapsedSec < 300 && spotsFor(snapshot.map)?.hasOcean === true && me.portLevels === 0 && port.nextCost <= me.gold) add("openingPort", situation, false);
    else if (ctx.portIdleSec >= 30 && nextBuild(me, snapshot.map)?.type === "Port") add("portIdle", situation, false);
  }
  if (has("growth")) add("growth", "growth", false);
  for (const a of me.alliances) if (a.renewRequested && !ending(a)) add("renewAsked", `renewAsk:${a.with}:${a.expiresAtTick}`, false);
  if (has("noAlly")) add("noAlly", "noAlly", false);
  return out;
}

export const NUDGE_TIMING = { calmSec: 4, urgentSec: 6, gapSec: 20, rearmSec: 30 } as const;
export interface Nudge extends NudgeCandidate { id: number; shownAt: number; until: number }
export type NudgeOutcome = "cleared" | "ignored";
export interface NudgeStep { current?: Nudge; ended?: { nudge: Nudge; outcome: NudgeOutcome } }

/** One nudge at a time; calm ones at most every 20 s; urgent ones jump the queue. `now` is wall seconds. */
export class NudgeQueue {
  private current?: Nudge;
  private fired = new Set<string>();
  private lastSeen = new Map<string, number>();
  private lastShownAt = -Infinity;
  private id = 0;

  step(candidates: readonly NudgeCandidate[], now: number): NudgeStep {
    for (const situation of this.fired) if (now - (this.lastSeen.get(situation) ?? -Infinity) >= NUDGE_TIMING.rearmSec) this.fired.delete(situation);
    for (const c of candidates) this.lastSeen.set(c.situation, now);
    let ended: NudgeStep["ended"];
    const shown = this.current;
    if (shown && !candidates.some(c => c.situation === shown.situation)) ended = { nudge: shown, outcome: "cleared" };
    else if (shown && now >= shown.until) ended = { nudge: shown, outcome: "ignored" };
    if (ended) this.current = undefined;
    const urgent = candidates.find(c => c.urgent && !this.fired.has(c.situation));
    if (urgent && !this.current?.urgent) {
      // A replaced calm nudge was never really seen: no outcome, and it may come back.
      if (this.current) this.fired.delete(this.current.situation);
      this.show(urgent, now);
    } else if (!this.current && now - this.lastShownAt >= NUDGE_TIMING.gapSec) {
      const next = candidates.find(c => !this.fired.has(c.situation));
      if (next) this.show(next, now);
    }
    return { current: this.current, ended };
  }
  /**
   * Hidden for a moment (HUD off, alt-tab, edit mode): no outcome, nothing re-fires. Pass what is
   * still true so a long alt-tab does not count as the situation being gone.
   */
  suspend(candidates: readonly NudgeCandidate[] = [], now?: number) {
    this.current = undefined;
    if (now !== undefined) for (const c of candidates) this.lastSeen.set(c.situation, now);
  }
  reset() {
    this.current = undefined; this.fired.clear(); this.lastSeen.clear(); this.lastShownAt = -Infinity;
  }
  private show(c: NudgeCandidate, now: number) {
    this.fired.add(c.situation); this.lastShownAt = now;
    this.current = { ...c, id: ++this.id, shownAt: now, until: now + (c.urgent ? NUDGE_TIMING.urgentSec : NUDGE_TIMING.calmSec) };
  }
}

/** Seconds of game time the Port price has stayed affordable; same rule as the HUD's BuildIdleTracker. */
class PortIdleTimer {
  private tracking?: { cost?: number; since: number | null; last: number };
  observe(self: GameSnapshot["self"], elapsedSec: number): number {
    const port = self?.buildings.find(b => b.type === "Port");
    const affordable = !!self && !!port && self.gold >= port.nextCost;
    const prev = this.tracking;
    if (!prev || prev.cost !== port?.nextCost || elapsedSec < prev.last || affordable !== (prev.since !== null)) {
      this.tracking = { cost: port?.nextCost, since: affordable ? elapsedSec : null, last: elapsedSec };
    } else prev.last = elapsedSec;
    const since = this.tracking!.since;
    return since === null ? 0 : Math.max(0, elapsedSec - since);
  }
  reset() { this.tracking = undefined; }
}

/** Runs in main on every observation. A new game, game end or a rewind forgets everything. */
export class NudgeEngine {
  private decisions = new DecisionTracker();
  private port = new PortIdleTimer();
  private queue = new NudgeQueue();
  private game?: string;
  private tick = -1;

  /** Visibility can change between observations; discard the shown nudge without an outcome. */
  suspend(): void { this.queue.suspend(); }

  observe(snapshot: GameSnapshot | null, now: number, opts: { enabled: boolean; reserveFloor: number }): NudgeStep {
    if (!snapshot || snapshot.phase !== "playing" || snapshot.gameId !== this.game || snapshot.tick < this.tick) {
      this.queue.reset(); this.port.reset(); this.decisions = new DecisionTracker();
    }
    this.game = snapshot?.phase === "playing" ? snapshot.gameId : undefined;
    this.tick = snapshot?.phase === "playing" ? snapshot.tick : -1;
    if (!snapshot || snapshot.phase !== "playing") return { current: undefined, ended: undefined };
    this.decisions.observe(snapshot, now, opts.reserveFloor);
    const portIdleSec = this.port.observe(snapshot.self, snapshot.elapsedSec);
    const candidates = nudgeCandidates(snapshot, { reserveFloor: opts.reserveFloor, decisions: this.decisions.candidates, portIdleSec });
    if (!opts.enabled) { this.queue.suspend(candidates, now); return { current: undefined, ended: undefined }; }
    return this.queue.step(candidates, now);
  }
}
