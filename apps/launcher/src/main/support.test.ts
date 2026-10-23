import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, type LauncherState } from "../shared";
import { supportReport } from "./support";

it("reports versions and capability failures without identifiers, recordings or arbitrary errors", () => {
  const state: LauncherState = { feedbackAvailable: false, settings: { ...DEFAULT_SETTINGS, publicId: "private-id" }, status: "connected-game", version: "0.35.2",
    raw: { inGame: true, visible: true, gameId: "secret-match", me: { name: "private-name", troops: 123456, clientId: "secret-client" } },
    snapshot: null, editing: false, hudEnabled: true, launching: false, setupNeeded: false,
    errors: ["Shortcut Ctrl+Alt+H could not register. Choose a different key in Settings.", `Recording at ${["C:", "Users", "private-name", "secret-match"].join("\\")} failed`] };
  const report = supportReport(state, { app: "0.2.0", electron: "44.7.2", platform: "win32" });
  expect(report).toContain("FlashFront: 0.2.0"); expect(report).toContain("growth: estimate paused");
  expect(report).toContain("Ctrl+Alt+H"); expect(report).toContain("connected-game");
  expect(report).not.toMatch(/private-|secret-|123456|Users/);
  state.settings.snoozeHotkey = "Ctrl+Alt+J";
  state.errors = ["Shortcut Ctrl+Alt+J could not register. Choose a different key in Settings."];
  expect(supportReport(state, { app: "0.2.0", electron: "44.7.2", platform: "win32" })).toContain("Hotkey errors: Ctrl+Alt+J");
});
