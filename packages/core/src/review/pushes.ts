import { TICKS_PER_SECOND } from "../mechanics";
import type { RecordedMatch, Sample } from "../recorder";
import { ownPlayer, targetKind, type RecordIntent, type ReviewRecord, type TargetKind } from "./record";
import { REVIEW_THRESHOLDS as T } from "./thresholds";

export interface OwnPush {
  id: string; startTick: number; endTick: number; t: number; target: string | null; targetKind: TargetKind;
  targetName?: string; boat: boolean; sends: number; sent: number; rated: boolean;
  fractionBefore?: number; fractionAfter?: number; tilesBefore?: number; tilesAfter?: number;
  landChangePct?: number; landLostPct?: number; troopsPerTile?: number;
  /** Combined fraction committed by the grouped sends, from observed available troops. */
  sendShare?: number;
  /** Largest peak-to-trough land decline in the window, as a percent of that peak. */
  landDrawdownPct?: number;
}
export function toRecordingSec(match: RecordedMatch, tick: number): number {
  const first = match.samples[0];
  return first ? first.t + (tick - first.tick) / TICKS_PER_SECOND : tick / TICKS_PER_SECOND;
}

/** A baseline must describe the player just before the action, not a later recovery. */
export function sampleBefore(match: RecordedMatch, tick: number): Sample | undefined {
  for (let i = match.samples.length - 1; i >= 0; i--) {
    const sample = match.samples[i]!;
    if (sample.tick <= tick) return tick - sample.tick <= T.sampleMaxGapSec * TICKS_PER_SECOND ? sample : undefined;
  }
  return undefined;
}

/** Shared own-land coverage rule for pushes and incoming waves. */
export function measureWindow(match: RecordedMatch, startTick: number, endTick: number): {
  rated: boolean; tilesBefore?: number; tilesAfter?: number; landChangePct?: number; landLostPct?: number; landDrawdownPct?: number;
} {
  const before = sampleBefore(match, startTick), last = match.samples.at(-1);
  if (!before || !last || !Number.isFinite(before.tiles) || before.tiles <= 0) return { rated: false };
  const gap = T.sampleMaxGapSec * TICKS_PER_SECOND;
  const eliminated = (match.outcome === "eliminated" || match.outcome === "loss")
    && last.tick >= (match.endedAtSec === undefined ? last.tick : match.endedAtSec * TICKS_PER_SECOND) - gap;
  if (last.tick < endTick && !eliminated) return { rated: false };
  const window = match.samples.filter(s => s.tick >= startTick && s.tick <= endTick);
  const after = window.at(-1);
  if (!after || after.tick < Math.min(endTick, last.tick) - gap
    || window.some((s, i) => !Number.isFinite(s.tiles) || s.tiles < 0
      || s.tick - (window[i - 1] ?? before).tick > T.windowMaxGapSec * TICKS_PER_SECOND)) return { rated: false };
  const lowest = Math.min(before.tiles, ...window.map(s => s.tiles));
  let peak = before.tiles, landDrawdownPct = 0;
  for (const sample of window) {
    peak = Math.max(peak, sample.tiles);
    landDrawdownPct = Math.max(landDrawdownPct, (peak - sample.tiles) / peak * 100);
  }
  return { rated: true, tilesBefore: before.tiles, tilesAfter: after.tiles,
    landChangePct: (after.tiles - before.tiles) / before.tiles * 100,
    landLostPct: (before.tiles - lowest) / before.tiles * 100, landDrawdownPct };
}

type Send = Extract<RecordIntent, { kind: "attack" | "boat" }>;
export function extractPushes(record: ReviewRecord, match: RecordedMatch): OwnPush[] {
  const own = ownPlayer(record, match.me.clientId ?? "");
  if (!own) return [];
  const groups: Send[][] = [], current = new Map<string, Send[]>();
  const spent = new Map<Sample, number | null>(), reserves = new Map<Send, number>();
  const shares = new Map<Send, number>();
  for (const intent of record.intents) {
    if (intent.by !== own.clientId || (intent.kind !== "attack" && intent.kind !== "boat")) continue;
    const baseline = sampleBefore(match, intent.tick);
    if (baseline) {
      const previous = spent.get(baseline) ?? (spent.has(baseline) ? null : 0);
      const total = previous === null || intent.troops === null ? null : previous + intent.troops;
      spent.set(baseline, total);
      if (total !== null && previous !== null && Number.isFinite(total) && intent.troops! >= 0
        && Number.isFinite(baseline.troops) && baseline.troops > 0 && Number.isFinite(baseline.maxTroops) && baseline.maxTroops > 0) {
        reserves.set(intent, Math.max(0, (baseline.troops - total) / baseline.maxTroops));
        const available = Math.max(0, baseline.troops - previous);
        shares.set(intent, intent.troops === 0 ? 0 : available === 0 ? 1 : Math.min(1, intent.troops! / available));
      }
    }
    const key = intent.kind === "boat" ? "boat" : `attack:${intent.target ?? "w"}`;
    let group = current.get(key);
    if (!group || intent.tick - group.at(-1)!.tick > T.sendGroupGapSec * TICKS_PER_SECOND) {
      group = []; groups.push(group); current.set(key, group);
    }
    group.push(intent);
  }
  return groups.map(group => {
    const first = group[0]!, endTick = group.at(-1)!.tick;
    const boat = first.kind === "boat", target = first.kind === "attack" ? first.target : null;
    const kind = boat ? "unknown" : targetKind(record, target);
    const push: OwnPush = {
      id: `${first.tick}-${boat ? "boat" : target ?? "w"}`, startTick: first.tick, endTick,
      t: toRecordingSec(match, first.tick), target, targetKind: kind, boat, sends: group.length,
      sent: group.reduce((sum, send) => sum + (send.troops ?? 0), 0), rated: false,
    };
    if (kind === "human") push.targetName = record.players.find(p => p.playerId === target)?.name;
    const before = sampleBefore(match, first.tick);
    if (!before || group.some(send => !reserves.has(send))) return push;
    const land = measureWindow(match, first.tick, endTick + T.landWindowSec * TICKS_PER_SECOND);
    if (!land.rated) return push;
    Object.assign(push, land);
    push.fractionBefore = before.troops / before.maxTroops;
    push.fractionAfter = Math.min(...group.map(send => reserves.get(send)!));
    // Equivalent to 1 - product(1 - share): repeated sends accumulate, bounded at 100%.
    // Each denominator subtracts earlier sends to every target sharing that sample.
    push.sendShare = group.reduce((combined, send) => combined + (1 - combined) * shares.get(send)!, 0);
    const gained = push.tilesAfter! - push.tilesBefore!;
    if (gained > 0) push.troopsPerTile = push.sent / gained;
    return push;
  });
}
