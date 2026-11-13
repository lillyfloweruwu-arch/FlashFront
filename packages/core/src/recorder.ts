import { stableZone, type TroopZone } from "./attack";
import { RULES_VERSION, sweetSpotFraction, TICKS_PER_SECOND } from "./mechanics";
import type { RawExtract } from "./raw";
import type { GameSnapshot } from "./types";
import type { DecisionKind } from "./decisions";
import { NUDGE_KINDS, type NudgeKind } from "./nudge-lines";
import type { NudgeOutcome } from "./nudges";
import { GoalTracker, tradeShare, tradeTotal, type GoalProgress, type PracticeGoal } from "./habits";

export interface Sample {
  t: number; tick: number; troops: number; maxTroops: number; gold: number; tiles: number;
  rank?: number; attackRatio: number; zone: TroopZone; incoming: number; outgoingCount: number;
  tradeGoldTotal?: number; goldEarnedTotal?: number; allianceCount?: number; portLevels?: number;
  tilesOwnedPct?: number;
}
export type MatchEvent =
  | { kind: "push"; t: number; sent: number; ratio: number; fractionBefore: number; fractionAfter: number; zoneAfter: TroopZone }
  | { kind: "zone"; t: number; zone: TroopZone }
  | { kind: "incoming"; t: number; troops: number }
  | { kind: "build"; t: number; unit: string; levels: number }
  /** 0.2.0: a moment the player marked with the bookmark hotkey, with an optional after-match note. */
  | { kind: "bookmark"; t: number; note?: string }
  | { kind: "decision"; t: number; decisionKind: DecisionKind; text: string }
  /** 0.3.0: how a coach nudge ended. Game Review shows ignored ones (sub-plan D). */
  | { kind: "nudge"; t: number; nudgeKind: NudgeKind; outcome: NudgeOutcome };
export interface RecordedMatch {
  version: 1; recordedBy: "FlashFront"; rulesVersion: string; gameVersion?: string;
  gameId?: string; map: string; mode: string; type?: string; difficulty?: string; rankedType?: string;
  startedAt: string; endedAt: string; durationSec: number;
  me: { name?: string; clientId?: string; publicId?: string };
  samples: Sample[]; events: MatchEvent[];
  summary: { peakTroops: number; peakTiles: number; peakLandPct?: number; bestRank?: number; finalRank?: number;
    timeInZone: Record<TroopZone, number>; pushes: number; exposedPushes: number; idleGoldSeconds: number;
    troopsCommitted?: number; attackTempo?: number; tradeShare?: number;
    firstPortSec?: number; firstAllySec?: number; openingComplete?: boolean };
  practiceGoal?: GoalProgress;
  /** Unknown for incomplete recordings and team outcomes. No inferred wins from an unfinished rank. */
  outcome?: "won" | "eliminated" | "left" | "unknown" | "win" | "loss";
  endedAtSec?: number;
  /** 0.2.0, opt-in: the player's OWN spawn tile. Never other players' positions. */
  spawn?: { x: number; y: number };
}
export const MAX_MATCH_BYTES = 2_000_000;
export type RecordedResult = Pick<RecordedMatch, "recordedBy" | "map" | "mode" | "durationSec" | "summary" | "outcome">;
const units = ["cityLevels", "portLevels", "factoryLevels", "defensePosts", "samLaunchers", "silos"] as const;
const text = (s: string | undefined) => s?.slice(0, 200);
const finite = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0;

/** Own-number whitelist only. Never retains a raw, snapshot, player list or attacker name. */
export class MatchRecorder {
  private match?: RecordedMatch;
  private previous?: Sample;
  private counts: Partial<Record<typeof units[number], number>> = {};
  private pending: Partial<Record<typeof units[number], { count: number; t: number }>> = {};
  private alive?: boolean;
  private gameSec = 0;
  private cityCost?: number;
  private startTick = 0;
  private periodicTick = 0;
  private lastData = 0;
  private lastTick?: number;
  private lastId?: string;
  private blocked = false;
  private budget = 0;
  private goal?: GoalTracker;
  private openingCoverage = false;
  private completed = false;
  private portSeen = false;
  private decisionKind?: DecisionKind;
  private decisionTick = -1;
  get goalProgress(): GoalProgress | undefined { return this.match?.practiceGoal; }
  constructor(private readonly now: () => number = Date.now) {}

  consume(raw: RawExtract, snapshot: GameSnapshot | null, selectedGoal?: PracticeGoal, ownSpawnHistory = false): RecordedMatch[] {
    const ended: RecordedMatch[] = [];
    const changed = (raw.gameId !== undefined && this.lastId !== undefined && raw.gameId !== this.lastId)
      || (raw.tick !== undefined && this.lastTick !== undefined && raw.tick < this.lastTick);
    if (this.match && (changed || !raw.inGame)) {
      if (this.alive === true && this.match.outcome === "unknown") this.match.outcome = "left";
      ended.push(this.finish()!);
    }
    if (changed || !raw.inGame) this.blocked = false;
    this.lastId = raw.inGame ? raw.gameId ?? this.lastId : undefined;
    this.lastTick = raw.inGame ? raw.tick ?? this.lastTick : undefined; this.lastData = this.now();
    if (!raw.inGame) return ended;
    if (!this.match && !this.blocked && !raw.replay) {
      this.startTick = raw.tick ?? snapshot?.tick ?? 0; this.periodicTick = this.startTick;
      this.previous = undefined; this.counts = {}; this.cityCost = undefined; this.budget = 0;
      this.pending = {}; this.alive = undefined; this.gameSec = 0;
      this.goal = selectedGoal ? new GoalTracker(selectedGoal) : undefined;
      this.openingCoverage = this.startTick <= 200; this.completed = false;
      this.portSeen = false;
      this.decisionKind = undefined; this.decisionTick = -1;
      this.match = {
        version: 1, recordedBy: "FlashFront", rulesVersion: RULES_VERSION, gameVersion: text(raw.gameVersion),
        gameId: text(raw.gameId), map: text(raw.game?.map) ?? "Unknown", mode: text(raw.game?.mode) ?? snapshot?.mode ?? "FFA",
        type: text(raw.game?.type), difficulty: text(raw.game?.difficulty), rankedType: text(raw.game?.rankedType),
        startedAt: new Date(this.now()).toISOString(), endedAt: "", durationSec: 0,
        me: {}, samples: [], events: [], outcome: "unknown",
        summary: { peakTroops: 0, peakTiles: 0, timeInZone: { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 }, pushes: 0, exposedPushes: 0, idleGoldSeconds: 0, troopsCommitted: 0 },
        practiceGoal: this.goal?.progress(),
      };
    }
    const m = this.match;
    if (!m) return ended;
    // spawnHeat exists only during spawn; own is present after the player has placed their spawn.
    const own = snapshot?.spawnHeat?.own;
    if (!ownSpawnHistory) delete m.spawn;
    else if (!m.spawn && raw.inSpawnPhase && !raw.replay && snapshot?.mode !== "Ranked" && !raw.game?.rankedType && raw.game?.type !== "Ranked"
      && raw.me?.alive === true && finite(own?.x) && finite(own?.y)) m.spawn = { x: own.x, y: own.y };
    m.gameId ??= text(raw.gameId); m.gameVersion ??= text(raw.gameVersion);
    m.me.name ??= text(raw.me?.displayName ?? raw.me?.name);
    m.me.clientId ??= text(raw.me?.clientId); m.me.publicId ??= text(raw.me?.profilePublicId);
    if (raw.tick !== undefined) m.durationSec = Math.max(0, (raw.tick - this.startTick) / TICKS_PER_SECOND);
    this.observe(raw, snapshot);
    if (raw.tick !== undefined) this.gameSec = raw.tick / TICKS_PER_SECOND;
    // Before a spawn is picked, isAlive() is false (live 2026-10-18): that is not an elimination.
    const dead = raw.me?.alive === false && !raw.inSpawnPhase;
    this.completed ||= raw.gameOver === true || dead;
    if (dead) {
      m.outcome = "eliminated"; m.endedAtSec ??= this.gameSec;
    }
    if (!raw.inSpawnPhase) this.alive = raw.me?.alive ?? this.alive;
    if (raw.gameOver) {
      if (raw.me?.alive === true && (m.summary.finalRank === 1
        || (snapshot?.self && snapshot.self.tilesOwnedPct >= snapshot.winTargetPct))) m.outcome = "won";
      ended.push(this.finish()!);
    }
    return ended;
  }

  private observe(raw: RawExtract, snapshot: GameSnapshot | null) {
    const m = this.match!; const self = snapshot?.self; const me = raw.me;
    if (!self || !me || !finite(raw.tick) || !finite(me.troops) || !finite(me.maxTroops) || me.maxTroops === 0) { this.openingCoverage = false; this.goal?.invalidate(); this.decisionKind = undefined; return; }
    const prev = this.previous; const fraction = self.troops / self.maxTroops;
    const s: Sample = { t: m.durationSec, tick: raw.tick, troops: self.troops, maxTroops: self.maxTroops,
      gold: self.gold, tiles: self.tilesOwned, rank: self.rank > 0 ? self.rank : undefined,
      tilesOwnedPct: finite(me.tiles) && finite(raw.landTiles) && raw.landTiles > 0 && me.tiles <= raw.landTiles ? me.tiles / raw.landTiles * 100 : undefined,
      tradeGoldTotal: tradeTotal(self), goldEarnedTotal: self.goldEarned,
      allianceCount: me.alliances?.length, portLevels: me.portLevels,
      attackRatio: self.attackRatio, zone: stableZone(prev?.zone, fraction, sweetSpotFraction(self.maxTroops)),
      incoming: (me.incoming ?? []).reduce((sum, a) => sum + (finite(a.troops) ? a.troops : 0), 0), outgoingCount: me.outgoingCount ?? 0 };
    const events: MatchEvent[] = [];
    const cost = self.buildings.find(b => b.type === "City")?.nextCost;
    if (prev) {
      const elapsed = Math.max(0, s.t - prev.t);
      m.summary.timeInZone[prev.zone] += elapsed;
      if (this.cityCost !== undefined && this.cityCost === cost && prev.gold >= this.cityCost && s.gold >= prev.gold) m.summary.idleGoldSeconds += elapsed;
      const drop = prev.troops - s.troops;
      if (drop >= prev.maxTroops * 0.1 && s.outgoingCount > prev.outgoingCount) {
        events.push({ kind: "push", t: s.t, sent: drop, ratio: prev.attackRatio,
          fractionBefore: prev.troops / prev.maxTroops, fractionAfter: fraction, zoneAfter: s.zone });
        m.summary.pushes++; if (fraction < 0.25) m.summary.exposedPushes++;
        m.summary.troopsCommitted = (m.summary.troopsCommitted ?? 0) + drop;
      }
    }
    if (s.zone !== prev?.zone && (s.zone === "wasting" || s.zone === "exposed")) events.push({ kind: "zone", t: s.t, zone: s.zone });
    if (s.incoming > 0 && (prev?.incoming ?? 0) === 0) events.push({ kind: "incoming", t: s.t, troops: s.incoming });
    let buildEvents = 0;
    for (const unit of units) {
      const count = me[unit]; const before = this.counts[unit];
      if (finite(count)) {
        if (before === undefined) this.counts[unit] = count;
        else if (count > before) {
          const pending = this.pending[unit];
          if (pending?.count === count && s.t - pending.t >= 1 && buildEvents < 5) {
            events.push({ kind: "build", t: s.t, unit, levels: count - before });
            this.counts[unit] = count; delete this.pending[unit]; buildEvents++;
          } else if (pending?.count !== count) this.pending[unit] = { count, t: s.t };
        } else delete this.pending[unit];
      } else {
        delete this.pending[unit];
      }
    }
    m.summary.peakTroops = Math.max(m.summary.peakTroops, s.troops);
    m.summary.attackTempo = m.summary.peakTroops > 0 ? (m.summary.troopsCommitted ?? 0) / m.summary.peakTroops : undefined;
    m.summary.tradeShare = tradeShare(s.tradeGoldTotal, s.goldEarnedTotal);
    const gameSec = raw.tick / TICKS_PER_SECOND;
    if (gameSec <= 300 && (s.allianceCount === undefined || (prev && s.tick - prev.tick > 50))) this.openingCoverage = false;
    if ((s.allianceCount ?? 0) > 0) m.summary.firstAllySec ??= gameSec;
    if (s.portLevels && !this.portSeen) {
      if (this.startTick <= 200 && prev?.portLevels === 0) m.summary.firstPortSec = gameSec;
      this.portSeen = true;
    }
    if (gameSec >= 300) m.summary.openingComplete ??= this.openingCoverage;
    const push = events.find(e => e.kind === "push");
    this.goal?.observe(gameSec, snapshot.phase, fraction, me.portLevels, push?.kind === "push" ? push.fractionAfter : undefined);
    m.practiceGoal = this.goal?.progress();
    m.summary.peakTiles = Math.max(m.summary.peakTiles, s.tiles);
    if (s.tilesOwnedPct !== undefined) m.summary.peakLandPct = Math.max(m.summary.peakLandPct ?? 0, s.tilesOwnedPct);
    // Ranks in the first 30 s are ties from the spawn phase, not a real best.
    if (s.rank !== undefined) {
      m.summary.finalRank = s.rank;
      if (s.t >= 30) m.summary.bestRank = Math.min(m.summary.bestRank ?? Infinity, s.rank);
    }
    const interval = s.t >= 3600 ? 100 : 50;
    if (!prev || s.tick - this.periodicTick >= interval) { this.append(s); this.periodicTick = s.tick; }
    else if (events.length) this.append(s);
    for (const event of events) { m.events.push(event); this.budget += JSON.stringify(event).length * 3; }
    this.previous = s; this.cityCost = cost;
    // Bounded memory even for event storms or days-long sessions; summaries stay exact.
    if (this.budget > 1_800_000) {
      m.samples = m.samples.filter((_, i) => i % 2 === 0); m.events = m.events.slice(-1000);
      this.budget = JSON.stringify([m.samples, m.events]).length * 3;
    }
  }
  private append(s: Sample) {
    if (this.match!.samples.at(-1)?.tick === s.tick) return;
    this.match!.samples.push(s); this.budget += JSON.stringify(s).length * 3;
  }
  /** Uses the same recording-relative clock as samples and push events. */
  recordNudge(gameId: unknown, tick: unknown, kind: unknown, outcome: unknown): void {
    const m = this.match;
    if (!m || this.completed || !this.previous || gameId !== m.gameId || typeof tick !== "number" || !Number.isFinite(tick)
      || tick < this.startTick || tick > this.previous.tick || this.previous.tick - tick > 20 || this.now() - this.lastData > 2000
      || m.rankedType || m.type === "Ranked" || m.mode === "Ranked") return;
    if (typeof kind !== "string" || !(NUDGE_KINDS as readonly string[]).includes(kind) || (outcome !== "cleared" && outcome !== "ignored")) return;
    const event: MatchEvent = { kind: "nudge", t: (tick - this.startTick) / TICKS_PER_SECOND, nudgeKind: kind as NudgeKind, outcome };
    m.events.push(event); this.budget += JSON.stringify(event).length * 3;
    this.append(this.previous);
  }
  recordDecision(gameId: unknown, tick: unknown, decision: unknown): void {
    const m = this.match;
    if (!m || this.completed || !this.previous || gameId !== m.gameId || typeof tick !== "number" || !Number.isFinite(tick)
      || tick < this.startTick || tick < this.decisionTick || tick > this.previous.tick || this.previous.tick - tick > 20 || this.now() - this.lastData > 2000
      || m.rankedType || m.type === "Ranked" || m.mode === "Ranked") return;
    if (decision == null) { this.decisionKind = undefined; this.decisionTick = tick; return; }
    if (typeof decision !== "object" || tick <= this.decisionTick) return;
    const { kind, text: label } = decision as { kind?: unknown; text?: unknown };
    if (typeof kind !== "string" || !["danger", "recovery", "losingGround", "exposed", "idleGold", "growth", "renew", "noAlly"].includes(kind)
      || typeof label !== "string" || !label || label.length > 300 || kind === this.decisionKind) return;
    this.decisionKind = kind as DecisionKind; this.decisionTick = tick;
    const event: MatchEvent = { kind: "decision", t: (tick - this.startTick) / TICKS_PER_SECOND, decisionKind: this.decisionKind, text: label };
    m.events.push(event); this.budget += JSON.stringify(event).length * 3;
    this.append(this.previous);
  }
  /** Uses the same recording-relative clock as samples and push events. */
  bookmark(): void {
    const m = this.match;
    if (!m || this.completed || !this.previous || this.now() - this.lastData > 2000) return;
    if (m.events.at(-1)?.kind === "bookmark" && m.events.at(-1)?.t === m.durationSec) return;
    const event: MatchEvent = { kind: "bookmark", t: m.durationSec };
    m.events.push(event); this.budget += JSON.stringify(event).length * 3;
    this.append(this.previous);
  }
  /** Called by a launcher timer even while CDP is disconnected. */
  expire(): RecordedMatch | undefined { return this.match && this.now() - this.lastData >= 30_000 ? this.finish() : undefined; }
  finish(): RecordedMatch | undefined {
    const m = this.match; if (!m) return undefined;
    if (this.previous) this.append(this.previous);
    m.endedAt = new Date(this.now()).toISOString();
    m.endedAtSec ??= this.gameSec;
    m.practiceGoal = this.goal?.progress(true, this.completed);
    while (new TextEncoder().encode(JSON.stringify(m)).byteLength > MAX_MATCH_BYTES) {
      m.samples = m.samples.filter((_, i) => i % 2 === 0); m.events = m.events.slice(Math.ceil(m.events.length / 2));
    }
    this.match = undefined; this.blocked = true;
    return m;
  }
}

/**
 * Recordings made before 2026-10-18 marked every match "eliminated" during the spawn phase, because
 * isAlive() is false until a spawn is picked. Such a match has an elimination time under 30 s but
 * own troops sampled well after it, so its real outcome is unknown.
 */
export function repairSpawnElimination(m: RecordedMatch): RecordedMatch {
  if (m.outcome !== "eliminated" || m.endedAtSec === undefined || m.endedAtSec >= 30) return m;
  const later = m.samples.some(s => s.t > m.endedAtSec! + 30 && s.troops > 0);
  if (!later) return m;
  const { endedAtSec: _, ...rest } = m;
  return { ...rest, outcome: "unknown" };
}
