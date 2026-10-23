import { secondsToReachTroops, sweetSpotFraction, troopGrowthPerSec } from "./mechanics";

export type TroopZone = "exposed" | "low" | "sweet" | "high" | "wasting";
/**
 * The one zone vocabulary (DESIGN.md): growth gauge, attack preview, Training, chips, field reports and
 * match review all use these words. Never "high".
 */
export const ZONE_LABELS: Record<TroopZone, string> = { exposed: "exposed", low: "low", sweet: "sweet spot", high: "above sweet spot", wasting: "growth slowing" };
export const zoneLabel = (zone: TroopZone) => ZONE_LABELS[zone];
const ZONE_DETAIL: Partial<Record<TroopZone, string>> = { exposed: "under 25% of max", low: "rebuilding", wasting: "70% of max or more" };
/** The zone word plus its fact, for the growth gauge's status chip: "growth slowing · 70% of max or more". */
export const zoneStatus = (zone: TroopZone) => ZONE_DETAIL[zone] ? `${ZONE_LABELS[zone]} · ${ZONE_DETAIL[zone]}` : ZONE_LABELS[zone];
/** Whole percent of max, truncated like the game's numbers (the epsilon keeps 0.29 from reading 28). */
export const percentOfMax = (fraction: number) => Math.floor(fraction * 100 + 1e-9);
/** The single 70% growth threshold: true exactly when the gauge reads 70% or more. Gauge, zones and the practice goal share it. */
export const GROWTH_CAP_PERCENT = 70;
export const atGrowthCap = (fraction: number) => percentOfMax(fraction) >= GROWTH_CAP_PERCENT;
export const attackSizes = (troops: number, max: number) => [0.2, 0.3, 0.5].map(ratio => ({ ratio, ...attackPreview(troops, max, ratio) }));
export function troopZone(fractionOfMax: number, sweet: number): TroopZone {
  if (fractionOfMax < 0.25) return "exposed";
  if (fractionOfMax < sweet - 0.08) return "low";
  if (fractionOfMax <= sweet + 0.08) return "sweet";
  if (!atGrowthCap(fractionOfMax)) return "high";
  return "wasting";
}
/** Zone with hysteresis: a value must move `margin` past a boundary before the zone changes, so the
 *  gauge does not flicker when troops hover at an edge. Jumps of more than one zone apply at once. */
export function stableZone(previous: TroopZone | undefined, fractionOfMax: number, sweet: number, margin = 0.02): TroopZone {
  const next = troopZone(fractionOfMax, sweet);
  if (!previous || previous === next) return next;
  const nudged = [troopZone(fractionOfMax - margin, sweet), troopZone(fractionOfMax + margin, sweet)];
  return nudged.includes(previous) ? previous : next;
}
export interface AttackPreview {
  sent: number;
  remaining: number;
  remainingFraction: number;
  zoneNow: TroopZone;
  zoneAfter: TroopZone;
  sweet: number;
  growthNowPerSec: number;
  growthAfterPerSec: number;
  growthAtSweetPerSec: number;
  secondsBackToSweet: number;
}
export function attackPreview(troops: number, max: number, attackRatio: number): AttackPreview {
  troops = Number.isFinite(troops) ? Math.max(0, troops) : 0;
  max = Number.isFinite(max) ? Math.max(0, max) : 0;
  const ratio = Number.isFinite(attackRatio) ? Math.max(0, Math.min(1, attackRatio)) : 0;
  const sweet = sweetSpotFraction(max);
  const sent = Math.floor(troops * ratio);
  const remaining = troops - sent;
  const remainingFraction = max > 0 ? remaining / max : 0;
  return {
    sent, remaining, remainingFraction, sweet,
    zoneNow: troopZone(max > 0 ? troops / max : 0, sweet),
    zoneAfter: troopZone(remainingFraction, sweet),
    growthNowPerSec: troopGrowthPerSec(troops, max),
    growthAfterPerSec: troopGrowthPerSec(remaining, max),
    growthAtSweetPerSec: troopGrowthPerSec(sweet * max, max),
    secondsBackToSweet: secondsToReachTroops(remaining, max, sweet * max),
  };
}
