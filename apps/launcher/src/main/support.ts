import { RULES_VERSION } from "@flashfront/core";
import type { LauncherState } from "../shared";
import { featureHealth } from "./health";

// The player's Tally form URL goes here when it exists. An empty placeholder opens no website.
export const FEEDBACK_URL = "";
export interface PlatformApi {
  restartToUpdate(): Promise<void>;
  suggestIdea(): Promise<void>;
  previewSupportReport(): Promise<string>;
  copySupportReport(): Promise<void>;
}
export function supportReport(state: LauncherState, versions: { app: string; electron: string; platform: string }): string {
  const version = (value?: string) => value && /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value) ? value : "not detected";
  const hotkeys = [state.settings.toggleHotkey, state.settings.editHotkey, state.settings.bookmarkHotkey, state.settings.snoozeHotkey];
  const failed = hotkeys.filter(key => state.errors.some(e => e.startsWith(`Shortcut ${key} could not register.`)));
  return ["FlashFront support report", `FlashFront: ${version(versions.app)}`, `Electron: ${version(versions.electron)}`,
    `Platform: ${versions.platform}`, `OpenFront: ${version(state.version)}`, `Rules: ${RULES_VERSION}`, `Connection: ${state.status}`,
    `HUD: ${state.hudEnabled ? "on" : "off"}`, "Feature health:",
    ...Object.entries(featureHealth(state.raw, state.version)).map(([feature, status]) => `  ${feature}: ${status === "paused" ? "estimate paused" : status}`),
    `Hotkey errors: ${failed.length ? failed.join(", ") : "none"}`, "No player identifiers, file paths or recordings included."].join("\n");
}
