import { describe, expect, it } from "vitest";
import { cursorTrackable, DEFAULT_SETTINGS, isGameProcess, nudgeBounds, nudgesAllowed, overlayPlacement, overlayShape, overlayVisible, parseSettings, weakPc, resolveLite } from "./shared";
it("flags few cores or low memory as weak, never an 8 GB PC or unknown numbers", () => {
  const GiB = 2 ** 30;
  expect(weakPc({ cpus: 4, totalMemBytes: 16 * GiB })).toBe(true);
  expect(weakPc({ cpus: 8, totalMemBytes: 6 * GiB })).toBe(true);
  expect(weakPc({ cpus: 8, totalMemBytes: 7.8 * GiB })).toBe(false);
  expect(weakPc({ cpus: 8, totalMemBytes: 7 * GiB })).toBe(false);
  expect(weakPc({ cpus: 0, totalMemBytes: 16 * GiB })).toBe(false);
  expect(weakPc({ cpus: 8, totalMemBytes: 0 })).toBe(false);
  expect(resolveLite("auto", { cpus: 2, totalMemBytes: 16 * GiB })).toBe(true);
  expect(resolveLite("auto", { cpus: 8, totalMemBytes: 16 * GiB })).toBe(false);
  expect(resolveLite("off", { cpus: 2, totalMemBytes: 4 * GiB })).toBe(false);
  expect(resolveLite("on", { cpus: 16, totalMemBytes: 64 * GiB })).toBe(true);
});
it("old settings files load with Lite on Auto and junk is refused", () => {
  const { liteMode, ...old } = DEFAULT_SETTINGS;
  expect(parseSettings(old).liteMode).toBe("auto");
  for (const liteMode of ["fast", null, 1]) expect(() => parseSettings({ ...DEFAULT_SETTINGS, liteMode })).toThrow("Choose Auto, On or Off for Lite mode.");
});
it("defaults legacy snooze settings and validates all four shortcuts without reserving the old snooze key", () => {
  const { snoozeHotkey: _s, ...legacy } = DEFAULT_SETTINGS;
  expect(DEFAULT_SETTINGS.snoozeHotkey).toBe("Ctrl+Alt+S");
  expect(parseSettings(legacy).snoozeHotkey).toBe("Ctrl+Alt+S");
  expect(parseSettings({ ...legacy, snoozeHotkey: "Ctrl+Alt+J", toggleHotkey: "Ctrl+Alt+S" }).snoozeHotkey).toBe("Ctrl+Alt+J");
  for (const snoozeHotkey of ["alt+ctrl+h", "alt+ctrl+e", "alt+ctrl+m", "Ctrl+F8", "S", "", 1, null]) {
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, snoozeHotkey })).toThrow();
  }
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, snoozeHotkey: "Ctrl+Alt+J", bookmarkHotkey: "alt+ctrl+j" })).toThrow();
});
it("uses the game minus one row for spawn heat and returns to panel bounds or hides afterwards", () => {
  const game = { x: -1920, y: 20, width: 1920, height: 1080 };
  const full = overlayPlacement([], game, false, true)!;
  expect(full.bounds).toEqual({ ...game, height: 1079 });
  expect(full.viewport).toEqual({ offsetX: 0, offsetY: 0, width: 1920, height: 1080 });
  expect(overlayPlacement([], game, false, false)).toBeNull();
  const panels = [{ x: 16, y: 284, width: 272, height: 120 }];
  expect(overlayPlacement(panels, game, false, false)!.bounds.width).toBe(276);
});
it("migrates old settings to Abyss and round-trips only the four theme IDs", () => {
  const { theme: _theme, ...legacy } = DEFAULT_SETTINGS;
  expect(parseSettings(legacy).theme).toBe("abyss");
  for (const theme of ["abyss", "daylight", "ember", "signal"]) expect(parseSettings(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, theme }))).theme).toBe(theme);
  for (const theme of [null, "night", "__proto__", 1, {}]) expect(() => parseSettings({ ...DEFAULT_SETTINGS, theme })).toThrow();
});
it("validates persisted settings and refuses reserved or duplicate hotkeys", () => {
  expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  // First-run setup: older settings files have no flag and get the wizard once; a saved true sticks.
  const { setupDone: _setup, ...beforeSetup } = DEFAULT_SETTINGS;
  expect(parseSettings(beforeSetup).setupDone).toBe(false);
  expect(parseSettings({ ...DEFAULT_SETTINGS, setupDone: true }).setupDone).toBe(true);
  expect(parseSettings({ ...DEFAULT_SETTINGS, setupDone: "yes" }).setupDone).toBe(false);
  // 0.2.0 settings default when missing and reject invalid values.
  const { bookmarkHotkey: _b, spawnChime: _c, ownSpawnHistory: _o, hudPreset: _h, textSize: _t, obsDelaySec: _d, obsHideOwnNumbers: _x, shareShowName: _n, ...before020 } = DEFAULT_SETTINGS;
  expect(parseSettings(before020)).toEqual(DEFAULT_SETTINGS);
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, obsDelaySec: 45 })).toThrow();
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, hudPreset: "huge" })).toThrow();
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, spawnChime: "on" })).toThrow();
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, bookmarkHotkey: DEFAULT_SETTINGS.toggleHotkey })).toThrow();
  // Shortcuts equal after reordering modifiers are the same shortcut.
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, editHotkey: "Alt+Ctrl+H" })).toThrow();
  expect(() => parseSettings({ ...DEFAULT_SETTINGS, bookmarkHotkey: "alt+ctrl+s" })).toThrow();
  expect(parseSettings({ ...DEFAULT_SETTINGS, obsDelaySec: 60, textSize: "comfortable" })).toMatchObject({ obsDelaySec: 60, textSize: "comfortable" });
  expect(JSON.stringify(DEFAULT_SETTINGS)).not.toContain("F8");
  for (const patch of [{ toggleHotkey: "Ctrl+F8" }, { editHotkey: DEFAULT_SETTINGS.toggleHotkey }, { port: 47474 }, { port: -1 }]) {
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, ...patch })).toThrow();
  }
});
it("migrates reserve settings and persists exactly one validated practice goal", () => {
  const { reserveFloor: _floor, ...legacy } = DEFAULT_SETTINGS;
  expect(parseSettings(legacy).reserveFloor).toBe(35);
  const saved = parseSettings(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, reserveFloor: 60, practiceGoal: "reserve35" })));
  expect(saved).toMatchObject({ reserveFloor: 60, practiceGoal: "reserve35" });
  expect(parseSettings({ ...saved, practiceGoal: undefined }).practiceGoal).toBeUndefined();
  for (const reserveFloor of [19, 61, NaN, 35.5, "35"]) expect(() => parseSettings({ ...saved, reserveFloor })).toThrow();
  expect(() => parseSettings({ ...saved, practiceGoal: "arbitrary" })).toThrow();
});
it("shows the overlay only in-game, focused or editing, with valid bounds and enabled HUD", () => {
  const state = { raw: { inGame: true, visible: true }, editing: false, hudEnabled: true, settings: DEFAULT_SETTINGS };
  expect(overlayVisible(state, false, true)).toBe(true);
  expect(overlayVisible(state, true, true)).toBe(false);
  expect(overlayVisible(state, false, false)).toBe(false);
  expect(overlayVisible({ ...state, raw: null }, false, true)).toBe(false);
  expect(overlayVisible({ ...state, raw: { inGame: false, visible: true }, editing: true }, false, true)).toBe(false);
  expect(overlayVisible({ ...state, raw: { inGame: true, visible: false } }, false, true)).toBe(false);
  expect(overlayVisible({ ...state, raw: { inGame: true, visible: false }, editing: true }, false, true)).toBe(true);
  expect(overlayVisible({ ...state, hudEnabled: false }, false, true)).toBe(false);
});
// 0.2.2: hiding in ranked and replays comes from game data only; an old `ranked: false` setting can't turn it off.
it("hides in ranked and replays whatever the old ranked setting says, and only there", () => {
  const base = { raw: { inGame: true, visible: true }, editing: false, hudEnabled: true, settings: { ...DEFAULT_SETTINGS, ranked: false } };
  expect(overlayVisible({ ...base, snapshot: { mode: "Ranked" } }, false, true)).toBe(false);
  expect(overlayVisible({ ...base, raw: { ...base.raw, game: { rankedType: "1v1" } } }, false, true)).toBe(false);
  expect(overlayVisible({ ...base, raw: { ...base.raw, game: { type: "Ranked" } } }, false, true)).toBe(false);
  expect(overlayVisible({ ...base, raw: { ...base.raw, replay: true } }, false, true)).toBe(false);
  expect(overlayVisible({ ...base, snapshot: { mode: "FFA" } }, false, true)).toBe(true);
});
it("hides in replays and while spectating", () => {
  const base = { raw: { inGame: true, visible: true }, editing: false, hudEnabled: true, settings: DEFAULT_SETTINGS };
  expect(overlayVisible({ ...base, snapshot: { mode: "FFA", observer: "replay" } }, false, true)).toBe(false);
  expect(overlayVisible({ ...base, snapshot: { mode: "FFA", observer: "spectating" } }, false, true)).toBe(false);
});
// OpenFront's Steam build has two windows ("OpenFront" for the Steam overlay and "OpenFront (ALPHA)"),
// and Windows mostly keeps the helper in front, so the page's document.hasFocus() is false while
// playing (measured 2026-10-16). An OS-level foreground check overrides the page's focus flag.
it("uses the OS foreground check when available instead of the page focus flag", () => {
  const base = { raw: { inGame: true, visible: false }, editing: false, hudEnabled: true, settings: DEFAULT_SETTINGS };
  expect(overlayVisible(base, false, true)).toBe(false);
  expect(overlayVisible(base, false, true, true)).toBe(true);
  expect(overlayVisible({ ...base, raw: { inGame: true, visible: true } }, false, true, false)).toBe(false);
  expect(overlayVisible(base, false, true, null)).toBe(false); // no OS info: fall back to page focus
});
it("treats any window of the OpenFront process as the game", () => {
  expect(isGameProcess(String.raw`C:\Program Files (x86)\Steam\steamapps\common\OpenFront\OpenFront.exe`)).toBe(true);
  expect(isGameProcess(String.raw`C:\Program Files\Claude\claude.exe`)).toBe(false);
  expect(isGameProcess("/home/u/.steam/steam/steamapps/common/OpenFront/OpenFront")).toBe(true);
  expect(isGameProcess(undefined)).toBe(false);
});
// The overlay window is clipped to the panels with setShape so the rest of the screen is pure game
// (a full-screen transparent always-on-top window made OpenFront lag and drop out of fullscreen).
it("turns visible panel rects into a padded integer window shape", () => {
  expect(overlayShape([{ x: 16.4, y: 290.2, width: 300, height: 180.6 }], { width: 1920, height: 1080 }, false))
    .toEqual([{ x: 14, y: 288, width: 305, height: 185 }]);
  expect(overlayShape([{ x: -10, y: 1000, width: 300, height: 200 }], { width: 1920, height: 1080 }, false))
    .toEqual([{ x: 0, y: 998, width: 292, height: 82 }]);
  expect(overlayShape([{ x: 5, y: 5, width: 0, height: 10 }], { width: 1920, height: 1080 }, false)).toEqual([]);
  expect(overlayShape([], { width: 1920, height: 1080 }, true)).toEqual([{ x: 0, y: 0, width: 1920, height: 1080 }]);
});
// Chromium stops painting a window it considers fully covered, and it checks window rectangles, not
// clipped shapes. A full-screen opaque overlay turned the OpenFront map grey (2026-10-16), so the
// overlay window is sized to the panels' bounding box and must never cover the whole game window.
describe("overlayPlacement", () => {
  const game = { x: 0, y: 0, width: 1920, height: 1080 };
  it("sizes the window to the panels' bounding box and clips to the panels", () => {
    const p = overlayPlacement([{ x: 16, y: 290, width: 300, height: 200 }, { x: 1604, y: 190, width: 300, height: 400 }], game, false)!;
    expect(p.bounds).toEqual({ x: 14, y: 188, width: 1892, height: 404 });
    expect(p.viewport).toEqual({ offsetX: 14, offsetY: 188, width: 1920, height: 1080 });
    expect(p.shape).toEqual([{ x: 0, y: 100, width: 304, height: 204 }, { x: 1588, y: 0, width: 304, height: 404 }]);
  });
  it("follows the game window position", () => {
    const p = overlayPlacement([{ x: 16, y: 290, width: 300, height: 200 }], { x: 100, y: 50, width: 1280, height: 720 }, false)!;
    expect(p.bounds).toEqual({ x: 114, y: 338, width: 304, height: 204 });
  });
  it("never covers the entire game window, even while editing", () => {
    const p = overlayPlacement([], game, true)!;
    expect(p.bounds.width * p.bounds.height).toBeLessThan(game.width * game.height);
    expect(p.shape).toEqual([{ x: 0, y: 0, width: p.bounds.width, height: p.bounds.height }]);
  });
  it("returns null when there is nothing to show", () => {
    expect(overlayPlacement([], game, false)).toBeNull();
  });
});
it("keeps an optional last-seen launcher version for What's new and rejects malformed versions", () => {
  expect(parseSettings(DEFAULT_SETTINGS).lastSeenVersion).toBeUndefined();
  expect("lastSeenVersion" in parseSettings(DEFAULT_SETTINGS)).toBe(false);
  expect(parseSettings({ ...DEFAULT_SETTINGS, lastSeenVersion: "0.2.1" }).lastSeenVersion).toBe("0.2.1");
  expect(parseSettings({ ...DEFAULT_SETTINGS, lastSeenVersion: "1.0.0-beta.2" }).lastSeenVersion).toBe("1.0.0-beta.2");
  for (const lastSeenVersion of ["", "v0.2.1", "0.2", "latest", 21, null, "0.2.1/../x"]) {
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, lastSeenVersion })).toThrow();
  }
});

describe("coach nudges setting", () => {
  it("defaults on, parses an older file as on, and rejects a non-boolean", () => {
    expect(DEFAULT_SETTINGS.nudges).toBe(true);
    expect(parseSettings({ ...DEFAULT_SETTINGS, nudges: undefined }).nudges).toBe(true);
    expect(parseSettings({ ...DEFAULT_SETTINGS, nudges: false }).nudges).toBe(false);
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, nudges: "yes" })).toThrow("Invalid nudges setting.");
  });
  it("nudges hide in ranked, replays, edit mode, with the setting off, and when a read is unverified", () => {
    const verified = { growth: "verified", attack: "verified", build: "verified", trade: "paused", alliances: "verified", spawnHeat: "unavailable" } as const;
    const allowed = { settings: DEFAULT_SETTINGS, raw: { inGame: true, visible: true }, health: verified, editing: false, hudEnabled: true, snapshot: { mode: "FFA" } };
    expect(nudgesAllowed(allowed, true)).toBe(true);
    expect(nudgesAllowed({ ...allowed, raw: { ...allowed.raw, game: { rankedType: "ffa" } } }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, raw: { ...allowed.raw, replay: true } }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, snapshot: { mode: "FFA", observer: "spectating" } }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, editing: true }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, settings: { ...DEFAULT_SETTINGS, nudges: false } }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, hudEnabled: false }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, health: { ...verified, alliances: "paused" } }, true)).toBe(false);
    expect(nudgesAllowed({ ...allowed, health: undefined }, true)).toBe(false);
    expect(nudgesAllowed(allowed, false)).toBe(false);
  });
});

describe("cursor tag placement", () => {
  it("the tag never covers the cursor and always stays inside the game", () => {
    const game = { x: 100, y: 50, width: 1920, height: 1080 };
    for (let cx = game.x; cx <= game.x + game.width; cx += 60) for (let cy = game.y; cy <= game.y + game.height; cy += 60) {
      const { bounds } = nudgeBounds({ x: cx, y: cy }, game);
      const covers = cx >= bounds.x && cx < bounds.x + bounds.width && cy >= bounds.y && cy < bounds.y + bounds.height;
      expect(covers, `${cx},${cy}`).toBe(false);
      expect(bounds.x).toBeGreaterThanOrEqual(game.x); expect(bounds.y).toBeGreaterThanOrEqual(game.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(game.x + game.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(game.y + game.height);
    }
  });
  it("flips at the bottom-right corner and parks centrally when the cursor is off the game", () => {
    const game = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(nudgeBounds({ x: 1900, y: 1070 }, game).anchor).toBe("bottom-right");
    expect(nudgeBounds({ x: 10, y: 10 }, game)).toEqual({ anchor: "top-left", bounds: { x: 34, y: 34, width: 340, height: 88 } });
    expect(nudgeBounds({ x: 3000, y: 10 }, game)).toEqual({ anchor: "center", bounds: { x: 790, y: 841, width: 340, height: 88 } });
    expect(nudgeBounds({ x: -500, y: 500 }, { x: -1920, y: 0, width: 1920, height: 1080 }).anchor).toBe("top-left");
    expect(nudgeBounds({ x: 500, y: 500 }, { x: -1920, y: 0, width: 1920, height: 1080 }).bounds).toEqual({ x: -1130, y: 841, width: 340, height: 88 });
  });
});

it("parks the tag when the cursor point can't be trusted (Linux Wayland)", () => {
  const game = { x: 0, y: 0, width: 1920, height: 1080 };
  expect(nudgeBounds(null, game)).toEqual({ anchor: "center", bounds: { x: 790, y: 841, width: 340, height: 88 } });
  expect(cursorTrackable("linux", { XDG_SESSION_TYPE: "wayland" })).toBe(false);
  expect(cursorTrackable("linux", { XDG_SESSION_TYPE: "x11" })).toBe(true);
  expect(cursorTrackable("linux", {})).toBe(true);
  expect(cursorTrackable("win32", { XDG_SESSION_TYPE: "wayland" })).toBe(true);
});
it("parses a saved stream layout, drops the removed Lobby widget and rejects bad values", () => {
  expect(parseSettings(DEFAULT_SETTINGS).streamLayout).toBeUndefined();
  expect(parseSettings({ ...DEFAULT_SETTINGS, streamLayout: { widgets: ["result", "lobby", "stats"], scale: 2, anchor: "br" } }).streamLayout)
    .toEqual({ widgets: ["stats", "result"], scale: 2, anchor: "br" });
  for (const streamLayout of [{ widgets: [], scale: 5, anchor: "tl" }, { widgets: ["nope"], scale: 1, anchor: "tl" }, { widgets: [], scale: 1, anchor: "middle" }])
    expect(() => parseSettings({ ...DEFAULT_SETTINGS, streamLayout })).toThrow();
});

it("defaults visual effects to Full, accepts both choices and rejects invalid values", () => {
  const { visualEffects, ...old } = DEFAULT_SETTINGS;
  expect(visualEffects).toBe("full");
  expect(parseSettings(old).visualEffects).toBe("full");
  for (const visualEffects of ["full", "lite"] as const) expect(parseSettings({ ...old, visualEffects }).visualEffects).toBe(visualEffects);
  for (const visualEffects of ["auto", "FULL", "", null, 1, true]) expect(() => parseSettings({ ...old, visualEffects })).toThrow("Choose Full or Lite for visual effects.");
});
