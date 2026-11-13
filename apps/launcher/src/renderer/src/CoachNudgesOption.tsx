/** Settings > Coaching: coach nudges next to the cursor on or off. */
export function CoachNudgesOption({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-row"><span><b>Coach nudges next to the cursor</b><small className="muted">Short tips near your cursor during a match.</small></span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /></label>;
}
