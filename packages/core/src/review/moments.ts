import { TICKS_PER_SECOND } from "../mechanics";
import { formatDuration } from "../format";
import type { AllyRequest, Opening } from "./allies";
import type { LabelledPush, PushLabel } from "./labels";
import { REVIEW_THRESHOLDS as T } from "./thresholds";
import type { IncomingWave } from "./waves";

export type MistakeType = "allyDecision" | "postsBeforePush" | "sendSize";
export interface KeyMoment {
  tick: number; t: number; kind: "push" | "wave" | "ally" | "opening"; mistake?: MistakeType; label?: PushLabel; landLostPct: number; blamedLandLostPct?: number; text: string;
}

const pct = (fraction: number) => `${Math.floor(fraction * 100 + 1e-9)}%`;
const lost = (value: number) => `${Math.floor(value + 1e-9)}%`;
const severity = (m: KeyMoment) => m.label === "blunder" ? 2 : m.label === "costly" ? 1 : 0;

/** Every moment worth showing, worst first. Texts are observations only and never name a player. */
export function findMoments(pushes: LabelledPush[], waves: IncomingWave[], allies: AllyRequest[], opening: Opening,
  toTimeline: (tick: number) => number = tick => tick / TICKS_PER_SECOND): KeyMoment[] {
  const out: KeyMoment[] = [];
  for (const p of pushes) {
    if (p.label !== "costly" && p.label !== "blunder") continue;
    const landLostPct = p.landDrawdownPct ?? p.landLostPct ?? 0;
    const reserves = p.fractionBefore !== undefined && p.fractionAfter !== undefined ? `: reserves ${pct(p.fractionBefore)} → ${pct(p.fractionAfter)}` : "";
    const tail = landLostPct >= T.lossTolerancePct ? `, then your land fell ${lost(landLostPct)} within a minute.`
      : p.reason === "noLand" ? ", and it gained no land." : ".";
    const moment: KeyMoment = { tick: p.startTick, t: p.t, kind: "push", label: p.label, landLostPct, text: `${formatDuration(p.t)} push${reserves}${tail}` };
    if (p.blamedLandLostPct !== undefined) moment.blamedLandLostPct = p.blamedLandLostPct;
    if (p.label === "blunder" || p.reason === "lowReserve" || p.reason === "lowReserveLostLand") moment.mistake = "sendSize";
    out.push(moment);
  }
  for (const w of waves) {
    if (!w.rated || (w.landLostPct ?? 0) < T.lossTolerancePct) continue;
    const how = w.post === "none" ? "with no defense post built in the minute before" : w.post === "late" ? "before your defense post was built" : "despite a defense post";
    const moment: KeyMoment = { tick: w.startTick, t: w.t, kind: "wave", landLostPct: w.landLostPct!,
      text: `${formatDuration(w.t)} attack landed ${how}. Land fell ${lost(w.landLostPct!)}.` };
    if (w.post !== "onTime") moment.mistake = "postsBeforePush";
    out.push(moment);
  }
  for (const a of allies) {
    if (a.direction !== "incoming" || (a.outcome !== "rejected" && a.outcome !== "ignored") || a.attackedMeAfterSec === undefined) continue;
    const what = a.outcome === "rejected" ? "turned down an alliance request" : "left an alliance request unanswered";
    out.push({ tick: a.tick, t: a.t, kind: "ally", mistake: "allyDecision", landLostPct: a.landLostPct ?? 0,
      text: `${formatDuration(a.t)} you ${what}; that player attacked ${formatDuration(a.attackedMeAfterSec)} later.` });
  }
  if (opening.applicable && (opening.allySec === undefined || opening.allySec > T.openingSec)) {
    const tick = T.openingSec * TICKS_PER_SECOND, t = toTimeline(tick);
    out.push({ tick, t, kind: "opening", mistake: "allyDecision", landLostPct: 0,
      text: `${formatDuration(t)} no alliance by five minutes in.` });
  }
  return out.sort((a, b) => b.landLostPct - a.landLostPct || severity(b) - severity(a) || a.tick - b.tick);
}

export const keyMoments = (pushes: LabelledPush[], waves: IncomingWave[], allies: AllyRequest[], opening: Opening,
  toTimeline?: (tick: number) => number): KeyMoment[] =>
  findMoments(pushes, waves, allies, opening, toTimeline).slice(0, 5);

/** Land lost per mistake type. Sub-plan F sums this over recent reviews to pick the next drill. */
export function mistakeCosts(moments: KeyMoment[]): Record<MistakeType, number> {
  const costs: Record<MistakeType, number> = { allyDecision: 0, postsBeforePush: 0, sendSize: 0 };
  for (const m of moments) if (m.mistake) costs[m.mistake] += m.blamedLandLostPct ?? m.landLostPct;
  return costs;
}
