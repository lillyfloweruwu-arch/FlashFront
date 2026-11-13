import { DEFAULT_HOTKEYS, DEFAULT_RESERVE_FLOOR, SNOOZE_HOTKEY, isPracticeGoal, normalizeHotkey, validHotkey, type PracticeGoal, type GameSnapshot, type RawExtract, type RecordedMatch, type GameReview } from "@flashfront/core";
import type { MatchListItem } from "./main/recorder";
import type { DrillClientData } from "../../../packages/training-engine/src/drill-client-data";
import type { EngineFailure } from "@flashfront/training-engine/contracts";
/** Structured-clone payload supplied by the dedicated Training preload. */
export type TrainingLoad =
  | { status: "ready"; data: DrillClientData; snapshot: Uint8Array; lite: boolean; reducedMotion: boolean; names: "generated" | "record" }
  | { status: "unavailable"; reason: EngineFailure | "bootFailed" };
export type TrainingOutcome = { kind: "passed"; verdict: "Great" | "Good" } | { kind: "failed" } | { kind: "left" }
  | { kind: "error"; reason: EngineFailure | "bootFailed" };
export interface TrainingBridgeApi {
  load(): Promise<TrainingLoad>;
  ready(): void;
  report(outcome: TrainingOutcome): void;
  close(): void;
}
import type { MistakeType } from "@flashfront/core";
export type TrainingRequest = { kind: "retry"; file: string; tick: number; mistake: MistakeType } | { kind: "prepared"; drillId: string };
export interface TodaysDrillInfo { drillId: string; title: string; durationSec: 120; mistake: MistakeType; reason?: string; week?: boolean[]; weakest?: MistakeType }
export type LauncherDestination = { screen: "review"; file: string } | { screen: "training"; request: TrainingRequest };
import type { ApiResult } from "./main/api";
import type { CdpStatus } from "@flashfront/cdp";
import { isThemeId, type ThemeId, type PresetId } from "@flashfront/core";
export const HUD_PRESETS = ["custom", "minimal", "learning", "economy"] as const;
export type HudPreset = typeof HUD_PRESETS[number];
export const TEXT_SIZES = ["compact", "comfortable"] as const;
export type TextSize = typeof TEXT_SIZES[number];
export const OBS_DELAYS = [0, 30, 60, 120] as const;
export type ObsDelay = typeof OBS_DELAYS[number];
export const LITE_MODES = ["auto", "on", "off"] as const;
export type LiteMode = typeof LITE_MODES[number];
export const VISUAL_EFFECTS = ["full", "lite"] as const;
export type VisualEffects = typeof VISUAL_EFFECTS[number];
export interface Hardware { cpus: number; totalMemBytes: number }
// Reported memory on an 8 GB PC can be below 8 GiB; leave room for that overhead.
export const WEAK_PC = { maxCpus: 4, minMemBytes: 7 * 2 ** 30 };
export function weakPc(hw: Hardware): boolean {
  return (hw.cpus > 0 && hw.cpus <= WEAK_PC.maxCpus) || (hw.totalMemBytes > 0 && hw.totalMemBytes < WEAK_PC.minMemBytes);
}
export function resolveLite(mode: LiteMode, hw: Hardware): boolean {
  return mode === "auto" ? weakPc(hw) : mode === "on";
}
/**
 * setupDone: the first-run setup wizard was finished or skipped (missing in older settings files).
 * 0.2.0 fields default when missing: snoozeHotkey, bookmarkHotkey, spawnChime, ownSpawnHistory, hudPreset,
 * textSize, obsDelaySec, obsHideOwnNumbers, shareShowName.
 * 0.2.1: lastSeenVersion is the launcher version whose What's new was last dismissed (missing before 0.2.1).
 * 0.3.0: liteMode defaults to auto when missing.
 */
export interface Settings {
  theme: ThemeId; port: number; toggleHotkey: string; editHotkey: string; startHidden: boolean; ranked: boolean; publicId?: string;
  reserveFloor: number; practiceGoal?: PracticeGoal; setupDone: boolean;
  snoozeHotkey: string; bookmarkHotkey: string; spawnChime: boolean; ownSpawnHistory: boolean; hudPreset: HudPreset; textSize: TextSize;
  obsDelaySec: ObsDelay; obsHideOwnNumbers: boolean; shareShowName: boolean; lastSeenVersion?: string;
  liteMode: LiteMode;
  visualEffects: VisualEffects;
  /** 0.3.0: coach nudges next to the cursor. */
  nudges: boolean;
  /** 0.3.0: the Stream studio's saved widget layout (missing until first saved; see DEFAULT_STREAM_LAYOUT). */
  streamLayout?: StreamLayout;
}
export const STREAM_WIDGETS = ["card", "stats", "top", "result"] as const;
export const STREAM_ANCHORS = ["tl", "tr", "bl", "br"] as const;
export interface StreamLayout { widgets: (typeof STREAM_WIDGETS)[number][]; scale: number; anchor: (typeof STREAM_ANCHORS)[number] }
export const DEFAULT_STREAM_LAYOUT: StreamLayout = { widgets: [...STREAM_WIDGETS], scale: 1, anchor: "tl" };
/** Saved layouts from before 0.3.0 may name the removed Lobby widget; it is dropped, anything else unknown is invalid. */
export function parseStreamLayout(value: unknown): StreamLayout | undefined {
  if (value === undefined) return undefined;
  const v = value as Partial<Record<keyof StreamLayout, unknown>>;
  if (!v || typeof v !== "object" || !Array.isArray(v.widgets) || typeof v.scale !== "number" || !Number.isFinite(v.scale) || v.scale < 0.25 || v.scale > 3
    || !STREAM_ANCHORS.includes(v.anchor as StreamLayout["anchor"])) throw new Error("Choose stream widgets, a scale from 25% to 300% and a corner.");
  const widgets = v.widgets.filter(w => w !== "lobby");
  if (!widgets.every(w => STREAM_WIDGETS.includes(w as StreamLayout["widgets"][number]))) throw new Error("Choose listed stream widgets.");
  return { widgets: STREAM_WIDGETS.filter(w => widgets.includes(w)), scale: v.scale, anchor: v.anchor as StreamLayout["anchor"] };
}
export const DEFAULT_SETTINGS: Settings = {
  theme: "abyss", port: 9222, toggleHotkey: DEFAULT_HOTKEYS.toggle, editHotkey: DEFAULT_HOTKEYS.edit, startHidden: false, ranked: true,
  reserveFloor: DEFAULT_RESERVE_FLOOR, setupDone: false,
  snoozeHotkey: SNOOZE_HOTKEY, bookmarkHotkey: "Ctrl+Alt+M", spawnChime: true, ownSpawnHistory: false, hudPreset: "custom", textSize: "compact",
  liteMode: "auto", visualEffects: "full",
  obsDelaySec: 0, obsHideOwnNumbers: false, shareShowName: true, nudges: true,
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
  return `https://github.com/lillyfloweruwu-arch/FlashFront/releases/tag/v${version}`;
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
    liteMode: oneOf(LITE_MODES, s.liteMode, "auto", "Choose Auto, On or Off for Lite mode."),
    visualEffects: oneOf(VISUAL_EFFECTS, s.visualEffects, "full", "Choose Full or Lite for visual effects."),
    nudges: optionalBoolean(s.nudges, true, "nudges"),
    ...(s.streamLayout !== undefined ? { streamLayout: parseStreamLayout(s.streamLayout) } : {}),
    ...(s.practiceGoal ? { practiceGoal: s.practiceGoal } : {}), ...(s.publicId ? { publicId: s.publicId } : {}),
    ...(s.lastSeenVersion ? { lastSeenVersion: s.lastSeenVersion } : {}) };
}
export interface LauncherState {
  /** Effective Lite mode and the hardware hint used by Auto. */
  lite?: boolean;
  weakPc?: boolean;
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
export type ReviewResult = { status: "ready"; review: GameReview } | { status: "waiting" }
  | { status: "unavailable"; reason: "noGameId" | "notArchived" | "invalid" | "tooLarge" | "notInRecord" };
/** The end card's whole view: the saved recording (buttons stay disabled until it exists) and its review state. */
export interface EndReviewModel { file?: string; result: ReviewResult }
export type EndReviewView = EndReviewModel & { theme: import("@flashfront/core").ThemeId; lite: boolean };
export interface LauncherApi {
  openReviewBoard(file: string, bounds: import("./review-types").ReviewBounds): Promise<void>;
  seekReviewBoard(tick: number): Promise<void>;
  resizeReviewBoard(bounds: import("./review-types").ReviewBounds): Promise<void>;
  closeReviewBoard(): Promise<void>;
  onReviewBoardStatus(cb: (status: import("./review-types").ReviewBoardStatus) => void): () => void;
  onReviewBoardStep(cb: (direction: -1 | 1) => void): () => void;
  startTraining(request: TrainingRequest): Promise<void>;
  onTrainingEnded(cb: (request: TrainingRequest, outcome: TrainingOutcome) => void): () => void;
  subscribeCamera?(cb: (camera: import("@flashfront/core").SpawnCamera) => void): () => void;
  onSurfaceActive?(cb: (active: boolean) => void): () => void;
  onViewport?(cb: (viewport: OverlayViewport | undefined) => void): () => void;
  /** 0.3.0: the cursor-tag window's page only. `null` fades the tag out. */
  onNudge?(cb: (view: NudgeView | null) => void): () => void;
  /** 0.3.0: the end-card window's page only. `null` clears the card. */
  onEndReview?(cb: (view: EndReviewView | null) => void): () => void;
  endReviewAction?(kind: "full" | "retry"): Promise<void>;
  reportEndReviewHeight?(height: number): void;
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
  /** 0.3.0: the Game Review for a recording, from its cached public record. */
  getReview(file: string): Promise<ReviewResult>;
  deleteMatch(file: string): Promise<void>;
  showMatch(file?: string): Promise<void>;
  showTraining(request: TrainingRequest): Promise<void>;
  /** 0.3.0 F: today's prepared drill from the saved pick, or nothing. Never recomputes reviews. */
  getDrillProgress(): Promise<Readonly<Record<string, "passed" | "tryAgain">> | undefined>;
  openTrainingLog(): Promise<void>;
  getTodaysDrill(): Promise<TodaysDrillInfo | undefined>;
  /** 0.3.0 F: marks a picked drill complete after a judged attempt. */
  completeDrill(drillId: string): Promise<void>;
  /** 0.3.0 F: the player opened a drill on purpose (a coach example). */
  recordDrillVisit(drillId: string): Promise<void>;
  /** 0.3.0 Training only: a local recording's public record, checked against the recording's owner. */
  loadTrainingRecord(file: string, retry?: { tick: number; mistake: MistakeType }): Promise<import("@flashfront/training-engine/contracts").EngineResult<{ record: unknown; ownClientId: string }>>;
  /** 0.3.0 Training only: one map's files for one game size, unpacked on first use. */
  loadTrainingMap(mapId: string, mapSize: "Normal" | "Compact"): Promise<import("@flashfront/training-engine/contracts").EngineResult<import("@flashfront/training-engine/protocol").MapBytes>>;
  onNavigate(cb: (destination: LauncherDestination) => void): () => void;
  onMatchesChanged(cb: () => void): () => void;
  annotateMatch(file: string, t: number, note: string): Promise<RecordedMatch>;
  saveShare(png: string): Promise<boolean>;
  reportShape(rects: ShapeRect[]): void;
  stats(path: string): Promise<ApiResult>;
}
export const launchOption = (port: number) => `%command% --remote-debugging-port=${port}`;
/** The fields the Settings tab form edits; Save applies only these over the latest saved settings. */
export const SETTINGS_FORM_FIELDS = ["toggleHotkey", "editHotkey", "snoozeHotkey", "bookmarkHotkey", "reserveFloor", "startHidden", "spawnChime", "practiceGoal", "port", "liteMode", "visualEffects", "nudges"] as const satisfies readonly (keyof Settings)[];
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
/** Nudges show only where the HUD shows, and only while every read they use is verified. */
export function nudgesAllowed(state: Pick<LauncherState, "settings" | "raw" | "health" | "editing" | "hudEnabled"> & { snapshot?: { mode?: string; observer?: string } | null }, overlayShown: boolean): boolean {
  const h = state.health;
  return state.settings.nudges && state.hudEnabled && !state.editing && !restrictedMatch(state) && overlayShown
    && !!h && h.growth === "verified" && h.attack === "verified" && h.build === "verified" && h.alliances === "verified";
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
/** Linux Wayland gives no reliable global cursor point, so the tag parks instead of following. */
export function cursorTrackable(platform: string, env: Record<string, string | undefined>): boolean {
  return !(platform === "linux" && env.XDG_SESSION_TYPE?.toLowerCase() === "wayland");
}
/** 0.3.0 cursor tag: which corner of the tag window sits nearest the cursor. */
export type NudgeAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export interface NudgeView { id?: number; text: string; urgent: boolean; anchor: NudgeAnchor; theme: ThemeId; /** Sub-plan G's Lite mode: no fade or pulse. */ lite?: boolean }
export const NUDGE_WINDOW = { width: 340, height: 88, offset: 24 } as const;
/**
 * Where the tag window goes (DIP). Inside the game it sits below-right of the cursor and flips left or
 * up at the edges, so it never covers the click point. With the cursor off the game (another monitor,
 * the launcher in front, an unreliable Wayland point) it parks bottom centre, above OpenFront's controls.
 */
export function nudgeBounds(cursor: { x: number; y: number } | null, game: ShapeRect): { bounds: ShapeRect; anchor: NudgeAnchor } {
  const { width, height, offset } = NUDGE_WINDOW;
  const right = game.x + game.width, bottom = game.y + game.height;
  const inside = !!cursor && cursor.x >= game.x && cursor.x <= right && cursor.y >= game.y && cursor.y <= bottom;
  if (!cursor || !inside) return { anchor: "center", bounds: { x: game.x + Math.round((game.width - width) / 2), y: game.y + Math.round(game.height * 0.86) - height, width, height } };
  const flipX = cursor.x + offset + width > right, flipY = cursor.y + offset + height > bottom;
  const x = flipX ? cursor.x - offset - width : cursor.x + offset;
  const y = flipY ? cursor.y - offset - height : cursor.y + offset;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  return {
    anchor: `${flipY ? "bottom" : "top"}-${flipX ? "right" : "left"}`,
    bounds: { x: clamp(x, game.x, right - width), y: clamp(y, game.y, bottom - height), width, height },
  };
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


