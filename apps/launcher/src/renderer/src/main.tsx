import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PRACTICE_GOALS } from "@flashfront/core";
import { applyTheme, HudRoot, Icon, Button, Keys, Status, Segmented } from "@flashfront/ui";
import type { LauncherApi, LauncherState, Settings, LiteMode, LauncherDestination } from "../../shared";
import { editBlocked, launchOption, mergeSettingsForm } from "../../shared";
import { SettingsLaunchOption } from "./SettingsLaunchOption";
import { CoachNudgesOption } from "./CoachNudgesOption";
import { MatchesTab, ProfileTab, NextMatchPlate } from "./StatsTabs";
import { observePanelShape } from "./panel-shape";
import { Customize } from "./Customize";
import { SetupWizard } from "./SetupWizard";
import { Backdrop } from "./Backdrop";
import { Sidebar, TRAINING_ENABLED, type Tab } from "./Sidebar";
import { StreamStudio } from "./StreamStudio";
// Training (and with it the engine client) loads only when the Training tab opens.
import { TodaysDrill } from "./TodaysDrill";
import { PlaySpawnPin } from "./PlayPage";
const TrainingHost = lazy(() => import("./training/TrainingHost"));
import { WhatsNew } from "./WhatsNew";
import { WHATS_NEW, whatsNewAction } from "./whats-new";
import { HotkeyField } from "./HotkeyField";
import { hasShortcutProblem, HOTKEY_FIELDS, hotkeyFieldErrors, isShortcutError, playHeadline, playNotice, updateHeadline } from "./launcher-status";
import { diagnose, featureHealth } from "../../main/health";
import type { PlatformApi } from "../../main/support";
import "@flashfront/ui/theme.css";
import "./style.css";
import "@flashfront/ui/fonts.css";
declare global { interface Window { flashfront: LauncherApi; } }
const surface = new URLSearchParams(location.search).get("surface");
const surfaceClass = surface === "overlay" ? "overlay" : "launcher";
// Class on <html> too: the shared theme paints html with --canvas, which made the overlay opaque.
document.documentElement.classList.add(surfaceClass);
document.body.classList.add(surfaceClass);
// The overlay is a transparent window over the game with solid panels: no blur, shadows or number animations.
if (surface === "overlay") document.documentElement.classList.add("ff-static");
type Message = { text: string; error?: boolean };
function SupportActions({ api, feedbackAvailable }: { api: Partial<PlatformApi>; feedbackAvailable: boolean }) {
  const [report, setReport] = useState<string>(); const [message, setMessage] = useState<Message>();
  const run = async (action: () => Promise<void>) => { try { setMessage(undefined); await action(); } catch (e) { setMessage({ text: String(e), error: true }); } };
  if (!api.previewSupportReport || !api.copySupportReport) return null;
  return <section className="settings-section ff-glass" aria-labelledby="support-heading">
    <h2 id="support-heading">Feedback and support</h2>
    <div className="button-row">{feedbackAvailable && api.suggestIdea && <Button onClick={() => void run(() => api.suggestIdea!())}>Suggest an idea</Button>}
      <Button icon="copy" onClick={() => void run(async () => { setReport(await api.previewSupportReport!()); })}>Copy support report</Button></div>
    {report !== undefined && <div className="support-preview ff-glass" role="region" aria-label="Support report preview"><p>Versions, connection and feature health. No identifiers or recordings.</p>
      <pre>{report}</pre>
      <div className="button-row"><Button className="ff-btn-secondary" onClick={() => void run(async () => { await api.copySupportReport!(); setReport(undefined); setMessage({ text: "Support report copied." }); })}>Copy report</Button>
        <Button variant="ghost" onClick={() => setReport(undefined)}>Cancel</Button></div></div>}
    {message && <Status tone={message.error ? "danger" : "neutral"} title={message.text} />}
    <p className="muted">Nothing uploaded unless you send feedback.</p>
  </section>;
}
export function App() {
  const [overlayActive, setOverlayActive] = useState(true);
  const [state, setState] = useState<LauncherState>();
  const [draft, setDraft] = useState<Settings>();
  // Unsaved edits in the Settings form; while clean, the form follows the latest saved settings.
  const [dirty, setDirty] = useState(false);
  const editStart = useRef<Settings | undefined>(undefined);
  const editDraft = (next: Settings) => { if (!dirty) editStart.current = draft; setDraft(next); setDirty(true); };
  const [message, setMessage] = useState<Message>();
  const [tab, setTab] = useState<Tab>("Play");
  const [settingsGroup, setSettingsGroup] = useState("Coaching");
  const [destination, setDestination] = useState<LauncherDestination>();
  useEffect(() => window.flashfront.onNavigate?.(next => { setDestination(next); setTab(next.screen === "review" ? "Matches" : TRAINING_ENABLED ? "Training" : "Play"); }), []);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string>();
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = 0; }, [tab, state?.settings.setupDone, whatsNewOpen]);
  useLayoutEffect(() => { applyTheme(document.documentElement, state?.settings.theme ?? "abyss"); }, [state?.settings.theme]);
  useLayoutEffect(() => {
    if (surface === "overlay") return;
    if (state?.lite === true || state?.settings.visualEffects === "lite") document.documentElement.dataset.fx = "lite";
    else delete document.documentElement.dataset.fx;
  }, [state?.lite, state?.settings.visualEffects]);
  useEffect(() => { if (!dirty) setDraft(state?.settings); }, [state?.settings, dirty]);
  useEffect(() => {
    let active = true;
    const unsub = window.flashfront.subscribe(value => { if (active) { setOverlayActive(true); setState(value); } });
    const offActivity = window.flashfront.onSurfaceActive?.(setOverlayActive);
    const offViewport = window.flashfront.onViewport?.(overlayViewport => setState(old => old ? { ...old, overlayViewport } : old));
    window.flashfront.getState().then(value => { if (active) { setState(value); setDraft(value.settings); } }).catch(e => setMessage({ text: String(e), error: true }));
    return () => { active = false; unsub(); offActivity?.(); offViewport?.(); };
  }, []);
  useLayoutEffect(() => {
    if (surface !== "overlay" || !overlayActive) return;
    const viewport = document.querySelector<HTMLElement>(".hud-viewport");
    if (viewport) return observePanelShape(viewport, window.flashfront.reportShape);
  }, [overlayActive, !!state?.snapshot, !!state?.overlayViewport]);
  const whatsNewMode = state && surface !== "overlay" ? whatsNewAction(state.settings, state.appVersion, state.status) : "none";
  // A version without bundled highlights (a fix release) is recorded silently, so the next entry compares correctly.
  useEffect(() => {
    if (whatsNewMode === "record" && state?.appVersion) void window.flashfront.saveSettings({ ...state.settings, lastSeenVersion: state.appVersion }).catch(() => {});
  }, [whatsNewMode]);
  async function action(fn: () => Promise<void>, success = "") { try { setMessage(undefined); await fn(); setMessage(success ? { text: success } : undefined); } catch (e) { setMessage({ text: String(e), error: true }); } }
  if (!state) return <p role="status">{message?.text || "Connecting to FlashFront…"}</p>;
  if (surface === "overlay") {
    const v = state.overlayViewport;
    return state.snapshot && v ? <div className="hud-viewport" style={{ position: "fixed", left: -v.offsetX, top: -v.offsetY, width: v.width, height: v.height }}>
      <HudRoot lite={state.lite === true} subscribeCamera={window.flashfront.subscribeCamera} active={overlayActive} snapshot={state.snapshot} reserveFloor={state.settings.reserveFloor} keyboardEnabled={false} editMode={state.editing} snoozeHotkey={state.settings.snoozeHotkey} snoozeSignal={state.snoozeSignal} heatHeld={state.spawnHeatHeld ?? true} hudPreset={state.settings.hudPreset} textSize={state.settings.textSize} ownTeam={state.raw?.me} featureHealth={state.health ?? featureHealth(state.raw, state.version)} onDecision={window.flashfront.reportDecision} />
    </div> : null;
  }
  const live = !!state.snapshot;
  const health = live ? state.health ?? featureHealth(state.raw, state.version) : undefined;
  const diagnosis = diagnose(state);
  const platform = window.flashfront as LauncherApi & Partial<PlatformApi>;
  const connected = state.status.startsWith("connected");
  const shortcutProblem = hasShortcutProblem(state.errors);
  const whatsNew = state.appVersion ? WHATS_NEW[state.appVersion] : undefined;
  if (!state.settings.setupDone) return <div className="launcher-shell setup-shell">
    <Backdrop />
    <main className="launcher-content" ref={content}><SetupWizard api={window.flashfront} state={state} /></main>
  </div>;
  const notice = playNotice(state, diagnosis, message);
  const playProblem = notice.tone === "danger" || notice.tone === "caution" || (connected && diagnosis.code !== "ok" && diagnosis.code !== "menu");
  // Outside Play: one notice at most, the latest action result or error. Shortcut errors live under their Settings field.
  const otherErrors = state.errors.filter(e => !isShortcutError(e));
  const tabNotice: Message | undefined = message ?? (otherErrors.length ? { text: otherErrors.at(-1)!, error: true } : undefined);
  const fieldErrors = draft ? hotkeyFieldErrors(draft, state.settings, state.errors) : {};
  const editIsBlocked = editBlocked(state);
  const headline = state.update ? updateHeadline(state.update.notes) : undefined;
  const dismissWhatsNew = () => {
    setWhatsNewOpen(false); setDismissedVersion(state.appVersion);
    if (whatsNewMode === "show" && state.appVersion) void action(() => window.flashfront.saveSettings({ ...state.settings, lastSeenVersion: state.appVersion }));
  };
  const copyLaunchOption = () => void action(window.flashfront.copySetup, "Launch option copied.");
  return <div className="launcher-shell">
    <Backdrop dim={["Matches", "Profile", "Settings", "Stream"].includes(tab)} />
    <Sidebar tab={tab} onTab={setTab} status={state.status} version={state.version} shortcutProblem={shortcutProblem} />
    <main className="launcher-content" ref={content}>
      {whatsNew && state.appVersion && (whatsNewOpen || (whatsNewMode === "show" && dismissedVersion !== state.appVersion)) && <WhatsNew version={state.appVersion} entry={whatsNew}
        onFullNotes={() => void action(() => window.flashfront.openReleaseNotes(state.appVersion!))} onDismiss={dismissWhatsNew} />}
      {tab !== "Play" && tabNotice && <div className="tab-notice"><Status tone={tabNotice.error ? "danger" : "neutral"} title={tabNotice.text} /></div>}
      {tab === "Customize" && <Customize api={window.flashfront} settings={state.settings} />}
      {tab === "Stream" && <StreamStudio api={window.flashfront} settings={state.settings} snapshot={state.snapshot} />}
      {tab === "Training" && <Suspense fallback={<section aria-label="Training" aria-busy="true" />}><TrainingHost api={window.flashfront} request={destination?.screen === "training" ? destination.request : undefined} inMatch={state.raw?.inGame === true} /></Suspense>}
      {tab === "Matches" && <MatchesTab api={window.flashfront} settings={state.settings} initialFile={destination?.screen === "review" ? destination.file : undefined} />}
      {tab === "Profile" && <ProfileTab api={window.flashfront} settings={state.settings} />}
      {tab === "Settings" && draft && <form className="settings-form" onSubmit={e => {
        e.preventDefault();
        if (Object.keys(fieldErrors).some(field => fieldErrors[field as keyof typeof fieldErrors] && !fieldErrors[field as keyof typeof fieldErrors]!.startsWith("Could not register"))) return;
        // Only the form's own fields are saved, so changes made on other screens (and lastSeenVersion) are kept.
        void action(async () => { await window.flashfront.saveSettings(mergeSettingsForm(state.settings, draft, editStart.current)); setDirty(false); }, "Settings saved.");
      }}>
      <header className="settings-header"><div><h1 className="ff-page-title">Settings</h1><p className="muted">Changes save when you press Save.</p></div><Button variant="primary" className="ff-btn-primary" type="submit">Save settings</Button></header>
      <div className="settings-layout">
        <nav className="settings-index ff-glass" aria-label="Settings sections">{["Coaching", "Overlay", "Hotkeys", "Performance", "Game", "About"].map(group => <a key={group} href={`#settings-${group.toLowerCase()}`} aria-current={settingsGroup === group ? "location" : undefined} onClick={e => { e.preventDefault(); setSettingsGroup(group); document.getElementById(`settings-${group.toLowerCase()}`)?.scrollIntoView({ block: "start" }); }}>{group}</a>)}</nav>
        <div className="settings-groups">
      <section id="settings-coaching" className="settings-section ff-glass" aria-labelledby="coaching-heading">
        <h2 id="coaching-heading">Coaching</h2>
        <CoachNudgesOption checked={draft.nudges} onChange={nudges => editDraft({ ...draft, nudges })} />
        <label className="settings-row"><span><b>Practice goal</b><small className="muted">Choose what to work on next match.</small></span><select value={draft.practiceGoal ?? ""} onChange={e => editDraft({ ...draft, practiceGoal: e.target.value ? e.target.value as Settings["practiceGoal"] : undefined })}><option value="">No goal</option>{Object.entries(PRACTICE_GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </section>
      <section id="settings-overlay" className="settings-section ff-glass" aria-labelledby="hud-heading">
        <h2 id="hud-heading">Overlay</h2>
        <label className="settings-row"><span><b>Start HUD hidden</b><small className="muted">Use your HUD shortcut to show it when needed.</small></span><input type="checkbox" role="switch" checked={draft.startHidden} onChange={e => editDraft({ ...draft, startHidden: e.target.checked })} /></label>
        <label className="settings-row"><span><b>Reserve floor: {draft.reserveFloor}% of max</b><small className="muted">Keep this share of your troops in reserve.</small></span><input type="range" min="20" max="60" step="1" value={draft.reserveFloor} onChange={e => editDraft({ ...draft, reserveFloor: Number(e.target.value) })} /></label>
        <label className="settings-row"><span><b>Play a chime when spawn starts</b><small className="muted">Hear when it is time to choose your spawn.</small></span><input type="checkbox" role="switch" checked={draft.spawnChime} onChange={e => editDraft({ ...draft, spawnChime: e.target.checked })} /></label>
        <p className="muted">The HUD is hidden in ranked matches and replays.</p>
      </section>
      <section id="settings-hotkeys" className="settings-section ff-glass" aria-labelledby="hotkeys-heading">
        <h2 id="hotkeys-heading">Hotkeys</h2>
        <div className="settings-hotkeys">{HOTKEY_FIELDS.map(([field, label]) => <div className="settings-field" key={field} data-invalid={fieldErrors[field] ? "true" : undefined}>
          <HotkeyField label={label} value={draft[field]} error={fieldErrors[field]} describedBy={fieldErrors[field] ? `${field}-error` : undefined} onChange={value => editDraft({ ...draft, [field]: value })} />
          <small className="muted">Click the field, then press your shortcut.</small>
          {fieldErrors[field] && <p className="field-error" id={`${field}-error`}><Icon name="warning" label="Problem" />{fieldErrors[field]}</p>}
        </div>)}</div>
        <p className="muted shortcut-help">Use Ctrl, Alt, Shift or Meta with a letter, number or function key. F8 is reserved for Flash clipping.</p>
      </section>
      <section id="settings-performance" className="settings-section ff-glass" aria-labelledby="performance-heading">
        <h2 id="performance-heading">Performance</h2>
        <label className="settings-row"><span><b>Lite mode</b><small className="muted" id="lite-hint">Reads the game less often and turns off HUD motion. Auto is {state.weakPc ? "on" : "off"} for this PC.</small></span><select value={draft.liteMode} aria-describedby="lite-hint" onChange={e => editDraft({ ...draft, liteMode: e.target.value as LiteMode })}><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label>
        <div className="settings-row"><span><b>Visual effects</b><small className="muted" id="visual-effects-hint">Lite turns off the glass blur and motion for slower PCs.</small></span><div aria-describedby="visual-effects-hint"><Segmented label="Visual effects" value={draft.visualEffects} options={[{ value: "full", label: "Full" }, { value: "lite", label: "Lite" }]} onChange={visualEffects => editDraft({ ...draft, visualEffects })} /></div></div>
      </section>
      <section id="settings-game" className="settings-section ff-glass" aria-labelledby="game-heading">
        <h2 id="game-heading">Game</h2>
        <label className="settings-row"><span><b>Debug port</b><small className="muted">Match the port in your OpenFront launch option.</small></span><input type="number" min="1" max="65535" value={draft.port} onChange={e => editDraft({ ...draft, port: Number(e.target.value) })} /></label>
        <SettingsLaunchOption savedPort={state.settings.port} draftPort={draft.port} onCopy={text => void action(() => navigator.clipboard.writeText(text), "Launch option copied.")} />
      </section>
      <section id="settings-about" className="settings-section ff-glass" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <div className="settings-row"><span><b>Run setup again</b><small className="muted">Review your connection and HUD shortcuts.</small></span><Button onClick={() => void action(() => window.flashfront.saveSettings({ ...state.settings, setupDone: false }))}>Run setup again</Button></div>
        <div className="settings-row"><span><b>What's new</b><small className="muted">See what changed in this version.</small></span><Button disabled={!whatsNew} onClick={() => setWhatsNewOpen(true)}>What's new{whatsNew ? ` in ${state.appVersion}` : ""}</Button></div>
        <SupportActions api={platform} feedbackAvailable={state.feedbackAvailable} />
      </section>
      </div></div>
    </form>}
      {tab === "Play" && <div className="play-view">
        <section className="play-controls" aria-label="Connection">
          <div className="play-status ff-glass" role="status" data-tone={playProblem || state.launching || state.status === "searching" || state.status === "disconnected" ? notice.tone === "danger" ? "danger" : "caution" : "success"}><span aria-hidden="true" />{playProblem || connected || state.launching || state.status !== "port-closed" ? notice.title : "Steam found · ready to launch"}</div>
          <h1 className="ff-page-title">{playHeadline(state) === "READY TO LAUNCH" ? "Ready for the next match" : playHeadline(state)}</h1>
          <p className="play-subline muted">{state.snapshot ? `${state.snapshot.map} · ${state.snapshot.mode}` : "Growth, reserves and economy. Your call."}</p>
          <Button variant="primary" className="launch-button ff-btn-primary hero" icon="play" disabled={state.launching || connected} aria-busy={state.launching} onClick={() => void action(window.flashfront.launch)}>{connected ? "OpenFront is running" : state.launching ? "Waiting for OpenFront…" : "Launch OpenFront"}</Button>
          <div className="hud-controls">
            <div className="hud-actions"><Button role="switch" aria-checked={state.hudEnabled} onClick={() => void action(window.flashfront.toggleHud)}>HUD {state.hudEnabled ? "on" : "off"}</Button><Keys shortcut={state.settings.toggleHotkey} /></div>
            <div className="hud-actions"><Button disabled={editIsBlocked} onClick={() => void action(window.flashfront.toggleEdit)}>{state.editing ? "Finish editing" : "Edit HUD"}</Button><Keys shortcut={state.settings.editHotkey} /></div>
          </div>
        </section>
        {playProblem && <div className="play-notice ff-glass" data-diagnosis={diagnosis.code}><Status tone={notice.tone} title={notice.title}>{(notice.detail || notice.launchOption) && <>
            {notice.detail && <p>{notice.detail}</p>}
            {notice.launchOption === "open" && <>
                <p>Steam → Library → OpenFront → Properties → Launch Options holds this option. With it set, OpenFront opens a local connection that FlashFront reads.</p>
                <div className="setup-code"><code>{launchOption(state.settings.port)}</code><Button icon="copy" onClick={copyLaunchOption}>Copy</Button></div>
            </>}
            {notice.note && <p className="status-note" role="status">{notice.note}</p>}
            {notice.launchOption && <details className="setup-why"><summary><Icon name="chevron" className="disclosure-chevron" />About Launch Options and local access</summary>
              {notice.launchOption === "disclosure" && <>
                <p>Steam → Library → OpenFront → Properties → Launch Options holds this option. With it set, OpenFront opens a local connection that FlashFront reads.</p>
                <div className="setup-code"><code>{launchOption(state.settings.port)}</code><Button icon="copy" onClick={copyLaunchOption}>Copy</Button></div>
              </>}
              <p>While this option is set, local programs can control the OpenFront window through 127.0.0.1:{state.settings.port}. Removing it when FlashFront is not in use turns that off.</p></details>}
          </>}</Status></div>}

        <PlaySpawnPin state={state} />
        <div className="play-cards">
          {TRAINING_ENABLED && <TodaysDrill api={window.flashfront} />}
          <NextMatchPlate api={window.flashfront} settings={state.settings} live={state.raw?.inGame === true} onOpenReview={() => setTab("Matches")} />
        </div>
        {(state.update || health) && <footer className="play-footer ff-glass">
          {state.update && <section className="update-row" aria-label="FlashFront update">
            <div><strong>FlashFront {state.update.version}</strong><span className="muted">{state.update.ready ? "Downloaded. Ready to install." : "Downloading in the background."}{headline ? ` ${headline}` : ""}</span></div>
            {state.update.ready && platform.restartToUpdate && <Button onClick={() => void action(() => platform.restartToUpdate!())}>Restart to update</Button>}
          </section>}
          {health && <details className="data-health"><summary><Icon name="chevron" className="disclosure-chevron" />Data health</summary><dl>{Object.entries(health).map(([feature, status]) => <div className="spread" key={feature}><dt>{feature === "spawnHeat" ? "Spawn heat" : feature}</dt><dd>{status === "paused" ? "estimate paused" : status}</dd></div>)}</dl></details>}
        </footer>}
        <p className="fair-play muted">Visible information. Read-only. Your call.</p>
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);

