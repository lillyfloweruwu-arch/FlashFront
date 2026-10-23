import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PRACTICE_GOALS } from "@flashfront/core";
import { applyTheme, HudRoot, FlashFrontMark, Wordmark, Icon, Module, GrowthGauge, AttackPreview, Button, Keys, Status, type IconName } from "@flashfront/ui";
import type { LauncherApi, LauncherState, Settings } from "../../shared";
import { editBlocked, launchOption, mergeSettingsForm } from "../../shared";
import { SettingsLaunchOption } from "./SettingsLaunchOption";
import { MatchesTab, ProfileTab, NextMatchPlate } from "./StatsTabs";
import { observePanelShape } from "./panel-shape";
import { ThemesTab } from "./ThemesTab";
import { SetupWizard } from "./SetupWizard";
import { LayoutEditor } from "./LayoutEditor";
import { StreamStudio } from "./StreamStudio";
import { TrainingRoom } from "./TrainingRoom";
import { WhatsNew } from "./WhatsNew";
import { WHATS_NEW, whatsNewAction } from "./whats-new";
import { connectionLabel, exampleSnapshot, hasShortcutProblem, HOTKEY_FIELDS, hotkeyFieldErrors, isShortcutError, playHeadline, playNotice, updateHeadline } from "./launcher-status";
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
/** Shown in the preview column while no match is live: a mid-game moment, labelled "Example". */
const example = exampleSnapshot();
const TABS = ["Play", "Matches", "Profile", "Themes", "Layout", "Stream", "Training", "Settings"] as const;
type Tab = typeof TABS[number];
const navIcons: Record<Tab, IconName> = { Play: "play", Matches: "matches", Profile: "profile", Themes: "themes", Layout: "drag", Stream: "external", Training: "opening", Settings: "settings" };
type Message = { text: string; error?: boolean };
function SupportActions({ api, feedbackAvailable }: { api: Partial<PlatformApi>; feedbackAvailable: boolean }) {
  const [report, setReport] = useState<string>(); const [message, setMessage] = useState<Message>();
  const run = async (action: () => Promise<void>) => { try { setMessage(undefined); await action(); } catch (e) { setMessage({ text: String(e), error: true }); } };
  if (!api.previewSupportReport || !api.copySupportReport) return null;
  return <section className="settings-section" aria-labelledby="support-heading">
    <h2 id="support-heading">Feedback and support</h2>
    <div className="button-row">{feedbackAvailable && api.suggestIdea && <Button onClick={() => void run(() => api.suggestIdea!())}>Suggest an idea</Button>}
      <Button icon="copy" onClick={() => void run(async () => { setReport(await api.previewSupportReport!()); })}>Copy support report</Button></div>
    {report !== undefined && <div className="support-preview" role="region" aria-label="Support report preview"><p>Versions, connection and feature health. No identifiers or recordings.</p>
      <pre>{report}</pre>
      <div className="button-row"><Button variant="primary" onClick={() => void run(async () => { await api.copySupportReport!(); setReport(undefined); setMessage({ text: "Support report copied." }); })}>Copy report</Button>
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
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string>();
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = 0; }, [tab, state?.settings.setupDone, whatsNewOpen]);
  useLayoutEffect(() => { applyTheme(document.documentElement, state?.settings.theme ?? "abyss"); }, [state?.settings.theme]);
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
      <HudRoot subscribeCamera={window.flashfront.subscribeCamera} active={overlayActive} snapshot={state.snapshot} reserveFloor={state.settings.reserveFloor} keyboardEnabled={false} editMode={state.editing} snoozeHotkey={state.settings.snoozeHotkey} snoozeSignal={state.snoozeSignal} heatHeld={state.spawnHeatHeld ?? true} hudPreset={state.settings.hudPreset} textSize={state.settings.textSize} ownTeam={state.raw?.me} featureHealth={state.health ?? featureHealth(state.raw, state.version)} onDecision={window.flashfront.reportDecision} />
    </div> : null;
  }
  const live = !!state.snapshot;
  const preview = state.snapshot ?? example;
  const health = live ? state.health ?? featureHealth(state.raw, state.version) : undefined;
  const diagnosis = diagnose(state);
  const platform = window.flashfront as LauncherApi & Partial<PlatformApi>;
  const connected = state.status.startsWith("connected");
  const connection = connectionLabel(state.status);
  const shortcutProblem = hasShortcutProblem(state.errors);
  const whatsNew = state.appVersion ? WHATS_NEW[state.appVersion] : undefined;
  if (!state.settings.setupDone) return <div className="launcher-shell setup-shell">
    <header className="launcher-topbar"><Wordmark /></header>
    <main className="launcher-content" ref={content}><SetupWizard api={window.flashfront} state={state} /></main>
  </div>;
  const notice = playNotice(state, diagnosis, message);
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
    <aside className="launcher-rail"><a className="rail-brand" href="#play" onClick={() => setTab("Play")} aria-label="FlashFront Play"><FlashFrontMark size={32} /></a>
      <nav className="launcher-tabs" aria-label="Launcher tabs">{TABS.map(name => {
        const dot = name === "Settings" && shortcutProblem;
        return <button type="button" key={name} aria-label={dot ? `${name}: a shortcut could not register` : name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>
          <span className="rail-icon"><Icon name={navIcons[name]} size={20} />{dot && <span className="rail-dot" aria-hidden="true" />}</span>
          <span className="rail-label">{name}</span>
        </button>;
      })}</nav>
    </aside>
    <header className="launcher-topbar"><Wordmark />{state.version && <span className="version-chip">OpenFront {state.version}</span>}
      <div className={`connection-status ${connection.online ? "online" : ""}`} role="status"><span className="connection-light" aria-hidden="true" />{connection.text}</div>
    </header>
    <main className="launcher-content" ref={content}>
      {whatsNew && state.appVersion && (whatsNewOpen || (whatsNewMode === "show" && dismissedVersion !== state.appVersion)) && <WhatsNew version={state.appVersion} entry={whatsNew}
        onFullNotes={() => void action(() => window.flashfront.openReleaseNotes(state.appVersion!))} onDismiss={dismissWhatsNew} />}
      {tab !== "Play" && tabNotice && <div className="tab-notice"><Status tone={tabNotice.error ? "danger" : "neutral"} title={tabNotice.text} /></div>}
      {tab === "Themes" && <ThemesTab api={window.flashfront} settings={state.settings} />}
      {tab === "Layout" && <LayoutEditor api={window.flashfront} settings={state.settings} />}
      {tab === "Stream" && <StreamStudio api={window.flashfront} settings={state.settings} snapshot={state.snapshot} />}
      {tab === "Training" && <TrainingRoom />}
      {tab === "Matches" && <MatchesTab api={window.flashfront} settings={state.settings} />}
      {tab === "Profile" && <ProfileTab api={window.flashfront} settings={state.settings} />}
      {tab === "Settings" && draft && <form className="settings-form" onSubmit={e => {
        e.preventDefault();
        if (Object.keys(fieldErrors).some(field => fieldErrors[field as keyof typeof fieldErrors] && !fieldErrors[field as keyof typeof fieldErrors]!.startsWith("Could not register"))) return;
        // Only the form's own fields are saved, so changes made on other screens (and lastSeenVersion) are kept.
        void action(async () => { await window.flashfront.saveSettings(mergeSettingsForm(state.settings, draft, editStart.current)); setDirty(false); }, "Settings saved.");
      }}>
      <h1>Settings</h1>
      <section className="settings-section" aria-labelledby="hotkeys-heading">
        <h2 id="hotkeys-heading">Hotkeys</h2>
        <div className="settings-grid">{HOTKEY_FIELDS.map(([field, label]) => <div className="settings-field" key={field} data-invalid={fieldErrors[field] ? "true" : undefined}>
          <label>{label}<input className="hotkey-input" value={draft[field]} aria-invalid={fieldErrors[field] ? true : undefined} aria-describedby={fieldErrors[field] ? `${field}-error` : undefined} onChange={e => editDraft({ ...draft, [field]: e.target.value })} /></label>
          {fieldErrors[field] && <p className="field-error" id={`${field}-error`}><Icon name="warning" label="Problem" />{fieldErrors[field]}</p>}
        </div>)}</div>
        <p className="muted shortcut-help">Ctrl, Alt, Shift or Meta with a letter, number or function key. F8 is reserved for Flash clipping.</p>
      </section>
      <section className="settings-section" aria-labelledby="hud-heading">
        <h2 id="hud-heading">HUD</h2>
        <div className="settings-grid">
          <label className="full-row">Reserve floor: {draft.reserveFloor}% of max<input type="range" min="20" max="60" step="1" value={draft.reserveFloor} onChange={e => editDraft({ ...draft, reserveFloor: Number(e.target.value) })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={draft.startHidden} onChange={e => editDraft({ ...draft, startHidden: e.target.checked })} />Start HUD hidden</label>
        <p className="muted">The HUD is hidden in ranked matches and replays.</p>
        <label className="check"><input type="checkbox" checked={draft.spawnChime} onChange={e => editDraft({ ...draft, spawnChime: e.target.checked })} />Play a chime when spawn starts</label>
        {draft.practiceGoal && <div className="practice-goal"><span>Next match: {PRACTICE_GOALS[draft.practiceGoal]}</span><Button onClick={() => editDraft({ ...draft, practiceGoal: undefined })}>Clear goal</Button></div>}
      </section>
      <details className="settings-advanced"><summary><Icon name="chevron" className="disclosure-chevron" />Advanced</summary>
        <label>Debug port<input type="number" min="1" max="65535" value={draft.port} onChange={e => editDraft({ ...draft, port: Number(e.target.value) })} /></label>
        <SettingsLaunchOption savedPort={state.settings.port} draftPort={draft.port} onCopy={text => void action(() => navigator.clipboard.writeText(text), "Launch option copied.")} />
      </details>
      <div className="button-row settings-actions">
        <Button variant="primary" type="submit">Save settings</Button>
        <Button onClick={() => void action(() => window.flashfront.saveSettings({ ...state.settings, setupDone: false }))}>Run setup again</Button>
        {whatsNew && <Button variant="ghost" onClick={() => setWhatsNewOpen(true)}>What's new in {state.appVersion}</Button>}
      </div>
      <SupportActions api={platform} feedbackAvailable={state.feedbackAvailable} />
    </form>}
      {tab === "Play" && <div className="play-view">
        <section className="play-controls" aria-label="Connection">
          <h1>{playHeadline(state)}</h1>
          <p className="play-subline muted">{state.snapshot ? `${state.snapshot.map} · ${state.snapshot.mode}` : "Growth, reserves and economy. Your call."}</p>
          <div className="play-notice" data-diagnosis={diagnosis.code}><Status tone={notice.tone} title={notice.title}>{(notice.detail || notice.launchOption) && <>
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
          </>}</Status></div>
          <Button variant="primary" className="launch-button" icon="play" disabled={state.launching || connected} aria-busy={state.launching} onClick={() => void action(window.flashfront.launch)}>{connected ? "OpenFront is running" : state.launching ? "Waiting for OpenFront…" : "Launch OpenFront"}</Button>
          <div className="hud-controls">
            <div className="hud-actions"><Button role="switch" aria-checked={state.hudEnabled} onClick={() => void action(window.flashfront.toggleHud)}>HUD {state.hudEnabled ? "on" : "off"}</Button><Keys shortcut={state.settings.toggleHotkey} /></div>
            <div className="hud-actions"><Button disabled={editIsBlocked} onClick={() => void action(window.flashfront.toggleEdit)}>{state.editing ? "Finish editing" : "Edit HUD"}</Button><Keys shortcut={state.settings.editHotkey} /></div>
          </div>
          {state.update && <section className="update-row" aria-label="FlashFront update">
            <div><strong>FlashFront {state.update.version}</strong><span className="muted">{state.update.ready ? "Downloaded. Ready to install." : "Downloading in the background."}{headline ? ` ${headline}` : ""}</span></div>
            {state.update.ready && platform.restartToUpdate && <Button onClick={() => void action(() => platform.restartToUpdate!())}>Restart to update</Button>}
          </section>}
          {health && <details className="data-health"><summary><Icon name="chevron" className="disclosure-chevron" />Data health</summary><dl>{Object.entries(health).map(([feature, status]) => <div className="spread" key={feature}><dt>{feature === "spawnHeat" ? "Spawn heat" : feature}</dt><dd>{status === "paused" ? "estimate paused" : status}</dd></div>)}</dl></details>}
          <p className="fair-play muted">Visible information. Read-only. Your call.</p>
        </section>
        <aside className="live-preview" aria-label="HUD module preview"><div className="spread"><h2>Field instruments</h2><span className={`preview-chip ${live ? "live" : ""}`}>{live ? "Live" : "Example"}</span></div>
          <Module title="Troop growth" icon="growth" value={live ? preview.phase : undefined}>{health && health.growth !== "verified" ? <p className="muted">{health.growth === "paused" ? "estimate paused" : "unavailable"}</p> : <GrowthGauge self={preview.self} phase={preview.phase} />}</Module>
          <Module title="Attack preview" icon="attack">{health && health.attack !== "verified" ? <p className="muted">{health.attack === "paused" ? "estimate paused" : "unavailable"}</p> : <AttackPreview self={preview.self} phase={preview.phase} reserveFloor={state.settings.reserveFloor} snapshot={preview} />}</Module>
          {!live && <p className="preview-note muted">Example: 12 minutes in, troops at 48% of max. Live numbers replace it during a match.</p>}
        </aside>
        <section className="play-briefing" aria-label="Briefing">
          <NextMatchPlate api={window.flashfront} settings={state.settings} />
          <Button variant="ghost" className="review-last" onClick={() => setTab("Matches")}>Review last match <Icon name="chevron" /></Button>
        </section>
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
