import { formatDuration, formatTroops } from "./format";
import { secondsToReachTroops, sweetSpotFraction } from "./mechanics";
import type { GameSnapshot } from "./types";
import { atGrowthCap, percentOfMax } from "./attack";
import { DEFAULT_RESERVE_FLOOR } from "./habits";
import { buildPin } from "./build";

export type DecisionKind = "danger" | "recovery" | "losingGround" | "exposed" | "idleGold" | "growth" | "renew" | "noAlly";
export interface Decision { kind: DecisionKind; text: string; tone: "danger" | "warning" | "muted"; }
export interface DecisionSample {
  t: number; troops: number; max: number; tiles: number; cityCost?: number; gold: number; outgoing?: number;
}
export interface DecisionHistory {
  samples: DecisionSample[];
  shown: Partial<Record<DecisionKind, number>>;
  active?: DecisionKind;
  recovering?: boolean;
  saving?: boolean;
}
export type SnoozedDecisions = Partial<Record<DecisionKind, number>>;
export const SNOOZE_HOTKEY = "Ctrl+Alt+S";
export const survivalMode = (s: GameSnapshot) => s.phase === "playing" && s.elapsedSec < 180;
export function decisionSample(s: GameSnapshot): DecisionSample | undefined {
  return s.self && s.phase === "playing" ? { t: s.elapsedSec, troops: s.self.troops, max: s.self.maxTroops,
    tiles: s.self.tilesOwned, gold: s.self.gold, outgoing: s.self.outgoingAttacks, cityCost: s.self.buildings.find(b => b.type === "City")?.nextCost } : undefined;
}
export const floorPercent = (floor: number) => Number.isFinite(floor) ? Math.min(60, Math.max(20, floor)) : DEFAULT_RESERVE_FLOOR;
function recovering(samples: DecisionSample[], floor: number, active = false): boolean {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!; const prev = samples[i - 1];
    if (prev && s.t > prev.t && s.t - prev.t <= 5 && prev.max > 0
      && s.outgoing !== undefined && prev.outgoing !== undefined && s.outgoing > prev.outgoing
      && prev.troops - s.troops >= prev.max * 0.1) active = true;
    if (s.max > 0 && s.troops >= s.max * floor / 100) active = false;
  }
  return active;
}
/** Every active condition in priority order, before display filtering. History is own numbers only. */
export function decisionCandidates(snapshot: GameSnapshot, history: DecisionHistory, reserveFloor = DEFAULT_RESERVE_FLOOR): Decision[] {
  const me = snapshot.self;
  if (snapshot.phase !== "playing" || snapshot.mode === "Ranked" || snapshot.observer || !me || !Number.isFinite(me.maxTroops) || me.maxTroops <= 0) return [];
  const current = decisionSample(snapshot)!;
  const samples = [...history.samples.filter(s => s.t < current.t), current];
  const fraction = me.troops / me.maxTroops;
  const floor = floorPercent(reserveFloor);
  const recoverySec = secondsToReachTroops(me.troops, me.maxTroops, me.maxTroops * floor / 100);
  // A new card needs at least 5 s of recovery: early expansion dips under the floor for a second or
  // two after every push (live 2026-10-18: 7 cards in 80 s). A card already showing stays to the floor.
  const recovery = fraction * 100 < floor && (history.recovering ?? recovering(samples, floor))
    && (history.active === "recovery" || !(recoverySec < 5));
  const renew = me.alliances.map(a => ({ ...a, seconds: a.expiresAtTick === undefined || snapshot.ticksPerSecond <= 0 ? Infinity : (a.expiresAtTick - snapshot.tick) / snapshot.ticksPerSecond }))
    .filter(a => a.renewRequested || (a.seconds > 0 && a.seconds < 30)).sort((a, b) => a.seconds - b.seconds)[0];
  const incoming = me.incomingAttacks.reduce((sum, a) => sum + (Number.isFinite(a.troops) ? Math.max(0, a.troops) : 0), 0);
  const sustained = (predicate: (s: DecisionSample) => boolean) => {
    let since = current.t;
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i]!;
      if (!predicate(sample) || since - sample.t > 5) break;
      since = sample.t;
    }
    return current.t - since;
  };
  const affordable = sustained(s => current.cityCost !== undefined && s.cityCost === current.cityCost && s.gold >= current.cityCost);
  const high = sustained(s => s.max > 0 && atGrowthCap(s.troops / s.max));
  const drop = samples.some((s, i) => i > 0 && current.t - s.t <= 20
    && s.t - samples[i - 1]!.t <= 5 && samples[i - 1]!.troops - s.troops >= samples[i - 1]!.max * 0.1);
  const past = samples.filter(s => s.t <= current.t - 10 && s.t >= current.t - 15).at(-1);
  const choices: (Decision | false)[] = [
    incoming > 0 && incoming >= me.troops * 0.8 && { kind: "danger", tone: "danger", text: `Big attack: ${formatTroops(incoming)} incoming vs your ${formatTroops(me.troops)}.` },
    recovery && { kind: "recovery", tone: "warning", text: `Recovering: ${Math.floor(fraction * 100)}% → ${floor}% · ${Number.isFinite(recoverySec) ? formatDuration(Math.ceil(recoverySec)) : "estimate paused"}` },
    survivalMode(snapshot) && !!past && past.tiles > 0 && me.tilesOwned <= past.tiles * 0.95 && fraction < 0.35
      && { kind: "losingGround", tone: "danger", text: "Losing ground with reserves below 35%." },
    fraction < 0.25 && drop && { kind: "exposed", tone: "danger", text: `Exposed at ${Math.floor(fraction * 100)}%. Back to sweet spot in ${formatDuration(Math.ceil(secondsToReachTroops(me.troops, me.maxTroops, sweetSpotFraction(me.maxTroops) * me.maxTroops)))}.` },
    !history.saving && affordable >= 30 && { kind: "idleGold", tone: "warning", text: `City affordable for ${formatDuration(affordable)} · +25K max troops` },
    high >= 20 && { kind: "growth", tone: "warning", text: `Growth slowing at ${percentOfMax(fraction)}% of max.` },
    !!renew && { kind: "renew", tone: "warning", text: renew.seconds > 0 && renew.seconds < 30 ? `Alliance ends in ${formatDuration(Math.ceil(renew.seconds))} · renewal open.` : "Alliance renewal requested." },
    snapshot.elapsedSec >= 90 && me.alliances.length === 0 && incoming < me.troops * 0.8 && { kind: "noAlly", tone: "muted", text: "No ally yet." },
  ];
  return choices.filter((d): d is Decision => !!d);
}
/** The decision card retains its existing suppression, snooze and cooldown rules. */
export function nextDecision(snapshot: GameSnapshot, history: DecisionHistory, now: number, snoozed: SnoozedDecisions, reserveFloor = DEFAULT_RESERVE_FLOOR, suppress: readonly DecisionKind[] = []): Decision | undefined {
  return decisionCandidates(snapshot, history, reserveFloor).find(d => !suppress.includes(d.kind) && (snoozed[d.kind] ?? -Infinity) <= now
    && (["danger", "recovery", "losingGround", "exposed"].includes(d.kind) || history.active === d.kind || now - (history.shown[d.kind] ?? -Infinity) >= 90));
}

/** Bounded UI session state. Selection remains independently testable and side-effect free. */
export class DecisionTracker {
  candidates: Decision[] = [];
  history: DecisionHistory = { samples: [], shown: {} };
  snoozed: SnoozedDecisions = {};
  private game?: string;
  private tick = -1;
  observe(snapshot: GameSnapshot, now: number, reserveFloor = DEFAULT_RESERVE_FLOOR, suppress: readonly DecisionKind[] = []): Decision | undefined {
    if (this.game !== snapshot.gameId || snapshot.tick < this.tick) {
      this.history = { samples: [], shown: {} }; this.snoozed = {};
    }
    this.game = snapshot.gameId; this.tick = snapshot.tick;
    const sample = decisionSample(snapshot);
    const prev = this.history.samples.at(-1);
    if (sample) this.history.recovering = recovering(prev ? [prev, sample] : [sample], floorPercent(reserveFloor), this.history.recovering);
    else this.history.recovering = false;
    this.history.saving = buildPin.get(snapshot.gameId, snapshot.elapsedSec) !== undefined;
    this.candidates = decisionCandidates(snapshot, this.history, reserveFloor);
    const decision = nextDecision(snapshot, this.history, now, this.snoozed, reserveFloor, suppress);
    if (decision && decision.kind !== this.history.active) this.history.shown[decision.kind] = now;
    this.history.active = decision?.kind;
    if (sample && this.history.samples.at(-1)?.t !== sample.t) this.history.samples.push(sample);
    this.history.samples = this.history.samples.filter(s => snapshot.elapsedSec - s.t <= 180).slice(-400);
    return decision;
  }
  isSnoozed(now: number): boolean { return Object.values(this.snoozed).some(until => until !== undefined && until > now); }
  snooze(now: number) {
    if (this.history.active) this.snoozed[this.history.active] = now + 120;
    this.history.active = undefined;
  }
}
