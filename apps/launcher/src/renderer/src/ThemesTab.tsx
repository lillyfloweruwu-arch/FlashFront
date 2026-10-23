import { useState } from "react";
import { MAP_PRESETS, presetJson, type PresetId, type ThemeId } from "@flashfront/core";
import { THEMES, THEME_IDS, ThemePreview, Icon } from "@flashfront/ui";
import type { LauncherApi, Settings } from "../../shared";

function ImportSteps() {
  return <ol className="preset-steps"><li>Open Settings → Graphics in OpenFront.</li><li>Choose Import settings JSON.</li><li>Paste the copied JSON.</li><li>Select Apply.</li></ol>;
}
export function ThemesTab({ api, settings }: { api: LauncherApi; settings: Settings }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(run: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await run(); setMessage(success); }
    catch (error) { setMessage(`Could not complete the change: ${String(error)}`); }
    finally { setBusy(false); }
  }
  const useTheme = (theme: ThemeId) => action(async () => {
    const latest = await api.getState();
    await api.saveSettings({ ...latest.settings, theme });
  }, `${THEMES[theme].name} theme saved.`);
  const copy = (id: PresetId) => action(() => api.copyPreset(id), `${MAP_PRESETS[id].name} map preset copied.`);
  const preset = (id: PresetId) => <div className="map-preset">
    <button disabled={busy} onClick={() => void copy(id)}>Copy map preset</button>
    <details><summary><Icon name="chevron" className="disclosure-chevron" />Map preset JSON</summary><pre>{presetJson(id)}</pre></details>
    <ImportSteps />
  </div>;
  return <section className="themes-tab" aria-label="Themes">
    <h1>Themes</h1><p className="muted">Choose a look for your launcher, HUD and stream widgets.</p>
    <p className="preset-note">Optional. Changes only your own map colors, using OpenFront's own settings.</p>
    <p role="status" className="theme-status">{message}</p>
    <div className="theme-cards">{THEME_IDS.map(id => <article className="theme-card" key={id} aria-label={THEMES[id].name}>
      <div className="spread"><h2>{THEMES[id].name}</h2><button disabled={busy} aria-pressed={settings.theme === id} onClick={() => void useTheme(id)}>Use this theme</button></div>
      <p className="muted theme-description">{THEMES[id].description}</p>
      <ThemePreview theme={id} />
      {preset(id)}
    </article>)}</div>
    <article className="builtin-preset"><h2>Colorblind (game built-in)</h2><p className="muted">The game's original colorblind preset, with its original icon size.</p>{preset("colorblind")}</article>
  </section>;
}
