import { expect, it } from "vitest";
import { attackPreview, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherState } from "../../shared";
import { diagnose } from "../../main/health";
import { connectionLabel, exampleSnapshot, hasShortcutProblem, hotkeyFieldErrors, playHeadline, playNotice, updateHeadline } from "./launcher-status";

const base: LauncherState = { feedbackAvailable: false, status: "port-closed", settings: { ...DEFAULT_SETTINGS, setupDone: true }, raw: null, snapshot: null,
  editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };
const inMatch: RawExtract = { inGame: true, visible: true, me: { troops: 1 } } as RawExtract;
const notice = (state: LauncherState, message?: { text: string; error?: boolean }) => playNotice(state, diagnose(state), message);

it("says only Not connected, Connected · Menu or Connected · Match in the top bar", () => {
  expect(connectionLabel("searching")).toEqual({ text: "Not connected", online: false });
  expect(connectionLabel("port-closed").text).toBe("Not connected");
  expect(connectionLabel("disconnected").text).toBe("Not connected");
  expect(connectionLabel("connected-menu")).toEqual({ text: "Connected · Menu", online: true });
  expect(connectionLabel("connected-game")).toEqual({ text: "Connected · Match", online: true });
});

it("Play's headline follows the connection state", () => {
  expect(playHeadline(base)).toBe("READY TO LAUNCH");
  expect(playHeadline({ ...base, setupNeeded: true })).toBe("SETUP REQUIRED");
  expect(playHeadline({ ...base, launching: true })).toBe("WAITING FOR OPENFRONT");
  expect(playHeadline({ ...base, status: "searching" })).toBe("WAITING FOR OPENFRONT");
  expect(playHeadline({ ...base, status: "disconnected" })).toBe("WAITING FOR OPENFRONT");
  expect(playHeadline({ ...base, status: "connected-menu" })).toBe("IN MENU");
  expect(playHeadline({ ...base, status: "connected-game" })).toBe("IN MATCH");
});

it("picks exactly one notice: errors, then setup, then shortcuts, then confirmations, then state", () => {
  expect(notice({ ...base, errors: ["Launch failed: boom"] })).toMatchObject({ tone: "danger", title: "Launch failed: boom" });
  expect(notice(base, { text: "Something broke", error: true })).toMatchObject({ tone: "danger", title: "Something broke" });
  // Not connected: the launch option sits with the explanation; neutral until a launch timed out.
  // Not running and no setup problem: a neutral fact, the launch option stays behind the disclosure.
  expect(notice(base)).toEqual({ tone: "neutral", title: "OpenFront is not running.", launchOption: "disclosure" });
  expect(notice({ ...base, setupNeeded: true })).toMatchObject({ tone: "caution", setup: true, launchOption: "open" });
  // A plain confirmation is neutral and rides along with the setup notice instead of adding a second one.
  expect(notice(base, { text: "Launch option copied." })).toMatchObject({ launchOption: "disclosure", note: "Launch option copied." });
  expect(notice({ ...base, setupNeeded: true }, { text: "Launch option copied." })).toMatchObject({ setup: true, note: "Launch option copied." });
  expect(notice({ ...base, launching: true })).toMatchObject({ tone: "neutral", title: "Waiting for OpenFront…" });
  const connected = { ...base, status: "connected-game" as const, raw: inMatch };
  expect(notice({ ...connected, errors: ["Shortcut Ctrl+Alt+H could not register. Choose a different key in Settings."] }))
    .toMatchObject({ tone: "caution", title: "A FlashFront shortcut could not register." });
  expect(notice(connected, { text: "Settings saved." })).toEqual({ tone: "neutral", title: "Settings saved." });
  expect(notice({ ...connected, version: "0.99.0" })).toMatchObject({ tone: "caution" });
  expect(notice(connected)).toMatchObject({ tone: "success", title: "Connected. The HUD is ready." });
  expect(notice({ ...base, status: "connected-menu" })).toMatchObject({ tone: "neutral", title: "Connected to the OpenFront menu." });
  // State, never commands.
  for (const state of [base, { ...connected, hudEnabled: false }, { ...connected, raw: { ...inMatch, visible: false } }, { ...connected, errors: ["Shortcut X could not register."] }]) {
    expect(JSON.stringify(notice(state))).not.toMatch(/\b(choose|switch back|turn hud on|copy the option)\b/i);
  }
});

it("puts shortcut problems under the affected Settings field", () => {
  const settings = { ...DEFAULT_SETTINGS };
  expect(hotkeyFieldErrors(settings, settings, [])).toEqual({});
  expect(hotkeyFieldErrors({ ...settings, snoozeHotkey: "S" }, settings, []).snoozeHotkey).toMatch(/Ctrl, Alt, Shift or Meta/);
  expect(hotkeyFieldErrors({ ...settings, editHotkey: "alt+ctrl+h" }, settings, []).editHotkey).toBe("Same as Toggle HUD.");
  const errors = [`Shortcut ${settings.bookmarkHotkey} could not register. Choose a different key in Settings.`];
  expect(hotkeyFieldErrors(settings, settings, errors)).toEqual({ bookmarkHotkey: "Could not register: another program may be using it." });
  // Editing the field away from the failing key clears the message.
  expect(hotkeyFieldErrors({ ...settings, bookmarkHotkey: "Ctrl+Alt+K" }, settings, errors)).toEqual({});
  expect(hasShortcutProblem(errors)).toBe(true);
  expect(hasShortcutProblem(["Launch failed"])).toBe(false);
});

it("previews a representative mid-game example, not zero-state alarms", () => {
  const example = exampleSnapshot();
  expect(example.phase).toBe("playing");
  const self = example.self!;
  expect(self.troops / self.maxTroops).toBeCloseTo(0.48, 2);
  expect(self.incomingAttacks).toEqual([]);
  expect(attackPreview(self.troops, self.maxTroops, self.attackRatio).remainingFraction).toBeGreaterThan(0.25);
});

it("shows only the headline of incoming release notes in the restart prompt", () => {
  expect(updateHeadline("**Calmer HUD, clearer launcher.** Who it is for.\n\n## Highlights")).toBe("Calmer HUD, clearer launcher.");
  expect(updateHeadline("\n\nSpawn alerts\nmore")).toBe("Spawn alerts");
  // 0.2.2 update card: GitHub sends release notes as HTML, and the tags showed up raw.
  expect(updateHeadline("<p><strong>Fixes for settings, setup and your desktop shortcut.</strong> 0.2.2 is a small update.</p>\n<h2>Highlights</h2>")).toBe("Fixes for settings, setup and your desktop shortcut.");
  expect(updateHeadline("<p>Spawn alerts &amp; more</p>")).toBe("Spawn alerts & more");
  expect(updateHeadline("")).toBeUndefined();
});
