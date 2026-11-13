import { useMemo } from "react";
import { formatDuration } from "@flashfront/core";
import { LABEL_NAMES, reviewCoachLine, reviewHeadline, worstMoment } from "../../review-presentation";
import type { EndReviewModel } from "../../shared";
import { QUALITY_GLYPHS } from "./GameReview";

const COUNTS = ["great", "good", "costly", "blunder"] as const;
const RING = 2 * Math.PI * 26;

/** Layout B, sized for a 420 px card under OpenFront's own end dialog. Sample identities never appear here. */
export function EndReviewCard({ model, onFull, onRetry }: { model: EndReviewModel; onFull: () => void; onRetry: () => void }) {
  const review = model.result.status === "ready" ? model.result.review : undefined;
  const value = review?.accuracy.value;
  const retry = review && worstMoment(review, true);
  const coach = useMemo(() => (review ? reviewCoachLine(review) : undefined), [review]);
  if (!review) return <section className="end-review-card end-review-pending" aria-label="Game Review">
    <div className="end-pending-heading"><h2 className="end-title">Game Review</h2><span className="end-status">{model.result.status === "waiting" ? "Review pending" : "Unavailable"}</span></div>
    <p className="end-note">{model.result.status === "waiting" ? "Leave the match to finish your review." : "This match couldn’t be reviewed."}</p>
    <div className="end-actions"><button className="ff-btn-secondary" disabled={!model.file} onClick={onFull}>Full review</button><span className="end-brand">FLASH<span>FRONT</span></span></div>
  </section>;
  return <section className="end-review-card" aria-label="Game Review">
    <div className="end-ring" role="img" aria-label={value === undefined ? "Accuracy unavailable" : `Accuracy ${value}%`}>
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx={32} cy={32} r={26} className="end-ring-track" />
        {value !== undefined && <circle cx={32} cy={32} r={26} className="end-ring-value" strokeDasharray={`${RING * value / 100} ${RING}`} transform="rotate(-90 32 32)" />}</svg>
      <strong>{value === undefined ? "—" : `${value}%`}</strong>
    </div>
    <div className="end-body">
      <h2 className="end-title">Game Review</h2>
      {coach && <p className="end-coach-line">{coach.text}</p>}
      <p className="end-headline">{review ? reviewHeadline(review) : model.result.status === "waiting" ? "Review pending" : "Review unavailable for this game"}</p>
      {review ? <ul className="end-counts">{COUNTS.map(label => <li key={label} className={`push-${label}`}><span><span aria-hidden="true">{QUALITY_GLYPHS[label]} </span>{LABEL_NAMES[label]}</span><strong>{review.counts[label]}</strong></li>)}</ul>
        : <p className="end-note">{model.result.status === "waiting" ? "Your review finishes in FlashFront after you leave this game." : "Open the full review for details."}</p>}
      <div className="end-actions">
        {retry && <button className="primary ff-btn-primary" disabled={!model.file} onClick={onRetry}>Retry {formatDuration(retry.t)} in Training</button>}
        <button className="ff-btn-secondary" disabled={!model.file} onClick={onFull}>Full review</button>
      </div>
    </div>
  </section>;
}
