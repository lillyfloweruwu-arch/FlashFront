import { SNOOZE_HOTKEY, type Decision } from "@flashfront/core";
import { Button, Keys } from "../controls";

/** The overlay is click-through, so outside edit mode the snooze is a keycap hint, not a button. */
export function DecisionCard({ decision, editing, onSnooze, snoozeHotkey = SNOOZE_HOTKEY }: { decision?: Decision; editing: boolean; onSnooze: () => void; snoozeHotkey?: string }) {
  return <div className="decision-card stack" role="status">
    <p className={decision?.tone ?? "muted"}>{decision?.text ?? "No decision active."}</p>
    {decision && (editing
      ? <Button variant="default" className="snooze-button" onClick={onSnooze} title={snoozeHotkey}>Snooze 2 min <Keys shortcut={snoozeHotkey} /></Button>
      : <p className="snooze-hint"><Keys shortcut={snoozeHotkey} label={`Snooze shortcut ${snoozeHotkey}`} /><span>snooze 2 min</span></p>)}
  </div>;
}
