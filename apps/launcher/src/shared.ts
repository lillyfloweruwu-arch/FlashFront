import { DEFAULT_HOTKEYS, DEFAULT_RESERVE_FLOOR, SNOOZE_HOTKEY, isPracticeGoal, normalizeHotkey, validHotkey, type PracticeGoal, type GameSnapshot, type RawExtract, type RecordedMatch } from "@flashfront/core";
import type { MatchListItem } from "./main/recorder";
import type { ApiResult } from "./main/api";
import type { CdpStatus } from "@flashfront/cdp";
import { isThemeId, type ThemeId, type PresetId } from "@flashfront/core";
export const HUD_PRESETS = ["custom", "minimal", "learning", "economy"] as const;
export type HudPreset = typeof HUD_PRESETS[number];
export const TEXT_SIZES = ["compact", "comfortable"] as const;
export type TextSize = typeof TEXT_SIZES[number];
export const OBS_DELAYS = [0, 30, 60, 120] as const;
export type ObsDelay = typeof OBS_DELAYS[number];
/**
 * setupDone: the first-run setup wizard was finished or skipped (missing in older settings files).
 * 0.2.0 fields default when missing: snoozeHotkey, bookmarkHotkey, spawnChime, ownSpawnHistory, hudPreset,
 * textSize, obsDelaySec, obsHideOwnNumbers, shareShowName.
 * 0.2.1: lastSeenVersion is the launcher version whose What's new was last dismissed (missing before 0.2.1).
 */
export interface Settings {
  theme: ThemeId; port: number; toggleHotkey: string; editHotkey: string; startHidden: boolean; ranked: boolean; publicId?: string;
  reserveFloor: number; practiceGoal?: PracticeGoal; setupDone: boolean;
  snoozeHotkey: string; bookmarkHotkey: string; spawnChime: boolean; ownSpawnHistory: boolean; hudPreset: HudPreset; textSize: TextSize;
  obsDelaySec: ObsDelay; obsHideOwnNumbers: boolean; shareShowName: boolean; lastSeenVersion?: string;
}
export const DEFAULT_SETTINGS: Settings = {
  theme: "abyss", port: 9222, toggleHotkey: DEFAULT_HOTKEYS.toggle, editHotkey: DEFAULT_HOTKEYS.edit, startHidden: false, ranked: true,
  reserveFloor: DEFAULT_RESERVE_FLOOR, setupDone: false,
  snoozeHotkey: SNOOZE_HOTKEY, bookmarkHotkey: "Ctrl+Alt+M", spawnChime: true, ownSpawnHistory: false, hudPreset: "custom", textSize: "compact",
  obsDelaySec: 0, obsHideOwnNumbers: false, shareShowName: true,
};
const optionalBoolean = (value: unknown, fallback: boolean, name: string) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`Invalid ${name} setting.`);
  return value;
};
const oneOf = <T,>(list: readonly T[], value: unknown, fallback: T, message: string): T => {
  if (value === undefined) return fallback;
  if (!list.includes(value as T)) throw new Error(message);
  return value as T;
};
/** Launcher versions as electron-builder writes them: 0.2.1, 1.0.0-beta.2. */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
/** GitHub release page for a launcher version (What's new "Full notes"). */
export function releaseNotesUrl(version: unknown): string {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new Error("Invalid version");
  return `https://github.com/destoryer10/FlashFront/releases/tag/v${version}`;
}
export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("Invalid settings");
  const s = value as Settings;
  const theme = s.theme === undefined ? "abyss" : s.theme;
  if (!isThemeId(theme)) throw new Error("Choose a listed theme.");
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535 || s.port === 47474
    || typeof s.toggleHotkey !== "string" || !validHotkey(s.toggleHotkey)
    || typeof s.editHotkey !== "string" || !validHotkey(s.editHotkey)
    || normalizeHotkey(s.toggleHotkey) === normalizeHotkey(s.editHotkey)
    || typeof s.startHidden !== "boolean" || typeof s.ranked !== "boolean") throw new Error("Use a valid port and two different Ctrl/Alt/Shift/Meta shortcuts. F8 is reserved.");
  if (s.publicId !== undefined && s.publicId !== "" && (typeof s.publicId !== "string" || !/^[A-Za-z0-9]{8}$/.test(s.publicId))) throw new Error("Use 8 letters or numbers for the public ID.");
  const reserveFloor = s.reserveFloor ?? DEFAULT_RESERVE_FLOOR;
  if (!Number.isInteger(reserveFloor) || reserveFloor < 20 || reserveFloor > 60) throw new Error("Choose a reserve floor from 20% to 60%.");
  if (s.practiceGoal !== undefined && !isPracticeGoal(s.practiceGoal)) throw new Error("Choose a listed practice goal.");
  const bookmarkHotkey = s.bookmarkHotkey ?? DEFAULT_SETTINGS.bookmarkHotkey;
  const snoozeHotkey = s.snoozeHotkey === undefined ? DEFAULT_SETTINGS.snoozeHotkey : s.snoozeHotkey;
  if (typeof snoozeHotkey !== "string" || !validHotkey(snoozeHotkey)
    || [s.toggleHotkey, s.editHotkey].some(key => normalizeHotkey(key) === normalizeHotkey(snoozeHotkey))) throw new Error("Choose a snooze shortcut different from the HUD, edit and bookmark shortcuts.");
  if (typeof bookmarkHotkey !== "string" || !validHotkey(bookmarkHotkey)
    || [s.toggleHotkey, s.editHotkey, snoozeHotkey].some(key => normalizeHotkey(key) === normalizeHotkey(bookmarkHotkey))) throw new Error("Choose a bookmark shortcut different from the HUD, edit and snooze shortcuts.");
  if (s.lastSeenVersion !== undefined && (typeof s.lastSeenVersion !== "string" || !VERSION_PATTERN.test(s.lastSeenVersion))) throw new Error("Invalid last-seen version.");
  return { theme, port: s.port, toggleHotkey: s.toggleHotkey, editHotkey: s.editHotkey, startHidden: s.startHidden, ranked: s.ranked, reserveFloor, setupDone: s.setupDone === true,
    snoozeHotkey, bookmarkHotkey, spawnChime: optionalBoolean(s.spawnChime, true, "spawn chime"), ownSpawnHistory: optionalBoolean(s.ownSpawnHistory, false, "spawn history"),
    hudPreset: oneOf(HUD_PRESETS, s.hudPreset, "custom", "Choose a listed HUD preset."), textSize: oneOf(TEXT_SIZES, s.textSize, "compact", "Choose a listed text size."),
    obsDelaySec: oneOf(OBS_DELAYS, s.obsDelaySec, 0, "Choose a stream delay of 0, 30, 60 or 120 seconds."),
    obsHideOwnNumbers: optionalBoolean(s.obsHideOwnNumbers, false, "stream privacy"), shareShowName: optionalBoolean(s.shareShowName, true, "share card name"),
    ...(s.practiceGoal ? { practiceGoal: s.practiceGoal } : {}), ...(s.publicId ? { publicId: s.publicId } : {}),
    ...(s.lastSeenVersion ? { lastSeenVersion: s.lastSeenVersion } : {}) };
}
export interface LauncherState {
  health?: import("./main/health").FeatureHealth;
  feedbackAvailable: boolean;
  snoozeSignal?: number;
  status: CdpStatus; settings: Settings; snapshot: GameSnapshot | null; raw: (RawExtract & { me?: NonNullable<RawExtract["me"]> & { team?: string; teamColor?: string } }) | null;
  overlayViewport?: OverlayViewport;
  version?: string; editing: boolean; hudEnabled: boolean; launching: boolean; setupNeeded: boolean; errors: string[];
  /** 0.2.0: Space held during the spawn phase (undefined when the key cannot be read). */
  spawnHeatHeld?: boolean;
  /** 0.2.0: auto-update state; ready once the new version is downloaded. */
  update?: { version: string; notes: string; ready: boolean };
  /** 0.2.1: the running FlashFront launcher version (app.getVersion()), for What's new. */
  appVersion?: string;
}
export interface LauncherApi {
  subscribeCamera?(cb: (camera: import("@flashfront/core").SpawnCamera) => void): () => void;
  onSurfaceActive?(cb: (active: boolean) => void): () => void;
  onViewport?(cb: (viewport: OverlayViewport | undefined) => void): () => void;
  getState(): Promise<LauncherState>;
  subscribe(cb: (state: LauncherState) => void): () => void;
  launch(): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  copySetup(): Promise<void>;
  restartToUpdate(): Promise<void>;
  suggestIdea(): Promise<void>;
  previewSupportReport(): Promise<string>;
  copySupportReport(): Promise<void>;
  /** 0.2.1: opens this version's GitHub release notes in the browser. */
  openReleaseNotes(version: string): Promise<void>;
  reportDecision(gameId: string | undefined, tick: number, decision: import("@flashfront/core").Decision | undefined): void;
  copyPreset(id: PresetId): Promise<void>;
  toggleHud(): Promise<void>;
  toggleEdit(): Promise<void>;
  listMatches(): Promise<MatchListItem[]>;
  getMatch(file: string): Promise<RecordedMatch>;
  deleteMatch(file: string): Promise<void>;
  showMatch(file?: string): Promise<void>;
  onMatchesChanged(cb: () => void): () => void;
  annotateMatch(file: string, t: number, note: string): Promise<RecordedMatch>;
  saveShare(png: string): Promise<boolean>;
  reportShape(rects: ShapeRect[]): void;
  stats(path: string): Promise<ApiResult>;
}
export const launchOption = (port: number) => `%command% --remote-debugging-port=${port}`;
/** The fields the Settings tab form edits; Save applies only these over the latest saved settings. */
export const SETTINGS_FORM_FIELDS = ["toggleHotkey", "editHotkey", "snoozeHotkey", "bookmarkHotkey", "reserveFloor", "startHidden", "spawnChime", "practiceGoal", "port"] as const satisfies readonly (keyof Settings)[];
/** Only fields the player changed since editing began (`editStart`) are applied, so a value set elsewhere meanwhile is kept. */
export function mergeSettingsForm(latest: Settings, draft: Settings, editStart: Settings = latest): Settings {
  const next: Settings = { ...latest };
  for (const key of SETTINGS_FORM_FIELDS) {
    if (draft[key] === editStart[key]) continue;
    if (draft[key] === undefined) delete next[key];
    else Object.assign(next, { [key]: draft[key] });
  }
  return next;
}
/**
 * Ranked matches, replays and spectating, from game data only. Fair play: no setting can show the HUD
 * there (the old `ranked` setting is still parsed so older settings files load, but nothing reads it).
 */
/** HUD editing needs a live match that isn't restricted. */
export function editBlocked(state: Parameters<typeof restrictedMatch>[0]): boolean {
  return !state.raw?.inGame || restrictedMatch(state);
}
export function restrictedMatch(state: { raw?: RawExtract | null; snapshot?: { mode?: string; observer?: string } | null }): boolean {
  const game = state.raw?.game;
  return !!game?.rankedType || game?.type === "Ranked" || !!state.raw?.replay || state.snapshot?.mode === "Ranked" || !!state.snapshot?.observer;
}
/** True for the OpenFront executable (any of its windows: the game page or the Steam-overlay helper). */
export function isGameProcess(exePath: string | undefined): boolean {
  if (!exePath) return false;
  const name = exePath.split(/[\\/]/).pop()!.toLowerCase();
  return name === "openfront.exe" || name === "openfront";
}
/** gameForeground: OS-level "an OpenFront window is in front" (null when unknown: falls back to page focus). */
export function overlayVisible(state: Pick<LauncherState, "raw" | "editing" | "hudEnabled" | "settings"> & { snapshot?: { mode?: string; observer?: string } | null }, minimized: boolean, hasBounds: boolean, gameForeground: boolean | null = null): boolean {
  const focused = gameForeground ?? !!state.raw?.visible;
  return hasBounds && !minimized && state.hudEnabled && !restrictedMatch(state) && !!state.raw?.inGame && (focused || state.editing);
}
export interface ShapeRect { x: number; y: number; width: number; height: number }
/**
 * Window shape for the overlay: the visible panel rectangles (2 px padding, integers, clamped to the
 * window), or the whole window while editing so panels can be dragged anywhere.
 */
export function overlayShape(panels: ShapeRect[], size: { width: number; height: number }, editing: boolean): ShapeRect[] {
  if (editing) return [{ x: 0, y: 0, width: size.width, height: size.height }];
  const pad = 2;
  return panels.flatMap(r => {
    if (!(r.width > 0 && r.height > 0)) return [];
    const x = Math.max(0, Math.floor(r.x - pad)); const y = Math.max(0, Math.floor(r.y - pad));
    const right = Math.min(size.width, Math.ceil(r.x + r.width + pad)); const bottom = Math.min(size.height, Math.ceil(r.y + r.height + pad));
    return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
  });
}
export interface OverlayViewport { offsetX: number; offsetY: number; width: number; height: number }
/**
 * Where the overlay window goes: the bounding box of the visible panels (padded), clipped to the
 * panels, with the page offset so panels keep their game-relative positions. Never the whole game
 * window: Chromium stops painting windows it thinks are fully covered (it checks rectangles, not
 * shapes). Editing and active spawn heat use the game area minus one pixel row.
 */
export function overlayPlacement(panels: ShapeRect[], game: ShapeRect, editing: boolean, spawnHeat = false):
  { bounds: ShapeRect; shape: ShapeRect[]; viewport: OverlayViewport } | null {
  const size = { width: game.width, height: game.height };
  let box: ShapeRect; let rects: ShapeRect[];
  if (editing || spawnHeat) { box = { x: 0, y: 0, width: game.width, height: Math.max(1, game.height - 1) }; rects = [box]; }
  else {
    rects = overlayShape(panels, size, false);
    if (!rects.length) return null;
    const left = Math.min(...rects.map(r => r.x)), top = Math.min(...rects.map(r => r.y));
    const right = Math.max(...rects.map(r => r.x + r.width)), bottom = Math.max(...rects.map(r => r.y + r.height));
    box = { x: left, y: top, width: right - left, height: bottom - top };
    if (box.width >= game.width && box.height >= game.height) box = { ...box, height: game.height - 1 };
  }
  return {
    bounds: { x: game.x + box.x, y: game.y + box.y, width: box.width, height: box.height },
    shape: rects.map(r => ({ x: r.x - box.x, y: r.y - box.y, width: r.width, height: Math.min(r.height, box.height - (r.y - box.y)) })),
    viewport: { offsetX: box.x, offsetY: box.y, width: game.width, height: game.height },
  };
}
