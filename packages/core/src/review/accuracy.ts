import type { Opening } from "./allies";
import type { LabelledPush } from "./labels";
import { REVIEW_THRESHOLDS as T } from "./thresholds";
import type { IncomingWave } from "./waves";

export interface AccuracyBreakdown {
  value?: number;
  base?: number;
  rated: number;
  goodOrGreat: number;
  neutral: number;
  opening: number;
  defense: number;
  reason?: "fewPushes";
}

export function accuracy(
  pushes: LabelledPush[],
  waves: IncomingWave[],
  opening: Opening
): AccuracyBreakdown {
  let rated = 0;
  let goodOrGreat = 0;
  let neutral = 0;
  let credit = 0;
  let openingScore = 0;
  let defense = 0;

  if (opening.applicable) {
    const portEarly = opening.portSec !== undefined && opening.portSec <= T.openingSec;
    const allyEarly = opening.allySec !== undefined && opening.allySec <= T.openingSec;
    if (portEarly && allyEarly) {
      openingScore = T.openingBonus;
    } else if (!portEarly && !allyEarly) {
      openingScore = -T.openingBonus;
    }
  }

  for (const wave of waves) {
    if (!wave.rated) continue;
    if (wave.post === "onTime") {
      defense += T.defenseOnTime;
    } else if (wave.post === "late" || wave.post === "none") {
      if ((wave.landLostPct ?? 0) >= T.lossTolerancePct) {
        defense -= T.defenseMissed;
      }
    }
  }
  defense = Math.max(-T.defenseCap, Math.min(T.defenseCap, defense));

  for (const push of pushes) {
    if (push.rated && push.label !== undefined && push.accuracyCredit !== undefined && Number.isFinite(push.accuracyCredit)) {
      rated++;
      credit += Math.max(0, Math.min(1, push.accuracyCredit));
      if (push.label === "good" || push.label === "great") {
        goodOrGreat++;
      }
      if (push.label === "neutral") neutral++;
    }
  }

  if (rated < T.accuracyMinRated) {
    return {
      rated,
      goodOrGreat,
      neutral,
      opening: openingScore,
      defense,
      reason: "fewPushes",
    };
  }

  const base = 100 * credit / rated;
  const value = Math.max(0, Math.min(100, Math.round(base + openingScore + defense)));

  return {
    value,
    base,
    rated,
    goodOrGreat,
    neutral,
    opening: openingScore,
    defense,
  };
}
