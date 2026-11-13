import { coachLine, roleLabel, type PreparedDrill, type DrillEvidence } from "@flashfront/core";
import { QualityBadge } from "../../renderer/src/GameReview";
import { useDialog } from "./useDialog";

export type CoachEvidence = DrillEvidence & { landLostPct?: number };
export interface CoachCardProps {
  drill: PreparedDrill; evidence: CoachEvidence; coachSendPct?: number; coachSendTroops?: number;
  lite?: boolean; reducedMotion?: boolean; hasCoach?: boolean;
  onRewind(): void; onTryAgain(): void; onKeepPlaying(): void;
}
const percentage = (n?: number) => n !== undefined && Number.isFinite(n) ? `${Math.round(n)}%` : "Unavailable";
const HEADLINE = { sendSize: "Keep a reserve", allyDecision: "Choose your border", postsBeforePush: "Post before the push" };
export function CoachCard({ drill, evidence, coachSendPct, coachSendTroops, lite, reducedMotion, hasCoach = true, onRewind, onTryAgain, onKeepPlaying }: CoachCardProps) {
  const ref = useDialog(event => {
    const key = event.key.toLowerCase();
    const action = key === "enter" ? hasCoach ? onRewind : onTryAgain : key === "t" ? onTryAgain : key === "escape" ? onKeepPlaying : undefined;
    // Enter on a focused button keeps that button's native activation semantics.
    if (key === "enter" && event.target instanceof HTMLButtonElement) return;
    if (action) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) action(); }
  });
  const line = coachLine(drill.role, drill.mistake, evidence);
  return <div ref={ref} className="ff-training-card ff-glass" role="dialog" aria-modal="true" aria-labelledby="ff-coach-title" tabIndex={-1} data-motion={!lite && !reducedMotion ? "slide" : undefined}>
    <div className="ff-coach-heading"><QualityBadge label="costly" /><span>{roleLabel(drill.role)}</span></div>
    <h2 id="ff-coach-title">{HEADLINE[drill.mistake]}</h2><p>{line.text}</p>
    <dl className="ff-coach-numbers"><div><dt>You sent</dt><dd>{percentage(evidence.sentPct)}</dd></div><div><dt>Coach sends</dt><dd>{coachSendPct !== undefined ? percentage(coachSendPct) : coachSendTroops !== undefined && Number.isFinite(coachSendTroops) ? `${Math.round(coachSendTroops).toLocaleString()} troops` : "Unavailable"}</dd></div><div><dt>Land it cost</dt><dd>{percentage(evidence.landLostPct)}</dd></div></dl>
    <div className="ff-training-actions">{hasCoach && <button className="ff-btn-primary" onClick={onRewind}>Rewind and watch the coach</button>}<button className={hasCoach ? "ff-btn-secondary" : "ff-btn-primary"} onClick={onTryAgain}>Try again</button><button className="ff-btn-ghost" onClick={onKeepPlaying}>Keep playing</button></div>
  </div>;
}
