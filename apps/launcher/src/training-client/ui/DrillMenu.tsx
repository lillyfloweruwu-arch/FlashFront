import { useDialog } from "./useDialog";
export function DrillMenu({ onResume, onRestart, onLeave }: { onResume(): void; onRestart(): void; onLeave(): void }) {
  const ref = useDialog();
  return <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="ff-menu-title" tabIndex={-1} className="ff-training-card ff-glass"><h2 id="ff-menu-title">Drill paused</h2><div className="ff-training-actions"><button className="ff-btn-primary" onClick={onResume}>Resume</button><button className="ff-btn-secondary" onClick={onRestart}>Restart</button><button className="ff-btn-ghost" onClick={onLeave}>Leave</button></div></div>;
}
