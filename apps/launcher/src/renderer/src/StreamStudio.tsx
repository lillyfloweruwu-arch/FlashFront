import { useEffect, useMemo, useRef, useState } from "react";
import { MockDataSource, type GameSnapshot, type RecordedResult } from "@flashfront/core";
import { Button, Icon, Segmented, parseStreamOptions, StreamRoot, widgetNames, type StreamSnapshot } from "@flashfront/ui";
import { OBS_DELAYS, type LauncherApi, type Settings } from "../../shared";
import "./pages.css";

type Options = ReturnType<typeof parseStreamOptions>;
type PreviewState = "lobby" | "playing" | "result";
const labels = { card: "Player card", stats: "Own live stats", top: "Top players", lobby: "Lobby", result: "Match result" };
const anchors = [{ value: "tl", label: "Top left" }, { value: "tr", label: "Top right" }, { value: "bl", label: "Bottom left" }, { value: "br", label: "Bottom right" }];
const storageKey = "flashfront.stream.v1";
export function streamUrl(options: Options): string {
  const query = new URLSearchParams({ widgets: options.widgets.join(","), scale: String(options.scale), anchor: options.anchor });
  return `http://127.0.0.1:47474/obs?${query}`;
}
/** What the OBS source receives outside a match: no snapshot, so no own stats and no leaderboard. */
const menuSnapshot = (map: string): StreamSnapshot => ({ gameId: "waiting", map, mode: "FFA", elapsedSec: 0, phase: "lobby", self: null, players: [] });
/** Example of the recorder's result frame, shown only in the Result preview. */
const exampleResult = (map: string): RecordedResult => ({ recordedBy: "FlashFront", map, mode: "FFA", durationSec: 1234,
  summary: { peakTroops: 0, peakTiles: 4210, finalRank: 4, timeInZone: { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 }, pushes: 0, exposedPushes: 0, idleGoldSeconds: 0, troopsCommitted: 0 } });

export function StreamStudio({ api, settings, snapshot }: { api: LauncherApi; settings: Settings; snapshot?: GameSnapshot | null }) {
  const [options, setOptions] = useState(() => { try { return parseStreamOptions(localStorage.getItem(storageKey) ?? ""); } catch { return parseStreamOptions(""); } });
  const [delay, setDelay] = useState(settings.obsDelaySec), [hide, setHide] = useState(settings.obsHideOwnNumbers);
  const [state, setState] = useState<PreviewState>("playing");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const previewFrame = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(900);
  const mock = useMemo(() => new MockDataSource().getSnapshot(), []);
  const live = snapshot ?? mock;
  const own = live.players.find(p => p.id === live.self?.id);
  const playing: StreamSnapshot = hide && live.self ? { ...live, self: { ...live.self, troops: null, gold: null } } : live;
  const preview = state === "playing" ? playing : menuSnapshot(live.map);
  const url = streamUrl(options);
  const saved = delay === settings.obsDelaySec && hide === settings.obsHideOwnNumbers;
  useEffect(() => { setDelay(settings.obsDelaySec); setHide(settings.obsHideOwnNumbers); }, [settings.obsDelaySec, settings.obsHideOwnNumbers]);
  useEffect(() => { try { localStorage.setItem(storageKey, new URL(url).search); } catch { /* The current URL is still usable. */ } }, [url]);
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
  const chip = state === "playing" ? snapshot ? "Live · undelayed preview" : "Example match" : state === "result" ? "Example result" : "Menu or lobby";
  return <section className="customize-page studio-page" aria-label="Stream studio">
    <header className="page-head"><h1>Stream studio</h1></header>
    <div className="studio-layout">
      <div className="studio-main">
        <div className="studio-preview-head"><Segmented label="Preview state" options={[{ value: "lobby", label: "Lobby" }, { value: "playing", label: "Playing" }, { value: "result", label: "Result" }]} value={state} onChange={setState} /><span className="studio-chip">{chip}</span></div>
        <div className="studio-preview" ref={previewFrame} style={{ height: previewWidth * 1080 / 1920 }}>
          <div className="studio-screen" style={{ transform: `scale(${previewWidth / 1920})` }}>
            {options.widgets.length ? <StreamRoot snapshot={preview} profile={{ publicId: own?.id ?? "self", name: own?.name ?? "Own player", gamesPlayed: 0, wins: 0, eloHistory: [] }} preview search={new URL(url).search}
              lobbyPlaceholder={state === "lobby"} result={state === "result" ? exampleResult(live.map) : undefined} /> : <p className="muted">No widgets selected.</p>}
          </div>
        </div>
        <div className="obs-source-row"><div><strong>OBS source · 1920x1080</strong><p className="muted">Browser source URL for this widget set.</p></div>
          <Button variant="primary" icon="copy" disabled={busy} onClick={() => void action(() => navigator.clipboard.writeText(url), "OBS URL copied.")}>Copy</Button></div>
        <details className="disclosure raw-url"><summary><Icon name="chevron" className="disclosure-chevron" />Raw URL</summary><code>{url}</code></details>
        <p role="status" className="page-status">{message}</p>
      </div>
      <aside className="studio-settings" aria-label="Stream settings">
        <fieldset><legend>Widgets</legend>{widgetNames.map(name => <label className="check" key={name}><input type="checkbox" checked={options.widgets.includes(name)} onChange={e => toggle(name, e.target.checked)} />{labels[name]}</label>)}</fieldset>
        <label><span className="field-label">Scale · {Math.round(options.scale * 100)}%</span><input aria-label="Widget scale" type="range" min="0.25" max="3" step="0.05" value={options.scale} onChange={e => setOptions({ ...options, scale: Number(e.target.value) })} /></label>
        <div><span className="field-label">Anchor</span><Segmented className="anchor-grid" label="Widget anchor" options={anchors} value={options.anchor} onChange={anchor => setOptions({ ...options, anchor })} /></div>
        <div><span className="field-label">Stream delay</span><Segmented label="Stream delay" options={OBS_DELAYS.map(sec => ({ value: String(sec), label: sec ? `${sec}s` : "Off" }))} value={String(delay)} onChange={v => setDelay(Number(v) as Settings["obsDelaySec"])} /></div>
        <label className="check"><input aria-label="Hide own troops and gold" type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} />Hide own troops and gold</label>
        {saved ? <p className="studio-saved" data-stream-saved role="status">Saved</p>
          : <Button data-save-stream disabled={busy} onClick={() => void action(async () => { const latest = await api.getState(); await api.saveSettings({ ...latest.settings, obsDelaySec: delay, obsHideOwnNumbers: hide }); }, "Stream delay and privacy saved.")}>Save delay and privacy</Button>}
        <p className="settings-note">Delay and privacy apply to every source; changing either clears queued frames. Top players repeats the game's visible leaderboard.</p>
      </aside>
    </div>
  </section>;
}
