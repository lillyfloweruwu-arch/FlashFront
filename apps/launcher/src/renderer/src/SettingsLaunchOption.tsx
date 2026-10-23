import { Button } from "@flashfront/ui";
import { launchOption } from "../../shared";

/** The Steam launch option for the port being edited, with a note while it differs from the saved one. */
export function SettingsLaunchOption({ savedPort, draftPort, onCopy }: { savedPort: number; draftPort: number; onCopy: (text: string) => void }) {
  const text = launchOption(draftPort);
  return <div className="settings-launch-option"><span className="label">Steam launch option</span>
    <div className="setup-code"><code>{text}</code><Button icon="copy" onClick={() => onCopy(text)}>Copy</Button></div>
    {draftPort !== savedPort && <p className="warning">Paste this into OpenFront's Steam Launch Options too, then restart the game.</p>}
    <p className="muted">While this option is set, local programs can control the OpenFront window through 127.0.0.1:{draftPort}. Removing it turns that off.</p></div>;
}
