import { useEffect, useMemo, useRef, useState } from "react";
import { MockDataSource, type GameSnapshot, type PlayerProfile, type RecordedResult } from "@flashfront/core";
import { Button, Icon, Segmented, parseStreamOptions, StreamRoot, widgetNames, type StreamSnapshot } from "@flashfront/ui";
import { DEFAULT_STREAM_LAYOUT, OBS_DELAYS, type LauncherApi, type Settings, type StreamLayout } from "../../shared";
import { profileFromApi } from "../../stats";
import "./pages.css";

type Options = Pick<ReturnType<typeof parseStreamOptions>, "widgets" | "scale" | "anchor">;
type PreviewState = "menu" | "playing" | "result";
const labels = { card: "Player card", stats: "Own live stats", top: "Top players", result: "Match result" };
const anchors = [{ value: "tl", label: "Top left" }, { value: "tr", label: "Top right" }, { value: "bl", label: "Bottom left" }, { value: "br", label: "Bottom right" }];
/** Before 0.3.0 the layout autosaved here; it now migrates into settings on the first Save. */
export const LEGACY_STREAM_KEY = "flashfront.stream.v1";
export function streamUrl(options: Options): string {
  const query = new URLSearchParams({ widgets: options.widgets.join(","), scale: String(options.scale), anchor: options.anchor });
  return `http://127.0.0.1:47474/obs?${query}`;
}
/** What the OBS source receives outside a match: no snapshot, so no own stats and no leaderboard. */
const menuSnapshot = (map: string): StreamSnapshot => ({ gameId: "waiting", map, mode: "FFA", elapsedSec: 0, phase: "lobby", self: null, players: [] });
type Draft = { layout: StreamLayout; delay: Settings["obsDelaySec"]; hide: boolean };
const savedDraft = (s: Settings): Draft => ({ layout: s.streamLayout ?? DEFAULT_STREAM_LAYOUT, delay: s.obsDelaySec, hide: s.obsHideOwnNumbers });
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
function legacyLayout(): StreamLayout | undefined {
  try { const search = localStorage.getItem(LEGACY_STREAM_KEY); if (!search) return undefined; const o = parseStreamOptions(search); return { widgets: o.widgets, scale: o.scale, anchor: o.anchor as StreamLayout["anchor"] }; }
  catch { return undefined; }
}
/** Example of the recorder's result frame, shown only in the Result preview. */
const exampleResult = (map: string): RecordedResult => ({ recordedBy: "FlashFront", map, mode: "FFA", durationSec: 1234,
  summary: { peakTroops: 0, peakTiles: 4210, finalRank: 4, timeInZone: { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 }, pushes: 0, exposedPushes: 0, idleGoldSeconds: 0, troopsCommitted: 0 } });

export function StreamStudio({ api, settings, snapshot }: { api: LauncherApi; settings: Settings; snapshot?: GameSnapshot | null }) {
  // One draft for every stream choice. Nothing persists until Save; an existing saved layout is never replaced by the legacy one.
  const [base, setBase] = useState(() => savedDraft(settings));
  const [draft, setDraft] = useState(() => { const legacy = settings.streamLayout ? undefined : legacyLayout(); return legacy ? { ...savedDraft(settings), layout: legacy } : savedDraft(settings); });
  const settingsKey = JSON.stringify(savedDraft(settings));
  useEffect(() => {
    const next = savedDraft(settings);
    setDraft(current => same(current, base) ? next : current); setBase(next);
  // `settingsKey` is exactly the saved stream choices.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);
  const dirty = !same(draft, base);
  const options = draft.layout; const delay = draft.delay; const hide = draft.hide;
  const setOptions = (layout: Options) => setDraft(d => ({ ...d, layout: layout as StreamLayout }));
  const [profile, setProfile] = useState<PlayerProfile>();
  useEffect(() => {
    setProfile(undefined); const id = settings.publicId; if (!id || !api.stats) return;
    let active = true;
    void api.stats(`/api/player/${id}`).then(r => { if (active && r.status === 200) setProfile(profileFromApi(id, r.body)); }).catch(() => {});
    return () => { active = false; };
  }, [api, settings.publicId]);
  const [state, setState] = useState<PreviewState>("playing");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const previewFrame = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(900);
  const mock = useMemo(() => new MockDataSource().getSnapshot(), []);
  const live = snapshot ?? mock;
  const playing: StreamSnapshot = hide && live.self ? { ...live, self: { ...live.self, troops: null, gold: null } } : live;
  const preview = state === "playing" ? playing : menuSnapshot(live.map);
  const url = streamUrl(base.layout);
  const previewSearch = new URL(streamUrl(options)).search;
  useEffect(() => {
    const element = previewFrame.current; if (!element) return;
    // The 1920x1080 OBS canvas is scaled to the box's inner width (top-left origin), so the box keeps 16:9.
    const measure = () => { if (element.clientWidth) setPreviewWidth(element.clientWidth); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  async function action(run: () => Promise<void>, success: string) {
    setBusy(true); setMessage("");
    try { await run(); setMessage(success); } catch (error) { setMessage(`Could not complete stream setup: ${String(error)}`); } finally { setBusy(false); }
  }
  const toggle = (name: typeof widgetNames[number], on: boolean) => setOptions({ ...options, widgets: on ? widgetNames.filter(n => n === name || options.widgets.includes(n)) : options.widgets.filter(n => n !== name) });
  const chip = state === "playing" ? snapshot ? "Live · undelayed preview" : "Example match" : state === "result" ? "Example result" : "Menu";
  const save = () => void action(async () => {
    const latest = (await api.getState()).settings;
    await api.saveSettings({ ...latest, streamLayout: draft.layout, obsDelaySec: draft.delay, obsHideOwnNumbers: draft.hide });
    setBase(draft);
    try { localStorage.removeItem(LEGACY_STREAM_KEY); } catch { /* Settings now hold the layout. */ }
  }, "Stream settings saved.");
  return <section className="customize-page studio-page" aria-label="Stream studio">
    <header className="page-head"><h1 className="ff-page-title">Stream studio</h1></header>
    <div className="studio-layout">
      <div className="studio-main ff-glass">
        <div className="studio-preview-head"><Segmented label="Preview state" options={[{ value: "menu", label: "Menu" }, { value: "playing", label: "Playing" }, { value: "result", label: "Result" }]} value={state} onChange={setState} /><span className="studio-chip">{chip}</span></div>
        <div className="studio-preview" ref={previewFrame} style={{ height: previewWidth * 1080 / 1920 }}>
          <div className="studio-screen" style={{ transform: `scale(${previewWidth / 1920})` }}>
            {options.widgets.length ? <StreamRoot snapshot={preview} profile={profile} preview search={previewSearch}
              result={state === "result" ? exampleResult(live.map) : undefined} /> : <p className="muted">No widgets selected.</p>}
          </div>
        </div>
        <div className="obs-source-row ff-glass"><div><strong>OBS source · 1920x1080</strong><p className="muted">Browser source URL for this widget set.</p></div>
          <Button icon="copy" disabled={busy || dirty} title={dirty ? "Save stream settings to copy this layout" : undefined} onClick={() => void action(() => navigator.clipboard.writeText(url), "OBS URL copied.")}>Copy</Button></div>
        {dirty && <p className="muted">Save stream settings to copy this layout.</p>}
        <details className="disclosure raw-url ff-glass"><summary><Icon name="chevron" className="disclosure-chevron" />Raw URL</summary><code>{url}</code></details>
        <p role="status" className="page-status">{message}</p>
      </div>
      <aside className="studio-settings ff-glass" aria-label="Stream settings">
        <fieldset><legend>Widgets</legend>{widgetNames.map(name => <label className="check" key={name}><input type="checkbox" checked={options.widgets.includes(name)} onChange={e => toggle(name, e.target.checked)} />{labels[name]}</label>)}</fieldset>
        <label><span className="field-label">Scale · {Math.round(options.scale * 100)}%</span><input aria-label="Widget scale" type="range" min="0.25" max="3" step="0.05" value={options.scale} onChange={e => setOptions({ ...options, scale: Number(e.target.value) })} /></label>
        <div><span className="field-label">Anchor</span><Segmented className="anchor-grid" label="Widget anchor" options={anchors} value={options.anchor} onChange={anchor => setOptions({ ...options, anchor })} /></div>
        <div><span className="field-label">Stream delay</span><Segmented label="Stream delay" options={OBS_DELAYS.map(sec => ({ value: String(sec), label: sec ? `${sec}s` : "Off" }))} value={String(delay)} onChange={v => setDraft(d => ({ ...d, delay: Number(v) as Settings["obsDelaySec"] }))} /></div>
        <label className="check"><input aria-label="Hide own troops and gold" type="checkbox" checked={hide} onChange={e => { const checked = e.target.checked; setDraft(d => ({ ...d, hide: checked })); }} />Hide own troops and gold</label>
        {dirty ? <div className="detail-actions"><Button variant="primary" data-save-stream disabled={busy} onClick={save}>Save stream settings</Button><Button disabled={busy} onClick={() => setDraft(base)}>Cancel</Button></div>
          : <p className="studio-saved" data-stream-saved role="status">Saved</p>}
        <p className="settings-note">Delay and privacy apply to every source; changing either clears queued frames. An OBS source keeps the layout in its own URL. Top players repeats the visible leaderboard.</p>
      </aside>
    </div>
  </section>;
}
