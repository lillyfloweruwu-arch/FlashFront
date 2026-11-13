import { useState } from "react";
import type { LauncherApi, Settings } from "../../shared";
import { CoachNudgesOption } from "./CoachNudgesOption";
import { LayoutEditor } from "./LayoutEditor";
import { ThemesTab } from "./ThemesTab";

export function Customize({ api, settings }: { api: LauncherApi; settings: Settings }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function saveNudges(nudges: boolean) {
    setBusy(true); setMessage("");
    try {
      const latest = await api.getState();
      await api.saveSettings({ ...latest.settings, nudges });
      setMessage("Coach nudges saved.");
    } catch (error) { setMessage(`Could not save coach nudges: ${String(error)}`); }
    finally { setBusy(false); }
  }
  return <LayoutEditor api={api} settings={settings}
    themes={<ThemesTab api={api} settings={settings} compact />}
    coaching={<div><fieldset className="customize-coaching" disabled={busy}><CoachNudgesOption checked={settings.nudges} onChange={value => void saveNudges(value)} /></fieldset><p role="status" className="muted">{message}</p></div>} />;
}
