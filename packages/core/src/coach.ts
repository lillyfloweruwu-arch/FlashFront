import { formatDuration } from "./format";
import type { RecordedMatch } from "./recorder";
import { PRACTICE_GOALS, suggestedGoals, type PracticeGoal } from "./habits";
export interface CoachNote { severity: "good" | "tip" | "warning"; text: string; t?: number; }
export function nextMatchNotes(m: RecordedMatch, goal?: PracticeGoal): CoachNote[] {
  const notes = coachMatch(m);
  const success = notes.find(n => n.severity === "good") ?? { severity: "good" as const, text: `Your territory reached ${m.summary.peakTiles.toLocaleString()} tiles.` };
  const lesson = notes.find(n => n.severity === "warning") ?? notes.find(n => n.severity === "tip")!;
  const practice = goal ?? suggestedGoals(m)[0];
  return [success, lesson, { severity: "tip", text: practice ? `Next match goal: ${PRACTICE_GOALS[practice]}.` : "Next match goal: observe your reserve after a push." }];
}
export function coachMatch(m: RecordedMatch): CoachNote[] {
  const notes: CoachNote[] = []; const s = m.summary;
  const linked = m.events.find(e => e.kind === "push" && e.fractionAfter < 0.25
    && m.events.some(a => a.kind === "incoming" && a.t >= e.t && a.t - e.t <= 30));
  const exposed = linked ?? m.events.find(e => e.kind === "push" && e.fractionAfter < 0.25);
  if (s.exposedPushes) notes.push({ severity: "warning", t: exposed?.t,
    text: `${s.exposedPushes} ${s.exposedPushes === 1 ? "push left" : "pushes left"} you under 25%.${linked ? ` Incoming was observed within 30 seconds of the push at ${formatDuration(linked.t)}.` : " Reserves were exposed after those pushes."}` });
  if (s.timeInZone.wasting > 0) notes.push({ severity: "tip", t: m.samples.find(sample => sample.zone === "wasting")?.t, text: `You spent ${formatDuration(s.timeInZone.wasting)} over 70% of max. Growth slows in that range.` });
  if (s.idleGoldSeconds > 0) notes.push({ severity: "tip", text: `Gold sat unspent for ${formatDuration(s.idleGoldSeconds)} while a City was affordable.` });
  if (s.timeInZone.sweet > 0) notes.push({ severity: "good", t: m.samples.find(sample => sample.zone === "sweet")?.t, text: `You spent ${formatDuration(s.timeInZone.sweet)} in the sweet spot for troop growth.` });
  if (!s.exposedPushes) notes.push({ severity: "good", text: "No observed pushes left you under 25% of max troops." });
  if (notes.length < 3 && s.timeInZone.exposed > 0) notes.push({ severity: "tip", t: m.samples.find(sample => sample.zone === "exposed")?.t, text: `You spent ${formatDuration(s.timeInZone.exposed)} with exposed reserves.` });
  if (notes.length < 3) notes.push({ severity: "tip", t: m.events.find(e => e.kind === "push")?.t, text: `${s.pushes} observed ${s.pushes === 1 ? "push is" : "pushes are"} marked alongside the troop chart.` });
  if (notes.length < 3) notes.push({ severity: "tip", text: `This recording covers ${formatDuration(m.durationSec)}; missing observations cannot show what happened between them.` });
  if (s.attackTempo !== undefined) notes.push({ severity: "tip", text: `You committed ${s.attackTempo.toFixed(1)}× your peak troops in attacks this match.` });
  if (s.tradeShare !== undefined) notes.push({ severity: "tip", text: `Trade and trains made ${Math.round(s.tradeShare * 100)}% of your gold.${s.firstPortSec !== undefined ? ` Your first port came at ${formatDuration(s.firstPortSec)}.` : ""}` });
  else if (s.firstPortSec !== undefined) notes.push({ severity: "tip", text: `Your first port came at ${formatDuration(s.firstPortSec)}.` });
  if (s.firstAllySec !== undefined && s.firstPortSec !== undefined && Math.max(s.firstAllySec, s.firstPortSec) <= 300) notes.push({ severity: "good", text: `Port and ally by ${formatDuration(Math.max(s.firstAllySec, s.firstPortSec))} — solid opening.` });
  else if (s.openingComplete && (s.firstAllySec === undefined || s.firstAllySec > 300)) notes.push({ severity: "tip", text: "No alliance in the first 5 minutes." });
  return notes;
}
