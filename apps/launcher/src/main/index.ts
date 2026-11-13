import { app, BrowserWindow, WebContentsView, clipboard, dialog, globalShortcut, ipcMain, nativeImage, protocol, screen, session, shell, systemPreferences } from "electron";
import { readFile, writeFile, appendFile, mkdir, rename, unlink, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CdpDataSource, discover } from "@flashfront/cdp";
import { InsightFeed, MatchRecorder, MAX_MATCH_BYTES, NudgeEngine, gameReview, parseGameRecord, presetJson, spawnHeatActive, type RecordedMatch, type PlayerProfile } from "@flashfront/core";
import { THEMES, type ThemeId } from "@flashfront/ui/themes";
import { cursorTrackable, DEFAULT_SETTINGS, isGameProcess, type ReviewResult, launchOption, NUDGE_WINDOW, nudgesAllowed, overlayPlacement, overlayVisible, releaseNotesUrl, restrictedMatch, type NudgeView, type ShapeRect, parseSettings, resolveLite, weakPc } from "../shared";
import { readHardware } from "./hardware";
import { NudgeSurface } from "./nudge-window";
import { EndReviewSurface } from "./end-review";
import { surfaceState } from "./surfaces";
import { startObs } from "./obs";
import { MatchFiles } from "./recorder";
import type { LauncherDestination } from "../shared";

/** Main owns routing validation; delivery waits for the React listener, not just page load. */
export function createReviewNavigation(files: Pick<MatchFiles, "path">, send: (destination: LauncherDestination) => void, focus: () => void) {
  let ready = false; let pending: LauncherDestination | undefined;
  return {
    reset() { ready = false; },
    ready() { ready = true; if (pending) { const next = pending; pending = undefined; send(next); } },
    async navigate(authorized: boolean, input: unknown) {
      if (!authorized) throw new Error("Unauthorized navigation");
      const d = input as LauncherDestination;
      if (!d || (d.screen !== "review" && d.screen !== "training")) throw new Error("Invalid destination");
      if (d.screen === "review") files.path(d.file);
      else {
        const r = d.request;
        if (!r) throw new Error("Invalid Training request");
        if (r.kind === "retry") {
          files.path(r.file);
          if (!Number.isSafeInteger(r.tick) || r.tick < 0 || !["allyDecision", "postsBeforePush", "sendSize"].includes(r.mistake)) throw new Error("Invalid retry");
        } else if (r.kind !== "prepared" || typeof r.drillId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.drillId)) throw new Error("Invalid drill");
      }
      pending = d; focus(); if (ready) { pending = undefined; send(d); }
    },
  };
}
import { StatsApi, PublicIdResolver, validGameId } from "./api";
import { GameRecordCache } from "./gameRecords";
import { loadTrainingMap, loadTrainingRecord, type TrainingDeps } from "./training";
import { TrainingWindow, trainingNetworkAllowed, wireTrainingIpc } from "./training-window";
import { createRecordDrillBuilder } from "./record-drill";
import { RecordDrillRunner } from "./record-drill-runner";
import { ReviewBoardController, wireReviewBoardIpc } from "./review-board";
import { ReviewRunner } from "./review-runner";
import { sourceMap } from "@flashfront/training-engine/protocol";
import { DrillRefresher, DrillStore, refreshDrillReviews } from "./drills";
import type { MistakeType } from "@flashfront/core";
import { profileFromApi } from "../stats";
import { LiveStats } from "./liveStats";
import { createForegroundProbe } from "./foreground";
import { startUpdater } from "./updater";
import { SpawnAlerts, spawnAlert } from "./alerts";
import { createKeyProbe, watchSpawnKey } from "./keys";
import { featureHealth, type PlatformState } from "./health";
import { FEEDBACK_URL, supportReport } from "./support";

const here = dirname(fileURLToPath(import.meta.url));
const trainingTest = !app.isPackaged && process.env.FLASHFRONT_TRAINING_TEST === "1";
const smoke = process.env.FLASHFRONT_SMOKE_TEST === "1" || trainingTest;
let launcher: BrowserWindow;
let trainingWindow: TrainingWindow | undefined;
let reviewBoard: ReviewBoardController | undefined;
let overlay: BrowserWindow;
/** 0.3.0: the coach cursor tag, its own tiny click-through window. */
let nudgeWindow: BrowserWindow | undefined;
let nudgeSurface: NudgeSurface | undefined;
/** 0.3.0: the compact Game Review card under OpenFront's end dialog. */
let endWindow: BrowserWindow | undefined;
let endReview: EndReviewSurface | undefined;
const nudgeEngine = new NudgeEngine();
let source: CdpDataSource;
let obs: Awaited<ReturnType<typeof startObs>> | undefined;
let boundsTimer: ReturnType<typeof setInterval>;
// OpenFront (Steam) keeps a second "OpenFront" helper window in front, so the page's hasFocus() is
// false while playing. Ask the OS which process owns the foreground window instead.
const foregroundProbe = createForegroundProbe();
let gameForeground: boolean | null = null;
let foregroundTimer: ReturnType<typeof setInterval>;
let foregroundWindow: unknown;
// Panel rectangles reported by the overlay page; the transparent overlay window is sized to their box,
// with solid unblurred panels, so the rest of the screen is the game (no full-screen composition).
let panelRects: ShapeRect[] = [];

let gameRect: ShapeRect | null = null;
let lastBounds = "";
type Placement = NonNullable<ReturnType<typeof overlayPlacement>>;
function placement(): Placement | null { return gameRect ? overlayPlacement(panelRects, gameRect, state.editing, state.raw?.inSpawnPhase === true && state.spawnHeatHeld !== false && state.health?.spawnHeat === "verified" && spawnHeatActive(state.snapshot)) : null; }
function applyPlacement(p: Placement): void {
  const boundsKey = JSON.stringify(p.bounds);
  if (boundsKey !== lastBounds) { overlay.setBounds(p.bounds); lastBounds = boundsKey; }
  // No setShape/SetWindowRgn: on Windows + Electron 44 a clipped window still paints #202020 outside
  // the clip (measured 2026-10-17). The window is transparent instead, sized to the panels' box.
}
let minimized = false;
let hasBounds = false;
let readingBounds = false;
let stopping = false;
const recorder = new MatchRecorder();
// Field Reports: insights from the player's own numbers that the game's own feed does not show.
let insights = new InsightFeed();
const liveStats = new LiveStats();
const statsApi = new StatsApi(smoke ? async () => new Response("{}", { status: 503 }) : fetch);
let matchFiles: MatchFiles;
let gameRecords: GameRecordCache;
let resolver: PublicIdResolver;
let recordTimer: ReturnType<typeof setInterval>;
let profile: PlayerProfile | undefined;
let profileRequest = 0;
let nextProfileRefresh = 0;
let settingsQueue: Promise<unknown> = Promise.resolve();
let state: PlatformState = { feedbackAvailable: FEEDBACK_URL !== "", status: "searching", settings: { ...DEFAULT_SETTINGS }, snapshot: null, raw: null, editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };
let updater: ReturnType<typeof startUpdater> | undefined;
let restarting = false;
let supportPreview: string | undefined;
const spawnAlerts = new SpawnAlerts(() => { if (!smoke) spawnAlert(launcher, { chime: state.settings.spawnChime }); });
const spawnKey = watchSpawnKey(createKeyProbe(), held => { state.spawnHeatHeld = held; publish(); });
const settingsPath = () => join(app.getPath("userData"), "settings.json");
const hardware = readHardware();
function applyLite(): void {
  state.weakPc = weakPc(hardware);
  state.lite = resolveLite(state.settings.liteMode, hardware);
  source?.setLite(state.lite);
}
const devUrl = process.env.ELECTRON_RENDERER_URL;

/** Window-control colors matching the launcher top bar (48 px, theme surface). */
function titleBarColors(theme: ThemeId) {
  const tokens = THEMES[theme].tokens;
  return { color: tokens["--ff-surface"]!, symbolColor: tokens["--ff-fg"]!, height: 48 };
}
function saveSettingsFile() {
  const data = JSON.stringify(state.settings, null, 2);
  const operation = settingsQueue.then(async () => { await mkdir(dirname(settingsPath()), { recursive: true }); await writeFile(settingsPath(), data, "utf8"); });
  settingsQueue = operation.catch(() => {}); return operation;
}
async function refreshProfile() {
  nextProfileRefresh = Date.now() + 300_000;
  const generation = ++profileRequest; const id = state.settings.publicId;
  profile = undefined; publishObs();
  if (!id) return;
  const player = await statsApi.get(`/api/player/${id}`);
  if (generation !== profileRequest || player.status !== 200) return;
  profile = profileFromApi(id, player.body); publishObs();
  const boards = await Promise.all([1, 2].map(page => statsApi.get(`/api/leaderboard/ranked?page=${page}`)));
  if (generation !== profileRequest) return;
  profile = profileFromApi(id, player.body, boards.filter(b => b.status === 200).map(b => b.body)); publishObs();
}
let observing = false;
function publishObs() { if (observing) return; obs?.publish({ snapshot: state.snapshot, me: state.raw?.me, profile, theme: state.settings.theme, ...liveStats.frame() }, state.settings); }
let reviewQueue: Promise<unknown> = Promise.resolve();
function queueReview<T>(operation: () => Promise<T>): Promise<T> {
  const next = reviewQueue.then(operation); reviewQueue = next.catch(() => {}); return next;
}
let refreshDrills: () => Promise<void> = async () => {};
let refreshDrillsLater: () => void = () => {};
function matchesChanged() { if (launcher && !launcher.isDestroyed()) launcher.webContents.send("matches-changed"); void refreshDrills().catch(() => {}); refreshDrillsLater(); }
export function deleteRecordedMatch(files: MatchFiles, records: Pick<GameRecordCache, "forget">, file: string): Promise<void> {
  return queueReview(async () => {
    const { gameId } = await files.get(file);
    await files.delete(file);
    if (validGameId(gameId) && !(await files.list()).some(m => m.gameId === gameId)) await records.forget(gameId);
  });
}
const reviews = new Map<string, ReviewResult>();
/** Reads the recording and the cached public record only; neither file is written. Fetching stays outside the save queue. */
export async function reviewRecordedMatch(files: MatchFiles, records: Pick<GameRecordCache, "ensure" | "read">, file: string, reserveFloorPct: number,
  inMatch: () => boolean = () => state.raw?.inGame === true): Promise<ReviewResult> {
  if (inMatch()) return { status: "waiting" };
  const match = await files.get(file);
  const key = `${file}
${(await lstat(files.path(file))).mtimeMs}
${reserveFloorPct}`;
  if (inMatch()) return { status: "waiting" };
  const memo = reviews.get(key); if (memo) return memo;
  if (!validGameId(match.gameId)) return { status: "unavailable", reason: "noGameId" };
  const status = await records.ensure(match.gameId);
  if (inMatch()) return { status: "waiting" };
  if (status.status !== "ready") return status;
  const result = await queueReview(async (): Promise<ReviewResult> => {
    if (inMatch()) return { status: "waiting" };
    const body = await records.read(match.gameId!);
    if (inMatch()) return { status: "waiting" };
    const record = parseGameRecord(body);
    if (!record || record.gameId !== match.gameId) return { status: "unavailable", reason: "invalid" };
    try { return { status: "ready", review: gameReview(record, match, { reserveFloorPct }) }; }
    catch (e) { if (e instanceof Error && e.message === "notInRecord") return { status: "unavailable", reason: "notInRecord" }; throw e; }
  });
  if (inMatch()) return { status: "waiting" };
  if (result.status === "ready") { reviews.set(key, result); if (reviews.size > 20) reviews.delete(reviews.keys().next().value!); }
  return result;
}
/** Validate through MatchFiles, then replace atomically so a failed write keeps the recording. */
export function annotateMatch(files: MatchFiles, file: string, t: unknown, note: unknown): Promise<RecordedMatch> {
  return queueReview(async () => {
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || typeof note !== "string" || note.length > 500) throw new Error("Invalid bookmark note");
    await files.flush(); const match = await files.get(file);
    const bookmarks = match.events.filter(e => e.kind === "bookmark" && e.t === t);
    if (!bookmarks.length) throw new Error("Bookmark not found in this recording");
    for (const bookmark of bookmarks) if (bookmark.kind === "bookmark") { if (note) bookmark.note = note; else delete bookmark.note; }
    const data = JSON.stringify(match); if (Buffer.byteLength(data, "utf8") > MAX_MATCH_BYTES) throw new Error("Recording exceeds 2 MB");
    const destination = files.path(file); const temporary = `${destination}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, data, { encoding: "utf8", flag: "wx" }); await rename(temporary, destination); }
    finally { await unlink(temporary).catch(() => {}); }
    return match;
  });
}
export async function saveSharePng(window: BrowserWindow, input: unknown): Promise<boolean> {
  if (typeof input !== "string" || input.length > 8_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)) throw new Error("Invalid share PNG");
  const buffer = Buffer.from(input.slice("data:image/png;base64,".length), "base64");
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || buffer.toString("ascii", 12, 16) !== "IHDR" || buffer.readUInt32BE(16) !== 1200 || buffer.readUInt32BE(20) !== 630) throw new Error("Expected a 1200 × 630 PNG");
  const image = nativeImage.createFromBuffer(buffer); const size = image.getSize();
  if (image.isEmpty() || size.width !== 1200 || size.height !== 630) throw new Error("Invalid share PNG");
  const result = await dialog.showSaveDialog(window, { title: "Save share card", defaultPath: "FlashFront-match.png", filters: [{ name: "PNG image", extensions: ["png"] }] });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, image.toPNG()); return true;
}
function finished(match: RecordedMatch | undefined) {
  if (!match) return;
  liveStats.finish(match); publishObs(); resolver?.ended(match);
  if (validGameId(match.gameId)) gameRecords?.afterMatch(match.gameId);
  if (!stopping && state.settings.publicId) void refreshProfile();
  void queueReview(() => matchFiles.save(match)).then(file => { endReview?.recorded(match.gameId, file); matchesChanged(); }).catch(e => error(`Recording could not be saved: ${String(e)}`));
}

function error(message: string) { if (state.errors.includes(message)) return; state.errors = [...state.errors.slice(-31), message]; publish(); }
let lastFocusable: boolean | undefined;
function publish(geometryOnly = false) {
  if (observing) return;
  state.gameForeground = gameForeground;
  const p = placement();
  // The page keeps game-relative panel positions; the window only covers the panels' bounding box.
  state.overlayViewport = p?.viewport ?? (gameRect ? { offsetX: 0, offsetY: 0, width: gameRect.width, height: gameRect.height } : undefined);
  if (overlay && !overlay.isDestroyed()) {
    if (lastFocusable !== state.editing) {
      overlay.setIgnoreMouseEvents(!state.editing, { forward: true });
      overlay.setFocusable(state.editing); lastFocusable = state.editing;
    }
    if (!restricted() && !endReview?.hidesOverlays && overlayVisible(state, minimized, hasBounds, gameForeground)) {
      if (p) applyPlacement(p);
      else if (gameRect) { overlay.setBounds({ x: gameRect.x, y: gameRect.y, width: 1, height: 1 }); lastBounds = ""; }
      // showInactive keeps the old z-order slot, under OpenFront's topmost window: raise it as it appears.
      if (!overlay.isVisible()) { overlay.showInactive(); overlay.moveTop(); nudgeSurface?.raise(); }
    }
    else if (overlay.isVisible()) { overlay.webContents.send("surface-active", false); overlay.hide(); }
  }
  if (!nudgesOn()) { nudgeEngine.suspend(); nudgeSurface?.hide(); }
  else nudgeSurface?.refresh();
  source?.setCameraHeld(state.spawnHeatHeld === true && !!overlay && !overlay.isDestroyed() && overlay.isVisible() && !restricted());
  for (const [window, surface] of [[launcher, "launcher"], [overlay, "overlay"]] as const) {
    if (window && !window.isDestroyed() && window.isVisible() && !window.isMinimized?.()) {
      if (geometryOnly) { if (surface === "overlay") window.webContents.send("overlay-viewport", state.overlayViewport); }
      else window.webContents.send("state", surfaceState(state, surface));
    }
  }
}
function toggleHud() { state.hudEnabled = !state.hudEnabled; if (!state.hudEnabled) state.editing = false; publish(); }
function restricted() { return restrictedMatch(state); }
/** Use the effective Lite setting resolved for this PC. */
const liteMode = () => state.lite === true;
function nudgesOn() { return !endReview?.hidesOverlays && nudgesAllowed(state, overlayVisible(state, minimized, hasBounds, gameForeground)); }
function toggleEdit() {
  if (!state.raw?.inGame || restricted()) return;
  state.editing = !state.editing; state.hudEnabled = true; publish();
}
function registerHotkeys() {
  globalShortcut.unregisterAll();
  state.errors = state.errors.filter(e => !e.startsWith("Shortcut "));
  for (const [key, callback] of [[state.settings.toggleHotkey, toggleHud], [state.settings.editHotkey, toggleEdit], [state.settings.snoozeHotkey, () => {
    if (!state.raw?.inGame || !state.hudEnabled || restricted()) return;
    state.snoozeSignal = (state.snoozeSignal ?? 0) + 1; publish();
  }], [state.settings.bookmarkHotkey, () => {
    if (state.status !== "connected-game" || !state.raw?.inGame || restricted()) return;
    recorder.bookmark();
  }]] as const) {
    try { if (!globalShortcut.register(key, callback)) error(`Shortcut ${key} could not register. Choose a different key in Settings.`); }
    catch { error(`Shortcut ${key} could not register. Choose a different key in Settings.`); }
  }
}
function connect() {
  source?.stop();
  state.snapshot = null; state.raw = null; state.version = undefined; hasBounds = false; minimized = false; state.editing = false;
  endReview?.observe(null, false, null);
  state.health = featureHealth(null); spawnKey.setActive(false);
  source = new CdpDataSource(state.settings.port, { lite: state.lite, ...(smoke ? { discover: async () => { throw new Error("Fake closed port"); } } : {}) });
  source.subscribeCamera(camera => {
    if (state.spawnHeatHeld === true && state.snapshot?.phase === "spawn" && !restricted() && overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.webContents.send("spawn-camera", camera);
  });
  source.subscribeStatus(status => { state.status = status; if (!status.startsWith("connected")) publish(); });
  source.subscribeObservation(({ raw, snapshot }) => {
    observing = true;
    if (state.raw?.inSpawnPhase && !raw?.inSpawnPhase) {
      panelRects = [];
    }
    state.raw = raw;
    if (raw?.inGame) { trainingWindow?.close({ kind: "left" }); reviewBoard?.matchChanged(); }
    // Before nudges and the overlay are decided: the end dialog hides them all, even while the review is pending.
    endReview?.observe(raw, restrictedMatch({ raw, snapshot }), gameRect);
    state.version = raw?.gameVersion;
    state.health = featureHealth(raw, state.version);
    spawnAlerts.observe(raw);
    spawnKey.setActive(raw?.inSpawnPhase === true && !raw.gameOver && !restrictedMatch({ raw }));
    if (!raw?.inGame) { state.snapshot = null; state.editing = false; }
    if (raw) {
      const ownRaw = { ...raw, gameVersion: raw.gameVersion ?? state.version,
        me: raw.me ? { ...raw.me, profilePublicId: state.settings.publicId ?? raw.me.profilePublicId } : undefined };
      for (const match of recorder.consume(ownRaw, snapshot, state.settings.practiceGoal, state.settings.ownSpawnHistory)) finished(match);
      void resolver.observe(raw.me).catch(e => error(`Profile ID could not be saved: ${String(e)}`));
    }
    if (state.health?.attack !== "verified" || state.health?.build !== "verified") insights = new InsightFeed();
    state.snapshot = snapshot ? { ...snapshot, events: state.health?.attack === "verified" && state.health?.build === "verified" ? insights.observe(snapshot) : [], practiceGoal: recorder.goalProgress } : null;
    const step = nudgeEngine.observe(state.snapshot, Date.now() / 1000, { enabled: nudgesOn(), reserveFloor: state.settings.reserveFloor });
    if (step.ended && state.snapshot) recorder.recordNudge(state.snapshot.gameId, state.snapshot.tick, step.ended.nudge.kind, step.ended.outcome);
    if (step.current) nudgeSurface?.show(step.current.id, step.current.text, step.current.urgent, state.settings.theme);
    else nudgeSurface?.hide();
    observing = false;
    publishObs(); publish();
  });
  source.start();
}
async function followBounds() {
  if (readingBounds || stopping) return;
  readingBounds = true;
  const currentSource = source;
  try {
    const before = JSON.stringify([hasBounds, minimized, gameRect, state.errors]);
    const bounds = await currentSource.getWindowBounds();
    if (currentSource !== source || stopping) return;
    hasBounds = !!bounds && [bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0;
    minimized = bounds?.windowState === "minimized";
    if (hasBounds && bounds && !minimized) {
      // CDP Chromium window coordinates are DIP, as are BrowserWindow bounds.
      const rectangle = { x: Math.round(bounds.left), y: Math.round(bounds.top), width: Math.round(bounds.width), height: Math.round(bounds.height) };
      gameRect = rectangle;
    }
    // Never hide the HUD silently: say so when a match is running but the game window is unknown.
    if (state.raw?.inGame && !hasBounds) error("Can't locate the OpenFront window, so the HUD is hidden.");
    else state.errors = state.errors.filter(e => !e.startsWith("Can't locate the OpenFront window"));
    if (before !== JSON.stringify([hasBounds, minimized, gameRect, state.errors])) publish();
  } finally { readingBounds = false; }
}
async function load(window: BrowserWindow, surface: string, page = "index.html") {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.on("preload-error", (_event, _path, err) => error(`Preload: ${err.message}`));
  window.webContents.on("render-process-gone", (_event, details) => error(`Renderer: ${details.reason}`));
  window.webContents.on("console-message", details => { if (details.level === "error") console.error("Renderer:", details.message); });
  if (devUrl) { const url = new URL(page === "index.html" ? devUrl : `${devUrl.replace(/\/$/, "")}/${page}`); url.searchParams.set("surface", surface); await window.loadURL(url.href); }
  else await window.loadFile(join(here, "../renderer", page), { query: { surface } });
}
async function launch() {
  if (state.launching) return;
  if (smoke) throw new Error("Steam is disabled in fixture smoke mode");
  state.launching = true; state.setupNeeded = false; publish();
  const port = state.settings.port;
  try {
    try { await discover(port); return; } catch { /* Port closed: explicit button launches the official client. */ }
    await shell.openExternal("steam://rungameid/3560670");
    const deadline = Date.now() + 60_000;
    while (!stopping && state.settings.port === port && Date.now() < deadline) {
      try { await discover(port); return; } catch { /* Wait for Steam startup. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!stopping && state.settings.port === port) state.setupNeeded = true;
  } catch (e) { state.setupNeeded = true; error(`Launch failed: ${String(e)}`); }
  finally { state.launching = false; publish(); }
}

// One data folder for dev and the installed app, so settings and match recordings carry over.
app.setPath("userData", join(app.getPath("appData"), "@flashfront", "launcher"));
if (smoke) app.setPath("userData", join(app.getPath("temp"), trainingTest && /^[a-z0-9-]{1,40}$/.test(process.env.FLASHFRONT_TEST_PROFILE ?? "") ? `flashfront-test-${process.env.FLASHFRONT_TEST_PROFILE}` : "flashfront-v3-smoke"));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  protocol.registerSchemesAsPrivileged([{ scheme: "fftraining", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
  app.on("second-instance", () => { launcher?.show(); launcher?.focus(); });
  app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("com.flashfront.launcher");
    try { state.settings = parseSettings(JSON.parse(await readFile(settingsPath(), "utf8"))); }
    catch { /* First run or invalid settings: safe defaults. */ }
    applyLite();
    matchFiles = new MatchFiles(app.getPath("userData"), gameId => gameRecords.forget(gameId));
    gameRecords = new GameRecordCache(matchFiles.directory, statsApi, () => state.raw?.inGame === true);
    await matchFiles.retain();
    resolver = new PublicIdResolver(statsApi, () => state.settings.publicId, async id => {
      state.settings = { ...state.settings, publicId: id };
      try { await saveSettingsFile(); } catch (e) { error(`Profile ID could not be saved: ${String(e)}`); throw e; }
      publish(); void refreshProfile();
    });
    state.hudEnabled = !state.settings.startHidden;
    state.appVersion = app.getVersion();
    // No OS title bar or menu: the window controls sit inside the app's own top bar, colored to the theme.
    launcher = new BrowserWindow({ ...(trainingTest ? { x: 2000, y: 100 } : {}), width: 1100, height: 720, minWidth: 900, minHeight: 600, icon: join(here, "../../build/icon.png"), title: "FlashFront", backgroundColor: "#0A0A0B", show: false,
      titleBarStyle: "hidden", ...(process.platform === "darwin" ? {} : { titleBarOverlay: titleBarColors(state.settings.theme) }),
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    launcher.removeMenu();
    const navigation = createReviewNavigation(matchFiles, destination => launcher.webContents.send("navigate", destination), () => { if (launcher.isMinimized()) launcher.restore(); launcher.show(); launcher.focus(); });
    launcher.webContents.on("did-start-loading", () => navigation.reset());
    ipcMain.on("navigation-ready", event => { if (event.sender === launcher.webContents && event.senderFrame === launcher.webContents.mainFrame) navigation.ready(); });
    const bounds = screen.getPrimaryDisplay().bounds;
    overlay = new BrowserWindow({ ...bounds, show: false, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    overlay.setAlwaysOnTop(true, process.platform === "win32" ? "screen-saver" : "floating");
    overlay.setIgnoreMouseEvents(true, { forward: true });
    nudgeWindow = new BrowserWindow({ width: NUDGE_WINDOW.width, height: NUDGE_WINDOW.height, show: false, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false, resizable: false,
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    nudgeWindow.setAlwaysOnTop(true, process.platform === "win32" ? "screen-saver" : "floating");
    nudgeWindow.setIgnoreMouseEvents(true);
    const tag = nudgeWindow;
    // getCursorScreenPoint and the game rect are both DIP: no scaling.
    nudgeSurface = new NudgeSurface({
      setBounds: bounds => tag.setBounds(bounds), showInactive: () => tag.showInactive(), hide: () => tag.hide(),
      isVisible: () => tag.isVisible(), moveTop: () => tag.moveTop(),
      send: (view: NudgeView | null) => { if (!tag.isDestroyed()) tag.webContents.send("nudge", view); },
    }, cursorTrackable(process.platform, process.env) ? () => screen.getCursorScreenPoint() : () => null, () => gameRect, liteMode);
    // Exactly the card's size, never fullscreen: clicks outside it reach the game. Non-focusable, so the game keeps focus.
    endWindow = new BrowserWindow({ width: 420, height: 180, show: false, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false, resizable: false,
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    endWindow.setAlwaysOnTop(true, process.platform === "win32" ? "screen-saver" : "floating");
    const card = endWindow;
    endReview = new EndReviewSurface({
      setBounds: bounds => card.setBounds(bounds), showInactive: () => card.showInactive(), hide: () => card.hide(),
      isVisible: () => card.isVisible(), moveTop: () => card.moveTop(),
      send: model => { if (!card.isDestroyed()) card.webContents.send("end-review", model && { ...model, theme: state.settings.theme, lite: liteMode() }); },
    }, file => reviewRecordedMatch(matchFiles, gameRecords, file, state.settings.reserveFloor));
    launcher.on("show", () => publish());
    launcher.on("restore", () => publish());
    launcher.on("closed", () => app.quit());
    const authorized = (event: Electron.IpcMainInvokeEvent) => {
      if (event.sender !== launcher.webContents || event.senderFrame !== launcher.webContents.mainFrame) throw new Error("Launcher-only action");
    };
    ipcMain.handle("state", event => {
      if (event.sender !== launcher.webContents && event.sender !== overlay.webContents) throw new Error("Unknown renderer");
      const window = event.sender === overlay.webContents ? overlay : launcher;
      const frame = surfaceState(state, window === overlay ? "overlay" : "launcher");
      return window.isVisible() && !window.isMinimized?.() ? frame : { ...frame, snapshot: null };
    });
    ipcMain.handle("launch", event => { authorized(event); return launch(); });
    ipcMain.handle("copy-setup", event => { authorized(event); clipboard.writeText(launchOption(state.settings.port)); });
    ipcMain.handle("copy-preset", (event, id: unknown) => { authorized(event); clipboard.writeText(presetJson(id)); });
    ipcMain.handle("toggle-hud", event => { authorized(event); toggleHud(); });
    ipcMain.handle("toggle-edit", event => { authorized(event); toggleEdit(); });
    ipcMain.handle("update-restart", event => {
      authorized(event);
      if (!state.update?.ready || restarting || !updater) return;
      restarting = true; app.quit();
    });
    ipcMain.handle("feedback-open", async event => {
      authorized(event);
      if (!FEEDBACK_URL) throw new Error("The feedback form is not available yet.");
      const url = new URL(FEEDBACK_URL);
      if (url.protocol !== "https:" || url.hostname !== "tally.so") throw new Error("Feedback URL is unavailable.");
      await shell.openExternal(url.href);
    });
    ipcMain.handle("release-notes-open", async (event, version: unknown) => {
      authorized(event);
      const url = new URL(releaseNotesUrl(version));
      if (url.protocol !== "https:" || url.hostname !== "github.com") throw new Error("Release notes URL is unavailable.");
      await shell.openExternal(url.href);
    });
    ipcMain.handle("support-preview", event => {
      authorized(event);
      supportPreview = supportReport(state, { app: app.getVersion(), electron: process.versions.electron, platform: process.platform });
      return supportPreview;
    });
    ipcMain.handle("support-copy", event => {
      authorized(event);
      if (supportPreview === undefined) throw new Error("Preview the support report before copying it.");
      clipboard.writeText(supportPreview); supportPreview = undefined;
    });
    ipcMain.on("overlay-decision", (event, gameId: unknown, tick: unknown, decision: unknown) => {
      if (event.sender !== overlay?.webContents || event.senderFrame !== overlay?.webContents.mainFrame || !state.hudEnabled || restricted()) return;
      if (decision != null && [state.health?.growth, state.health?.attack, state.health?.build, state.health?.alliances].some(status => status !== "verified")) return;
      recorder.recordDecision(gameId, tick, decision);
    });
    ipcMain.on("overlay-shape", (event, rects: unknown) => {
      if (event.sender !== overlay?.webContents || !Array.isArray(rects)) return;
      const next = rects.filter((r): r is ShapeRect => !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite)).slice(0, 32);
      if (JSON.stringify(next) === JSON.stringify(panelRects)) return;
      panelRects = next; publish(true);
    });
    ipcMain.handle("matches-list", event => { authorized(event); return matchFiles.list(); });
    ipcMain.handle("matches-get", (event, file: string) => { authorized(event); return matchFiles.get(file); });
    ipcMain.handle("review-get", (event, file: string) => { authorized(event); return reviewRecordedMatch(matchFiles, gameRecords, file, state.settings.reserveFloor); });
    ipcMain.handle("matches-delete", async (event, file: string) => { authorized(event); await deleteRecordedMatch(matchFiles, gameRecords, file); matchesChanged(); });
    ipcMain.handle("matches-annotate", async (event, file: string, t: unknown, note: unknown) => {
      authorized(event); const match = await annotateMatch(matchFiles, file, t, note); matchesChanged(); return match;
    });
    ipcMain.handle("share-save", (event, png: unknown) => { authorized(event); return saveSharePng(launcher, png); });
    ipcMain.handle("matches-show", async (event, file?: string) => {
      authorized(event);
      if (file !== undefined) { await matchFiles.get(file); await navigation.navigate(true, { screen: "review", file }); }
      else { await mkdir(matchFiles.directory, { recursive: true }); const message = await shell.openPath(matchFiles.directory); if (message) throw new Error(message); }
    });
    ipcMain.handle("stats-api", (event, path: string) => { authorized(event); if (typeof path !== "string") throw new Error("Invalid API path"); return statsApi.get(path); });
    ipcMain.handle("end-review-action", async (event, kind: unknown) => {
      if (!endWindow || event.sender !== endWindow.webContents || event.senderFrame !== endWindow.webContents.mainFrame) throw new Error("Card-only action");
      if (kind !== "full" && kind !== "retry") throw new Error("Invalid card action");
      const destination = endReview?.action(kind);
      if (destination) await navigation.navigate(true, destination);
    });
    ipcMain.on("end-review-height", (event, height: unknown) => {
      if (endWindow && event.sender === endWindow.webContents && typeof height === "number") endReview?.measured(height);
    });
    ipcMain.handle("training-show", async (event, request: unknown) => { authorized(event); await navigation.navigate(true, { screen: "training", request }); });
    // Training only: the launcher's main frame asks for one record or one map; nothing is preloaded.
    let trainingDeps: TrainingDeps | undefined;
    const training = (): TrainingDeps => trainingDeps ??= {
      files: matchFiles, records: gameRecords, inMatch: () => state.raw?.inGame === true,
      manifest: async () => JSON.parse(await readFile(join(app.getAppPath(), app.isPackaged ? "out/renderer/training/engine-manifest.json" : "resources/training/engine-manifest.json"), "utf8")),
      mapsDir: app.isPackaged ? join(process.resourcesPath, "training/maps") : join(app.getAppPath(), "build/training-maps"),
      cacheDir: join(app.getPath("userData"), "training-maps"),
      moments: async file => { const r = await reviewRecordedMatch(matchFiles, gameRecords, file, state.settings.reserveFloor); return r.status === "ready" ? r.review.keyMoments : undefined; },
    };
    // Today's drill: a saved pick. Review costs refresh outside a match, one refresh at a time: at start, after a
    // recording is saved or deleted (and again later, once OpenFront has published the new game's record), and
    // when the reserve floor changes.
    const drills = new DrillStore(join(app.getPath("userData"), "training-progress.json"));
    const trainingDev = !!process.env.ELECTRON_RENDERER_URL;
    const recordDrillRunner = new RecordDrillRunner();
    trainingWindow = new TrainingWindow({
      createWindow: options => new BrowserWindow(trainingTest ? { ...options, show: false, fullscreen: false, focusable: false } : options), bounds: () => screen.getDisplayMatching(launcher.getBounds()).bounds,
      preload: join(here, "../preload/training.cjs"), rendererDir: join(here, "../renderer"),
      drillsDir: join(app.getAppPath(), app.isPackaged ? "out/renderer/training/drills/client" : "resources/training/drills/client"),
      dev: trainingDev, training: training(), drills,
      retry: async (request, signal) => {
        const source = await loadTrainingRecord(training(), request.file, request);
        if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
        if (source.status !== "ready") return source;
        return createRecordDrillBuilder({ signal, loadMap: (id, size) => loadTrainingMap(training(), id, size), reserveFloorPct: state.settings.reserveFloor, build: input => recordDrillRunner.run(input) })(source.value.record, source.value.ownClientId, request.tick, request.mistake);
      },
      cancelPending: () => recordDrillRunner.stop(),
      preferences: () => ({ lite: state.lite === true, reducedMotion: state.settings.visualEffects === "lite" || systemPreferences.getAnimationSettings().prefersReducedMotion }),
      ended: (request, outcome) => { if (!launcher.isDestroyed()) launcher.webContents.send("training-ended", request, outcome); },
      log: cause => { console.error(cause); void appendFile(join(app.getPath("userData"), "training.log"), `${new Date().toISOString()} ${cause}\n`).catch(() => {}); },
    });
    const trainingSession = session.fromPartition("persist:training");
    trainingSession.protocol.handle("fftraining", request => trainingWindow!.serve(request.url));
    trainingSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !trainingNetworkAllowed(details.url, trainingDev) }));
    trainingSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    trainingSession.setPermissionCheckHandler(() => false);
    trainingSession.on("will-download", event => event.preventDefault());
    wireTrainingIpc(ipcMain, trainingWindow, () => launcher);
    const reviewRunner = new ReviewRunner(join(here, "review.worker.js"));
    const reviewMaps = new Map<string, string>();
    let reviewGeneration = 0;
    reviewBoard = new ReviewBoardController({
      createView: options => new WebContentsView(options), launcher: () => launcher,
      preload: join(here, "../preload/review.cjs"), dev: trainingDev,
      inMatch: () => state.raw?.inGame === true,
      prepare: async file => {
        const generation = reviewGeneration;
        const stale = () => generation !== reviewGeneration || state.raw?.inGame === true;
        try {
          const match = await matchFiles.get(file);
          if (!match.gameId || !match.me.clientId) return { status: "unavailable", reason: "missingRecord" };
          const record = await gameRecords.read(match.gameId);
          if (stale()) return { status: "unavailable", reason: "cancelled" };
          if (!record) return { status: "unavailable", reason: "missingRecord" };
          const spec = sourceMap({ kind: "record", record, ownClientId: match.me.clientId, startTick: 0 });
          if (!spec) return { status: "unavailable", reason: "invalidRecord" };
          const map = await loadTrainingMap(training(), spec.mapId, spec.mapSize);
          if (stale()) return { status: "unavailable", reason: "cancelled" };
          if (map.status !== "ready") return map;
          const manifest = await training().manifest();
          if (stale()) return { status: "unavailable", reason: "cancelled" };
          const entry = manifest.maps.find(m => m.id === spec.mapId);
          if (!entry || !/^[a-z0-9_-]+$/.test(entry.key) || !/^[a-zA-Z0-9_-]+$/.test(manifest.upstream.commit)) return { status: "unavailable", reason: "missingMap" };
          reviewMaps.clear();
          for (const name of spec.mapSize === "Normal" ? ["manifest.json", "map.bin", "map4x.bin"] : ["manifest.json", "map4x.bin", "map16x.bin"]) reviewMaps.set(`maps/${entry.key}/${name}`, join(training().cacheDir, manifest.upstream.commit, entry.key, name));
          return reviewRunner.start({ record, ownClientId: match.me.clientId, map: map.value, tick: 0 });
        } catch { return { status: "unavailable", reason: "invalidRecord" }; }
      },
      seek: tick => reviewRunner.seek(tick),
      cancel: () => { ++reviewGeneration; reviewRunner.close(); reviewMaps.clear(); },
      status: value => { if (!launcher.isDestroyed()) launcher.webContents.send("review-board-status", value); },
      step: direction => { if (!launcher.isDestroyed()) launcher.webContents.send("review-board-step", direction); },
    });
    const reviewSession = session.fromPartition("persist:review");
    reviewSession.protocol.handle("fftraining", request => trainingWindow!.serve(request.url, reviewMaps));
    reviewSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !trainingNetworkAllowed(details.url, trainingDev) }));
    reviewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    reviewSession.setPermissionCheckHandler(() => false);
    reviewSession.on("will-download", event => event.preventDefault());
    wireReviewBoardIpc(ipcMain, reviewBoard, () => launcher);
    launcher.on("close", () => reviewBoard?.close());
    app.on("before-quit", () => reviewBoard?.close());
    launcher.on("closed", () => trainingWindow?.close({ kind: "left" }));
    app.on("before-quit", () => trainingWindow?.close({ kind: "left" }));
    const refresher = new DrillRefresher(drills);
    refreshDrills = () => refresher.run(async () => refreshDrillReviews(await matchFiles.list(), f => reviewRecordedMatch(matchFiles, gameRecords, f, state.settings.reserveFloor), () => state.raw?.inGame === true));
    refreshDrillsLater = () => { for (const minutes of [3, 10]) setTimeout(() => void refreshDrills().catch(() => {}), minutes * 60_000).unref?.(); };
    void refreshDrills().catch(() => {});
    ipcMain.handle("drill-today", event => { authorized(event); return drills.today(); });
    ipcMain.handle("drill-progress", event => { authorized(event); return drills.getProgress(); });
    ipcMain.handle("training-open-log", async event => {
      authorized(event);
      const path = join(app.getPath("userData"), "training.log");
      await writeFile(path, "FlashFront Training diagnostics\nIf Training fails to start, use Settings > About > Support report for system details.\n", { flag: "a" });
      const error = await shell.openPath(path); if (error) throw new Error(error);
    });
    ipcMain.handle("drill-complete", (event, id: unknown) => { authorized(event); return drills.complete(String(id)); });
    ipcMain.handle("drill-visit", (event, id: unknown) => { authorized(event); return drills.recordVisit(String(id)); });
    ipcMain.handle("training-record", (event, file: unknown, retry: unknown) => {
      authorized(event);
      const r = retry as { tick?: unknown; mistake?: unknown } | undefined;
      const moment = r && typeof r.tick === "number" && Number.isInteger(r.tick) && (r.mistake === "allyDecision" || r.mistake === "postsBeforePush" || r.mistake === "sendSize") ? { tick: r.tick, mistake: r.mistake as MistakeType } : undefined;
      if (retry !== undefined && !moment) throw new Error("Invalid retry moment");
      return loadTrainingRecord(training(), String(file), moment);
    });
    ipcMain.handle("training-map", (event, mapId: unknown, mapSize: unknown) => { authorized(event); return loadTrainingMap(training(), String(mapId), String(mapSize)); });
    ipcMain.handle("settings", async (event, input: unknown) => {
      authorized(event);
      const next = parseSettings(input);
      const changedPort = next.port !== state.settings.port;
      const changedProfile = next.publicId !== state.settings.publicId;
      const changedFloor = next.reserveFloor !== state.settings.reserveFloor;
      state.settings = next;
      if (changedFloor) void refreshDrills().catch(() => {});
      applyLite();
      if (process.platform !== "darwin") launcher?.setTitleBarOverlay(titleBarColors(next.theme));
      await saveSettingsFile();
      if (changedProfile) void refreshProfile();
      if (restricted()) state.editing = false;
      registerHotkeys();
      if (changedPort) connect();
      publishObs();
      publish();
    });
    await Promise.all([load(launcher, "launcher"), load(overlay, "overlay"), load(nudgeWindow, "nudge", "nudge.html"), load(endWindow, "end-review", "end-review.html")]);
    if (!trainingTest) launcher.show();
    if (app.isPackaged && !smoke) {
      // Import/check errors remain silent and cannot delay the launcher or game connection.
      void import("electron-updater").then(module => {
        if (!stopping) updater = startUpdater(module.default.autoUpdater, update => { state.update = update; publish(); });
      }).catch(() => console.warn("FlashFront updater unavailable."));
    }
    try { obs = await startObs({ rendererDir: join(here, "../renderer"), devUrl, api: statsApi, ...(trainingTest ? { port: 0 } : {}) }); }
    catch (e) { console.error("OBS server", e); error("Stream connection unavailable. Close any other FlashFront copy, then restart FlashFront."); }
    registerHotkeys(); connect();
    void refreshProfile();
    recordTimer = setInterval(() => {
      finished(recorder.expire()); publishObs();
      if (state.settings.publicId && Date.now() >= nextProfileRefresh) void refreshProfile();
    }, 1000);
    boundsTimer = setInterval(() => void followBounds(), 1000);
    foregroundTimer = setInterval(() => {
      let next: boolean | null = null;
      try { const exe = foregroundProbe(); next = exe === null ? null : isGameProcess(exe); } catch { next = null; }
      if (next !== gameForeground) { gameForeground = next; publish(); }
      // OpenFront's windows are topmost too: activating one (live 2026-10-23, 0.2.2 as well) lifts it over the HUD.
      // Raise only when the foreground window changes; z-order only, the overlay never takes focus.
      const window = foregroundProbe.window;
      if (window !== foregroundWindow) { foregroundWindow = window; if (next && overlay.isVisible()) { overlay.moveTop(); nudgeSurface?.raise(); } }
    }, 250);
    if (smoke && !trainingTest) {
      const { smokeCheck } = await import("./smoke");
      await smokeCheck(launcher, overlay, () => state);
      app.quit();
    }
  }).catch(e => { console.error(e); app.exit(1); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (stopping) return;
    event.preventDefault(); stopping = true;
    resolver?.stop(); gameRecords?.stop(); spawnKey.stop(); updater?.stop(); clearInterval(recordTimer); clearInterval(boundsTimer); clearInterval(foregroundTimer); globalShortcut.unregisterAll(); source?.stop();
    finished(recorder.finish());
    void Promise.all([reviewQueue, matchFiles?.flush(), settingsQueue, obs?.close()]).finally(() => {
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      nudgeSurface?.dispose();
      if (nudgeWindow && !nudgeWindow.isDestroyed()) nudgeWindow.destroy();
      if (endWindow && !endWindow.isDestroyed()) endWindow.destroy();
      if (restarting) updater?.restart();
      app.quit();
    });
  });
}
