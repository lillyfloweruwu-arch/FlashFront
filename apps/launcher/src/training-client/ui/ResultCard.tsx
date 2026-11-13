import { QualityBadge } from "../../renderer/src/GameReview";
import { useDialog } from "./useDialog";
export function ResultCard({ verdict, onNext, onBack }: { verdict: "Great" | "Good"; onNext?: () => void; onBack(): void }) {
  const ref = useDialog(event => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onBack(); } });
  return <div ref={ref} className="ff-training-card ff-glass" role="dialog" aria-modal="true" aria-labelledby="ff-result-title" tabIndex={-1}><QualityBadge label={verdict === "Great" ? "great" : "good"} /><h2 id="ff-result-title">Drill complete</h2><p>{verdict === "Great" ? "You made the right call on your first attempt." : "You made the right call after practice."}</p><div className="ff-training-actions">{onNext && <button className="ff-btn-primary" onClick={onNext}>Next drill</button>}<button className={onNext ? "ff-btn-secondary" : "ff-btn-primary"} onClick={onBack}>Back to Training</button></div></div>;
}
