import { useEffect, useMemo, useRef, useState } from "react";
import { MockDataSource } from "@flashfront/core";
import { Button, GAME_UI_ZONES, HudRoot, LocalStorageLayoutStore, Segmented, presetLayout, type HudLayout, type PanelId } from "@flashfront/ui";
import type { HudPreset, LauncherApi, Settings, TextSize } from "../../shared";
import "./pages.css";

const resolutions = [[1920, 1080], [2560, 1440], [1600, 900], [1366, 768], [1280, 720]] as const;
const presets: { value: HudPreset; label: string; detail: string }[] = [
  { value: "minimal", label: "Minimal", detail: "Decision, troop growth and attack preview." },
  { value: "learning", label: "Learning", detail: "Every field instrument, shown when relevant." },
  { value: "economy", label: "Economy", detail: "Decision, build planner, trade and practice goal." },
  { value: "custom", label: "Custom", detail: "Your own arrangement for this resolution." },
];
export const PANEL_TITLES: Record<PanelId, string> = { decision: "Your next decision", clock: "Match overview", self: "Your position", spawn: "Spawn spots", gauge: "Troop growth", attack: "Attack preview", build: "Build planner", alliances: "Alliances", events: "Field reports", opening: "Opening checklist", trade: "Trade monitor", goal: "Practice goal" };

export function LayoutEditor({ api, settings }: { api: LauncherApi; settings: Settings }) {
  const [resolution, setResolution] = useState("1920x1080");
  const [width, height] = resolution.split("x").map(Number) as [number, number];
  const store = useMemo(() => new LocalStorageLayoutStore(width, height), [width, height]);
  const [preset, setPreset] = useState(settings.hudPreset);
  const [textSize, setTextSize] = useState(settings.textSize);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [selected, setSelected] = useState<PanelId>();
  const [layout, setLayout] = useState<HudLayout>();
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(900);
  const scale = zoom === "fit" ? Math.min(1, available / width) : 1;
  const snapshot = useMemo(() => {
    const s = new MockDataSource().getSnapshot(); s.phase = "playing"; s.elapsedSec = 90; s.tick = 900;
    s.self!.portLevels = 1; s.self!.gold = 160_000; s.self!.troops = s.self!.maxTroops * 0.48;
    return s;
  }, []);
  useEffect(() => { setPreset(settings.hudPreset); setTextSize(settings.textSize); }, [settings.hudPreset, settings.textSize]);
  useEffect(() => {
    const element = frame.current; if (!element) return;
    const measure = () => { if (element.clientWidth) setAvailable(element.clientWidth - 2); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  async function save(patch: Partial<Pick<Settings, "hudPreset" | "textSize">>, after: () => void) {
    setBusy(true); setMessage("");
    try { const latest = await api.getState(); await api.saveSettings({ ...latest.settings, ...patch }); after(); setMessage("HUD preferences saved. Positions save as you move them."); }
    catch (error) { setMessage(`Could not save HUD preferences: ${String(error)}`); }
    finally { setBusy(false); }
  }
  function choose(next: HudPreset) {
    // Custom keeps the current arrangement; a named preset replaces it for this resolution.
    void save({ hudPreset: next }, () => { if (next !== "custom") store.save(presetLayout(next, width, height)); setPreset(next); setRevision(n => n + 1); });
  }
  function reset() { store.reset(); setRevision(n => n + 1); setMessage(`Layout reset for ${width} × ${height}.`); }
  /** Inspector edits go through the same store the HUD reads; panels stay opaque by rule. */
  function updatePanel(id: PanelId, patch: Partial<HudLayout[PanelId]>) {
    const current = layout ?? store.load() ?? presetLayout(preset, width, height);
    store.save({ ...current, [id]: { ...current[id], ...patch, opacity: 1 } });
    setRevision(n => n + 1);
  }
  const pick = (target: EventTarget) => {
    const id = (target as Element).closest?.("[data-panel]")?.getAttribute("data-panel") as PanelId | null;
    if (id) setSelected(id);
  };
  // The inspector never opens empty: with nothing picked, the first module on the canvas is selected.
  useEffect(() => {
    if (selected) return;
    const first = frame.current?.querySelector("[data-panel]")?.getAttribute("data-panel");
    if (first) setSelected(first as PanelId);
  });
  const panel = selected && layout?.[selected];
  return <section className="customize-page layout-page" aria-label="HUD layout editor">
    <header className="page-head"><h1>HUD layout</h1></header>
    <div className="layout-toolbar" role="toolbar" aria-label="Layout options">
      <div><span className="field-label">Preset</span><Segmented label="HUD preset" options={presets} value={preset} onChange={choose} /></div>
      <div><span className="field-label">Text size</span><Segmented<TextSize> label="HUD text size" options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }]} value={textSize} onChange={next => void save({ textSize: next }, () => setTextSize(next))} /></div>
      <div><span className="field-label">Game resolution</span><Segmented label="Game resolution" options={resolutions.map(([w, h]) => ({ value: `${w}x${h}`, label: `${w}×${h}` }))} value={resolution} onChange={next => { setResolution(next); setSelected(undefined); }} /></div>
      <div className="toolbar-end"><div><span className="field-label">Preview</span><Segmented label="Preview zoom" options={[{ value: "fit", label: "Fit" }, { value: "actual", label: "100%" }]} value={zoom} onChange={setZoom} /></div>
        <Button data-reset-layout disabled={busy} onClick={reset}>Reset {width}×{height}</Button></div>
    </div>
    <p className="layout-preset-note">{presets.find(p => p.value === preset)?.detail} Outlined areas mark the game UI.</p>
    <p role="status" className="page-status">{message}</p>
    <div className="layout-workspace">
      <div className={`layout-canvas ${zoom === "actual" ? "actual-size" : ""}`} ref={frame} style={zoom === "fit" ? { height: height * scale + 2 } : undefined}
        onPointerDownCapture={e => pick(e.target)} onFocusCapture={e => pick(e.target)}>
        {selected && <style>{`.layout-canvas .hud-layer.editing .hud-panel[data-panel="${selected}"] { border-color: var(--ff-red); }`}</style>}
        <div className="layout-editor-map" style={{ width, height, transform: `scale(${scale})` }}>
          <svg className="layout-map-art" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-label="Illustrative practice map"><path d="M0 160L180 120 320 320 520 260 620 440 510 680 280 780 170 620 0 710ZM740 0L1010 0 1120 180 1070 380 1270 460 1190 740 960 660 860 410 700 300ZM1440 290L1700 220 1920 380 1920 950 1710 890 1580 710 1360 620Z" /></svg>
          {GAME_UI_ZONES.map(zone => <div key={zone.id} className="layout-game-zone" style={{ left: zone.x / 1920 * width, top: zone.y / 1080 * height, width: zone.width / 1920 * width, height: zone.height / 1080 * height }}>{zone.label}</div>)}
          <HudRoot key={`${resolution}.${revision}`} snapshot={snapshot} layoutStore={store} hudPreset={preset} textSize={textSize} viewport={{ width, height }} keyboardEnabled={false} editMode onLayoutChange={setLayout} />
        </div>
      </div>
      <aside className="layout-inspector" aria-label="Selected panel">
        {selected && panel ? <>
          <h2>{PANEL_TITLES[selected]}</h2>
          <div><span className="field-label">Outside edit mode</span><Segmented label="Panel visibility" options={[{ value: "shown", label: "Shown" }, { value: "hidden", label: "Hidden" }]} value={panel.hidden ? "hidden" : "shown"} onChange={v => updatePanel(selected, { hidden: v === "hidden" })} /></div>
          <div><span className="field-label">Body</span><Segmented label="Panel body" options={[{ value: "open", label: "Expanded" }, { value: "collapsed", label: "Collapsed" }]} value={panel.collapsed ? "collapsed" : "open"} onChange={v => updatePanel(selected, { collapsed: v === "collapsed" })} /></div>
          <dl><dt>Position</dt><dd>{Math.round(panel.x)}, {Math.round(panel.y)} px</dd><dt>Resolution</dt><dd>{width}×{height}</dd></dl>
          <p>Drag the header to move it. Arrow keys on its move control shift it 10px.</p>
        </> : <><h2>No panel selected</h2><p>Click a panel on the canvas to edit it here. Positions save as you move them, separately for each resolution.</p></>}
      </aside>
    </div>
    <p className="page-foot">Illustrative map · preview only.</p>
  </section>;
}
