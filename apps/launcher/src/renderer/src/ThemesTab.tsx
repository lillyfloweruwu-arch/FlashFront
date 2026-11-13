import { useState, type CSSProperties } from "react";
import { MAP_PRESETS, presetJson, type PresetId, type ThemeId } from "@flashfront/core";
import { THEMES, THEME_IDS, ThemePreview, Icon } from "@flashfront/ui";
import type { LauncherApi, Settings } from "../../shared";

function ImportSteps() {
  return <ol className="preset-steps"><li>Open Settings → Graphics in OpenFront.</li><li>Choose Import settings JSON.</li><li>Paste the copied JSON.</li><li>Select Apply.</li></ol>;
}
export function ThemesTab({ api, settings, compact = false }: { api: LauncherApi; settings: Settings; compact?: boolean }) {
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
    <button className="ff-btn-secondary" disabled={busy} onClick={() => void copy(id)}>Copy map preset</button>
    <details><summary><Icon name="chevron" className="disclosure-chevron" />Map preset JSON</summary><pre>{presetJson(id)}</pre></details>
    <ImportSteps />
  </div>;
  return <section className={`themes-tab ${compact ? "theme-swatches" : ""}`} aria-label="Themes">
    {compact ? <h2>Themes</h2> : <><h1 className="ff-page-title">Themes</h1><p className="muted">Choose a look for your launcher, HUD and stream widgets.</p></>}
    <p className="preset-note">Optional. Changes only your own map colors, using OpenFront's own settings.</p>
    <p role="status" className="theme-status">{message}</p>
    <div className="theme-cards">{THEME_IDS.map(id => <article className={`theme-card ff-glass ${settings.theme === id ? "theme-active" : ""}`} key={id} aria-label={THEMES[id].name}>
      <div className="spread"><h2>{THEMES[id].name}</h2><button className="ff-btn-secondary" disabled={busy} aria-pressed={settings.theme === id} onClick={() => void useTheme(id)}>Use this theme</button></div>
      <p className="muted theme-description">{THEMES[id].description}</p>
      {compact ? <div className="theme-palette" data-ff-theme={id} style={THEMES[id].tokens as CSSProperties} aria-label={`${THEMES[id].name} palette`}>{["--ff-bg", "--ff-surface", "--ff-fg", "--ff-red", "--ff-good", "--ff-ally"].map(color => <i key={color} style={{ background: `var(${color})` }} />)}</div> : <ThemePreview theme={id} />}
      {compact && <details><summary>Example HUD</summary><ThemePreview theme={id} /></details>}
      {compact ? <details><summary>Map preset</summary>{preset(id)}</details> : preset(id)}
    </article>)}</div>
    <article className="builtin-preset ff-glass"><details open={compact ? undefined : true}><summary>Colorblind (game built-in)</summary><p className="muted">The game's original colorblind preset, with its original icon size.</p>{preset("colorblind")}</details></article>
  </section>;
}
