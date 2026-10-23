import { useState } from "react";
import { Button, FlashFrontMark, Icon, Keys, Status } from "@flashfront/ui";
import type { LauncherApi, LauncherState, Settings } from "../../shared";
import { launchOption } from "../../shared";
import { diagnose } from "../../main/health";

const STEPS = ["Welcome", "Steam launch option", "In-game keys", "Ready"] as const;

/**
 * First-run setup, shown until `setupDone` is saved. One task per step; every step can be skipped
 * and nothing is required to reach the launcher. Choices are saved once, on Finish or Skip, with the
 * running version as lastSeenVersion so a first install does not open What's new.
 */
export function SetupWizard({ api, state }: { api: LauncherApi; state: LauncherState }) {
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState({ startHidden: state.settings.startHidden });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const detected = state.status.startsWith("connected");
  const diagnosis = diagnose(state);
  // Explicit choices are kept on Skip too; resolves true only when the settings were saved.
  const finish = async (): Promise<boolean> => {
    setSaving(true); setMessage("");
    const next: Settings = { ...state.settings, ...choices, setupDone: true, ...(state.appVersion ? { lastSeenVersion: state.appVersion } : {}) };
    try { await api.saveSettings(next); return true; } catch (e) { setMessage(String(e)); setSaving(false); return false; }
  };
  const run = async (fn: () => Promise<void>, success: string) => { try { setMessage(""); await fn(); setMessage(success); } catch (e) { setMessage(String(e)); } };
  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  return <div className="setup-wizard">
    <aside className="setup-steps" aria-label="Setup progress">
      <FlashFrontMark size={40} />
      <ol>{STEPS.map((name, i) => <li key={name} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : i === step ? "current" : ""}>
        <span className="setup-step-index" aria-hidden="true">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>{name}
      </li>)}</ol>
      <Button variant="ghost" className="setup-skip" disabled={saving} onClick={() => void finish()}>Skip setup</Button>
    </aside>
    <section className="setup-body" aria-live="polite">
      <p className="setup-count muted">Step {step + 1} of {STEPS.length}</p>
      {step === 0 && <>
        <h1>SET UP FLASHFRONT</h1>
        <p className="setup-lead">Your own OpenFront numbers, read live: where troop growth peaks, what an attack leaves behind, when gold sits idle, where to spawn. About a minute.</p>
        <ul className="setup-promises">
          <li><Icon name="check" /><div><strong>Read-only</strong><span>FlashFront never clicks, sends or builds for you.</span></div></li>
          <li><Icon name="check" /><div><strong>Your numbers</strong><span>Only your own state, plus where players land during the spawn phase.</span></div></li>
          <li><Icon name="check" /><div><strong>Out of ranked</strong><span>The HUD is hidden in ranked matches and replays.</span></div></li>
        </ul>
        <div className="setup-actions"><Button variant="primary" onClick={next}>Start setup <Icon name="chevron" /></Button></div>
      </>}
      {step === 1 && <>
        <h1>STEAM LAUNCH OPTION</h1>
        <p className="setup-lead">FlashFront reads the game through a local debug port. Steam needs one launch option to open it.</p>
        <ol className="setup-instructions">
          <li>In Steam, open <strong>Library</strong>, right-click <strong>OpenFront</strong> and choose <strong>Properties</strong>.</li>
          <li>Paste this into <strong>Launch Options</strong>:
            <div className="setup-code"><code>{launchOption(state.settings.port)}</code><Button icon="copy" onClick={() => void run(api.copySetup, "Launch option copied.")}>Copy</Button></div>
          </li>
          <li>Start OpenFront. FlashFront picks it up on its own.</li>
        </ol>
        <div className="setup-detect" data-diagnosis={diagnosis.code}>{detected
          ? <Status tone="success" title="OpenFront detected. Connected." />
          : <Status tone="neutral" title={state.launching ? "Waiting for OpenFront…" : "Not detected yet."}>{diagnosis.text} FlashFront connects once OpenFront starts with the option.</Status>}</div>
        <p className="muted setup-note">While the option is set, programs on this PC can control the OpenFront window through 127.0.0.1:{state.settings.port}. Removing it turns that off.</p>
        <div className="setup-actions">
          {!detected && <Button variant="primary" icon="play" disabled={state.launching} aria-busy={state.launching} onClick={() => void run(api.launch, "")}>{state.launching ? "Waiting for OpenFront…" : "Launch OpenFront"}</Button>}
          <Button variant={detected ? "primary" : "default"} onClick={next}>{detected ? "Continue" : "Continue without checking"} <Icon name="chevron" /></Button>
        </div>
      </>}
      {step === 2 && <>
        <h1>IN-GAME KEYS</h1>
        <p className="setup-lead">The HUD sits in the free columns beside the map and only shows while OpenFront is in front.</p>
        <dl className="setup-keys">
          <div><dt><Keys shortcut={state.settings.toggleHotkey} /></dt><dd>Show or hide the HUD</dd></div>
          <div><dt><Keys shortcut={state.settings.editHotkey} /></dt><dd>Move panels</dd></div>
          <div><dt><Keys shortcut={state.settings.snoozeHotkey} /></dt><dd>Snooze the decision card for 2 minutes</dd></div>
        </dl>
        <p className="muted setup-note">The HUD is hidden in ranked matches and replays.</p>
        <label className="check"><input type="checkbox" checked={choices.startHidden} onChange={e => setChoices({ ...choices, startHidden: e.target.checked })} />Start with the HUD hidden</label>
        <p className="muted setup-note">Keys can be changed later in Settings.</p>
        <div className="setup-actions"><Button variant="primary" onClick={next}>Continue <Icon name="chevron" /></Button></div>
      </>}
      {step === 3 && <>
        <h1>READY</h1>
        <p className="setup-lead">{detected ? "OpenFront is running. Start a match and the HUD appears beside the map." : "Launch OpenFront from here, or start it from Steam as usual. The HUD appears once a match starts."}</p>
        <p className="muted setup-note">Matches are recorded on this PC only, for your Matches tab. Nothing uploaded unless you send feedback.</p>
        <div className="setup-actions">
          {!detected && <Button variant="primary" icon="play" disabled={saving} onClick={() => void finish().then(ok => { if (ok) return api.launch(); })}>Finish and launch OpenFront</Button>}
          <Button variant={detected ? "primary" : "default"} disabled={saving} onClick={() => void finish()}>{detected ? "Finish" : "Finish without launching"}</Button>
        </div>
      </>}
      {message && <p className="setup-message" role="status">{message}</p>}
      {step > 0 && <Button variant="ghost" icon="back" className="setup-back" onClick={() => setStep(s => s - 1)}>Back</Button>}
    </section>
  </div>;
}
