import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, editBlocked, mergeSettingsForm, SETTINGS_FORM_FIELDS, type Settings } from "../shared";

// 0.2.1 sweep: Save in Settings wrote a stale draft over fields changed on other screens.
it("save keeps fields changed on other screens and applies only the form's own fields", () => {
  const stale: Settings = { ...DEFAULT_SETTINGS, textSize: "compact", reserveFloor: 35, practiceGoal: "port180" };
  const latest: Settings = { ...stale, textSize: "comfortable", obsDelaySec: 30, hudPreset: "economy" };
  const draft: Settings = { ...stale, reserveFloor: 40, spawnChime: false, practiceGoal: undefined };
  const saved = mergeSettingsForm(latest, draft);
  expect(saved.textSize).toBe("comfortable");
  expect(saved.obsDelaySec).toBe(30);
  expect(saved.hudPreset).toBe("economy");
  expect(saved.reserveFloor).toBe(40);
  expect(saved.spawnChime).toBe(false);
  expect("practiceGoal" in saved).toBe(false);
  expect(SETTINGS_FORM_FIELDS).toEqual(expect.arrayContaining(["toggleHotkey", "editHotkey", "snoozeHotkey", "bookmarkHotkey", "reserveFloor", "startHidden", "spawnChime", "practiceGoal", "port"]));
});

// Final review: an unsaved hotkey edit, then a practice goal picked on Matches, then Save, put the old goal back.
it("save leaves form fields the player didn't touch at their latest value", () => {
  const editStart: Settings = { ...DEFAULT_SETTINGS, practiceGoal: "port180", port: 9222 };
  const latest: Settings = { ...editStart, practiceGoal: "under70", port: 9333 };
  const draft: Settings = { ...editStart, toggleHotkey: "Ctrl+Alt+J" };
  const saved = mergeSettingsForm(latest, draft, editStart);
  expect(saved.practiceGoal).toBe("under70");
  expect(saved.port).toBe(9333);
  expect(saved.toggleHotkey).toBe("Ctrl+Alt+J");
  const cleared = mergeSettingsForm(latest, { ...editStart, practiceGoal: undefined }, editStart);
  expect("practiceGoal" in cleared).toBe(false);
});

// Final review: the launcher's edit-mode block missed game.type "Ranked"; it now uses the shared check.
it("blocks HUD editing outside a match and in every restricted match", () => {
  const raw = { inGame: true, visible: true };
  expect(editBlocked({ raw, snapshot: { mode: "FFA" } })).toBe(false);
  expect(editBlocked({ raw: { ...raw, inGame: false } })).toBe(true);
  expect(editBlocked({ raw: { ...raw, game: { type: "Ranked" } } })).toBe(true);
  expect(editBlocked({ raw: { ...raw, game: { rankedType: "ffa" } } })).toBe(true);
  expect(editBlocked({ raw: { ...raw, replay: true } })).toBe(true);
  expect(editBlocked({ raw, snapshot: { observer: "spectating" } })).toBe(true);
});
