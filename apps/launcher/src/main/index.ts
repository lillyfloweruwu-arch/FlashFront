import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage, screen, shell } from "electron";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CdpDataSource, discover } from "@flashfront/cdp";
import { InsightFeed, MatchRecorder, MAX_MATCH_BYTES, presetJson, spawnHeatActive, type RecordedMatch, type PlayerProfile } from "@flashfront/core";
import { THEMES, type ThemeId } from "@flashfront/ui/themes";
import { DEFAULT_SETTINGS, isGameProcess, launchOption, overlayPlacement, overlayVisible, releaseNotesUrl, restrictedMatch, type ShapeRect, parseSettings } from "../shared";
import { surfaceState } from "./surfaces";
import { startObs } from "./obs";
import { MatchFiles } from "./recorder";
import { StatsApi, PublicIdResolver } from "./api";
import { profileFromApi } from "../stats";
import { LiveStats } from "./liveStats";
import { createForegroundProbe } from "./foreground";
import { startUpdater } from "./updater";
import { SpawnAlerts, spawnAlert } from "./alerts";
import { createKeyProbe, watchSpawnKey } from "./keys";
import { featureHealth, type PlatformState } from "./health";
import { FEEDBACK_URL, supportReport } from "./support";

const here = dirname(fileURLToPath(import.meta.url));
const smoke = process.env.FLASHFRONT_SMOKE_TEST === "1";
let launcher: BrowserWindow;
let overlay: BrowserWindow;
let source: CdpDataSource;
let obs: Awaited<ReturnType<typeof startObs>> | undefined;
let boundsTimer: ReturnType<typeof setInterval>;
// OpenFront (Steam) keeps a second "OpenFront" helper window in front, so the page's hasFocus() is
// false while playing. Ask the OS which process owns the foreground window instead.
const foregroundProbe = createForegroundProbe();
let gameForeground: boolean | null = null;
let foregroundTimer: ReturnType<typeof setInterval>;
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
function matchesChanged() { if (launcher && !launcher.isDestroyed()) launcher.webContents.send("matches-changed"); }
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
  if (!stopping && state.settings.publicId) void refreshProfile();
  void queueReview(() => matchFiles.save(match)).then(matchesChanged).catch(e => error(`Recording could not be saved: ${String(e)}`));
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
    if (!restricted() && overlayVisible(state, minimized, hasBounds, gameForeground)) {
      if (p) applyPlacement(p);
      else if (gameRect) { overlay.setBounds({ x: gameRect.x, y: gameRect.y, width: 1, height: 1 }); lastBounds = ""; }
      if (!overlay.isVisible()) overlay.showInactive();
    }
    else if (overlay.isVisible()) { overlay.webContents.send("surface-active", false); overlay.hide(); }
  }
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
  state.health = featureHealth(null); spawnKey.setActive(false);
  source = new CdpDataSource(state.settings.port, smoke ? { discover: async () => { throw new Error("Fake closed port"); } } : {});
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
async function load(window: BrowserWindow, surface: string) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.on("preload-error", (_event, _path, err) => error(`Preload: ${err.message}`));
  window.webContents.on("render-process-gone", (_event, details) => error(`Renderer: ${details.reason}`));
  window.webContents.on("console-message", details => { if (details.level === "error") console.error("Renderer:", details.message); });
  if (devUrl) { const url = new URL(devUrl); url.searchParams.set("surface", surface); await window.loadURL(url.href); }
  else await window.loadFile(join(here, "../renderer/index.html"), { query: { surface } });
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
if (smoke) app.setPath("userData", join(app.getPath("temp"), "flashfront-v3-smoke"));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { launcher?.show(); launcher?.focus(); });
  app.whenReady().then(async () => {
    if (process.platform === "win32") app.setAppUserModelId("com.flashfront.launcher");
    try { state.settings = parseSettings(JSON.parse(await readFile(settingsPath(), "utf8"))); }
    catch { /* First run or invalid settings: safe defaults. */ }
    matchFiles = new MatchFiles(app.getPath("userData"));
    await matchFiles.retain();
    resolver = new PublicIdResolver(statsApi, () => state.settings.publicId, async id => {
      state.settings = { ...state.settings, publicId: id };
      try { await saveSettingsFile(); } catch (e) { error(`Profile ID could not be saved: ${String(e)}`); throw e; }
      publish(); void refreshProfile();
    });
    state.hudEnabled = !state.settings.startHidden;
    state.appVersion = app.getVersion();
    // No OS title bar or menu: the window controls sit inside the app's own top bar, colored to the theme.
    launcher = new BrowserWindow({ width: 1100, height: 720, minWidth: 900, minHeight: 600, icon: join(here, "../../build/icon.png"), title: "FlashFront", backgroundColor: "#0A0A0B", show: false,
      titleBarStyle: "hidden", ...(process.platform === "darwin" ? {} : { titleBarOverlay: titleBarColors(state.settings.theme) }),
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    launcher.removeMenu();
    const bounds = screen.getPrimaryDisplay().bounds;
    overlay = new BrowserWindow({ ...bounds, show: false, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false,
      webPreferences: { preload: join(here, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    overlay.setAlwaysOnTop(true, process.platform === "win32" ? "screen-saver" : "floating");
    overlay.setIgnoreMouseEvents(true, { forward: true });
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
    ipcMain.handle("matches-delete", async (event, file: string) => { authorized(event); await queueReview(() => matchFiles.delete(file)); matchesChanged(); });
    ipcMain.handle("matches-annotate", async (event, file: string, t: unknown, note: unknown) => {
      authorized(event); const match = await annotateMatch(matchFiles, file, t, note); matchesChanged(); return match;
    });
    ipcMain.handle("share-save", (event, png: unknown) => { authorized(event); return saveSharePng(launcher, png); });
    ipcMain.handle("matches-show", async (event, file?: string) => {
      authorized(event);
      if (file !== undefined) { await matchFiles.get(file); shell.showItemInFolder(matchFiles.path(file)); }
      else { await mkdir(matchFiles.directory, { recursive: true }); const message = await shell.openPath(matchFiles.directory); if (message) throw new Error(message); }
    });
    ipcMain.handle("stats-api", (event, path: string) => { authorized(event); if (typeof path !== "string") throw new Error("Invalid API path"); return statsApi.get(path); });
    ipcMain.handle("settings", async (event, input: unknown) => {
      authorized(event);
      const next = parseSettings(input);
      const changedPort = next.port !== state.settings.port;
      const changedProfile = next.publicId !== state.settings.publicId;
      state.settings = next;
      if (process.platform !== "darwin") launcher?.setTitleBarOverlay(titleBarColors(next.theme));
      await saveSettingsFile();
      if (changedProfile) void refreshProfile();
      if (restricted()) state.editing = false;
      registerHotkeys();
      if (changedPort) connect();
      publishObs();
      publish();
    });
    await Promise.all([load(launcher, "launcher"), load(overlay, "overlay")]);
    launcher.show();
    if (app.isPackaged && !smoke) {
      // Import/check errors remain silent and cannot delay the launcher or game connection.
      void import("electron-updater").then(module => {
        if (!stopping) updater = startUpdater(module.default.autoUpdater, update => { state.update = update; publish(); });
      }).catch(() => console.warn("FlashFront updater unavailable."));
    }
    try { obs = await startObs({ rendererDir: join(here, "../renderer"), devUrl, api: statsApi }); }
    catch (e) { error(`OBS endpoint unavailable: ${String(e)}`); }
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
    }, 250);
    if (smoke) {
      const { smokeCheck } = await import("./smoke");
      await smokeCheck(launcher, overlay, () => state);
      app.quit();
    }
  }).catch(e => { console.error(e); app.exit(1); });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (stopping) return;
    event.preventDefault(); stopping = true;
    resolver?.stop(); spawnKey.stop(); updater?.stop(); clearInterval(recordTimer); clearInterval(boundsTimer); clearInterval(foregroundTimer); globalShortcut.unregisterAll(); source?.stop();
    finished(recorder.finish());
    void Promise.all([reviewQueue, matchFiles?.flush(), settingsQueue, obs?.close()]).finally(() => {
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      if (restarting) updater?.restart();
      app.quit();
    });
  });
}
