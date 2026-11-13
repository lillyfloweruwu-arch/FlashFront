import type { OwnPush } from "./pushes";
import { REVIEW_THRESHOLDS as T } from "./thresholds";

export type PushLabel = "great" | "good" | "neutral" | "costly" | "blunder";
export type LabelReason = "lowReserveLostLand" | "largeLoss" | "lostLand" | "lowReserve" | "noLand" | "efficient" | "gained";
export interface LabelledPush extends OwnPush {
  label?: PushLabel; reason?: LabelReason;
  blameWeight?: number; blamedLandLostPct?: number;
  /** Fraction of accuracy credit retained; absent when coverage is insufficient. */
  accuracyCredit?: number;
}

const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Observed loss from any attacker, weighted by committed troops; not proof of causation. */
export function labelPushes(pushes: OwnPush[], reserveFloorPct: number): LabelledPush[] {
  const floor = clamp(reserveFloorPct / 100);
  const canRate = (p: OwnPush) => p.rated && finite(p.sendShare) && finite(p.fractionAfter)
    && finite(p.landChangePct) && finite(p.landLostPct) && finite(p.landDrawdownPct ?? p.landLostPct);
  const blamedLoss = (p: OwnPush) => Math.max(0, p.landDrawdownPct ?? p.landLostPct!) * clamp(p.sendShare!) ** T.lossBlameExponent;
  const gaining = (p: OwnPush) => p.rated && finite(p.landChangePct) && p.landChangePct > 0
    && canRate(p) && finite(p.fractionAfter) && p.fractionAfter >= floor && finite(p.troopsPerTile)
    && blamedLoss(p) < T.lossTolerancePct
    && !(p.fractionAfter < T.blunderReserve && p.landLostPct! >= T.lossTolerancePct);
  return pushes.map((push, i): LabelledPush => {
    if (!canRate(push)) return { ...push, rated: false };
    const after = push.fractionAfter!, lost = push.landLostPct!;
    const blameWeight = clamp(push.sendShare!) ** T.lossBlameExponent;
    const blamedLandLostPct = blamedLoss(push);
    const reserveCost = floor > 0 ? clamp((floor - after) / floor) : 0;
    // Following loss reduces remaining credit even when reserves are already low.
    const accuracyCredit = (1 - reserveCost) * (1 - clamp(blamedLandLostPct / T.blunderLossPct));
    const scored = { ...push, blameWeight, blamedLandLostPct, accuracyCredit };
    if (after < T.blunderReserve && lost >= T.lossTolerancePct)
      return { ...scored, accuracyCredit: 0, label: "blunder", reason: "lowReserveLostLand" };
    if (blamedLandLostPct >= T.blunderLossPct) return { ...scored, label: "blunder", reason: "largeLoss" };
    if (blamedLandLostPct >= T.lossTolerancePct) return { ...scored, label: "costly", reason: "lostLand" };
    if (after < floor) return { ...scored, label: "costly", reason: "lowReserve" };
    if (push.landChangePct! <= 0) return { ...scored, label: "neutral", reason: "noLand" };
    // "Similar pushes": same game, same target kind, boats only against boats.
    const others = pushes.filter((p, j) => j !== i && gaining(p) && p.targetKind === push.targetKind && p.boat === push.boat);
    if (others.length >= T.greatMinComparables && finite(push.troopsPerTile)
      && push.troopsPerTile <= T.greatEfficiency * median(others.map(p => p.troopsPerTile!))) return { ...scored, label: "great", reason: "efficient" };
    return { ...scored, label: "good", reason: "gained" };
  });
}
