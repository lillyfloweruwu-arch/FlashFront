import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { mapToSnapshot, MatchRecorder, type RawExtract } from "@flashfront/core";
import type { PlatformState } from "./health";

const fixture = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), windows: [] as any[], raw: (_raw: RawExtract | null) => {}, game: (_snapshot: unknown) => {},
  sourceOptions: vi.fn(), setLite: vi.fn(), register: vi.fn(() => true), clipboard: vi.fn(), external: vi.fn(), quit: vi.fn(), obs: vi.fn(), check: vi.fn(async () => null), foregroundWindow: 1 as unknown }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    webContents = { mainFrame: {}, send: vi.fn(), setWindowOpenHandler() {}, on() {} };
    bounds = { width: 0 }; visible = false;
    constructor(public options: { focusable?: boolean } = {}) { super(); fixture.windows.push(this); }
    isDestroyed() { return false; } isVisible() { return this.visible; } isFocused() { return true; }
    setBounds(bounds: { width: number }) { this.bounds = bounds; } showInactive() { this.visible = true; } hide() { this.visible = false; }
    setAlwaysOnTop() {} setIgnoreMouseEvents() {} setFocusable() {} setTitleBarOverlay() {} removeMenu() {} show() {} focus() {} destroy() {} moveTop() {}
    async loadFile() {} async loadURL() {}
  }
  return { app: { setPath() {}, getPath: () => "fixture-user-data", getVersion: () => "0.2.0", setAppUserModelId() {}, requestSingleInstanceLock: () => true,
    whenReady: async () => {}, isPackaged: true, getAppPath: () => "fixture-app", on() {}, quit: fixture.quit, exit: vi.fn() }, BrowserWindow: Window,
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    session: { fromPartition: vi.fn(() => ({ protocol: { handle: vi.fn() }, webRequest: { onBeforeRequest: vi.fn() }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {} })) },
    clipboard: { writeText: fixture.clipboard }, globalShortcut: { register: fixture.register, unregisterAll() {} },
    ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => fixture.handlers.set(name, handler), on: (name: string, handler: (...args: any[]) => any) => fixture.handlers.set(name, handler) },
    screen: { getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }), getCursorScreenPoint: () => ({ x: 400, y: 300 }) }, shell: { openExternal: fixture.external } };
});
vi.mock("node:fs/promises", () => ({ readFile: async () => { throw new Error("no settings"); }, writeFile: vi.fn(), mkdir: vi.fn() }));
vi.mock("@flashfront/cdp", () => ({ discover: vi.fn(), CdpDataSource: class {
  constructor(_port: number, options: unknown) { fixture.sourceOptions(options); }
  setLite = fixture.setLite;
  subscribeStatus() {} subscribeObservation(cb: (o: { raw: RawExtract | null; snapshot: ReturnType<typeof mapToSnapshot> }) => void) { fixture.raw = raw => cb({ raw, snapshot: raw ? mapToSnapshot(raw) : null }); }
  subscribeCamera() {} setCameraHeld() {} start() {} stop() {} async getWindowBounds() { return { left: 0, top: 0, width: 1920, height: 1080 }; }
} }));
vi.mock("./hardware", () => ({ readHardware: () => ({ cpus: 2, totalMemBytes: 16 * 2 ** 30 }) }));
vi.mock("./foreground", () => ({ createForegroundProbe: () => Object.defineProperty(() => "openfront.exe", "window", { get: () => fixture.foregroundWindow }) }));
vi.mock("./keys", () => ({ createKeyProbe: () => () => false, watchSpawnKey: () => ({ setActive() {}, stop() {} }) }));
vi.mock("./alerts", () => ({ spawnAlert: vi.fn(), SpawnAlerts: class { observe() {} } }));
vi.mock("./obs", () => ({ startObs: async () => ({ publish: fixture.obs, close: async () => {} }) }));
vi.mock("./recorder", () => ({ MatchFiles: class { directory = "fixture-user-data/matches"; async retain() {} async save() {} async flush() {} } }));
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), StatsApi: class {}, PublicIdResolver: class { async observe() {} ended() {} stop() {} } }));
vi.mock("electron-updater", async () => {
  const { EventEmitter } = await import("node:events");
  return { default: { autoUpdater: Object.assign(new EventEmitter(), { checkForUpdates: fixture.check, downloadUpdate: vi.fn(), quitAndInstall: vi.fn() }) } };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("wires local-only support IPC, keeps restart guarded and hides ranked even with a legacy opt-out", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("process", Object.assign(Object.create(process), { resourcesPath: "fixture-resources" }));
  await import("./index"); await vi.advanceTimersByTimeAsync(0);
  const [launcher, overlay] = fixture.windows;
  const authorized = { sender: launcher.webContents, senderFrame: launcher.webContents.mainFrame };
  const call = (name: string, event = authorized) => fixture.handlers.get(name)!(event);
  let state = call("state") as PlatformState;
  expect(state.weakPc).toBe(true); expect(state.lite).toBe(true);
  expect(fixture.sourceOptions).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lite: true }));
  await fixture.handlers.get("settings")!(authorized, { ...state.settings, liteMode: "off" });
  expect(call("state").lite).toBe(false);
  expect(fixture.setLite).toHaveBeenLastCalledWith(false);
  expect(fixture.sourceOptions).toHaveBeenCalledTimes(1);
  expect.soft(state.feedbackAvailable).toBe(false);
  expect(fixture.register).toHaveBeenCalledWith("Ctrl+Alt+S", expect.any(Function));
  fixture.register.mockClear();
  await fixture.handlers.get("settings")!(authorized, { ...state.settings, snoozeHotkey: "Ctrl+Alt+J" });
  expect(fixture.register).toHaveBeenCalledWith("Ctrl+Alt+J", expect.any(Function));
  expect(fixture.register).not.toHaveBeenCalledWith("Ctrl+Alt+S", expect.any(Function));
  expect(fixture.check).toHaveBeenCalledTimes(1);
  expect(() => call("support-preview", { sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame })).toThrow("Launcher-only");
  expect(() => fixture.handlers.get("review-get")!({ sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame }, "fixture.json")).toThrow("Launcher-only");
  expect(() => call("support-copy")).toThrow("Preview");
  const report = call("support-preview"); call("support-copy"); expect(fixture.clipboard).toHaveBeenLastCalledWith(report);
  expect(() => call("support-copy")).toThrow("Preview");
  await expect(call("feedback-open")).rejects.toThrow("not available yet"); expect(fixture.external).not.toHaveBeenCalled();
  call("update-restart"); expect(fixture.quit).not.toHaveBeenCalled();
  await fixture.handlers.get("settings")!(authorized, { ...call("state").settings, liteMode: "off", obsDelaySec: 60, obsHideOwnNumbers: true });
  const healthy: RawExtract = { inGame: true, visible: true, gameId: "own-game", tick: 1000, gameVersion: "0.35.2", game: { map: "World" },
    me: { troops: 500000, maxTroops: 1000000, troopRatePerTick: 0, tiles: 1000, outgoingCount: 0, attackRatio: 0.2,
      gold: "150000", goldEarned: "150000", portLevels: 0, cityLevels: 0, factoryLevels: 0, defensePosts: 0, samLaunchers: 0, silos: 0, incoming: [], alliances: [] } };
  fixture.raw(healthy); fixture.game(mapToSnapshot(healthy));
  expect(await fixture.handlers.get("review-get")!(authorized, "fixture.json")).toEqual({ status: "waiting" });
  expect(fixture.obs).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ obsDelaySec: 60, obsHideOwnNumbers: true }));
  // One frame for a read; unchanged native geometry is silent. Hidden launchers get no live frames.
  overlay.visible = true;
  fixture.handlers.get("overlay-shape")!({ sender: overlay.webContents }, [{ x: 20, y: 20, width: 272, height: 200 }]);
  await vi.advanceTimersByTimeAsync(1000);
  overlay.webContents.send.mockClear(); launcher.webContents.send.mockClear(); fixture.obs.mockClear();
  // Live 2026-10-23: OpenFront's window is itself topmost; activating one of its windows put it above the HUD
  // (0.2.2 too). The overlay is raised when the foreground window changes, never per frame, never focused.
  const raiseOverlay = vi.spyOn(overlay, "moveTop"); const tagWindow = fixture.windows[2];
  const raiseTag = vi.spyOn(tagWindow, "moveTop");
  fixture.raw(healthy);
  expect(raiseOverlay).not.toHaveBeenCalled();
  fixture.foregroundWindow = 2; await vi.advanceTimersByTimeAsync(300);
  expect(raiseOverlay).toHaveBeenCalledTimes(1);
  if (tagWindow.visible) expect(raiseTag.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(raiseOverlay.mock.invocationCallOrder[0]!);
  fixture.raw(healthy); await vi.advanceTimersByTimeAsync(2000);
  expect(raiseOverlay).toHaveBeenCalledTimes(1);
  expect(overlay.options.focusable).toBe(false); expect(tagWindow.options.focusable).toBe(false);
  // Live 2026-10-23: re-shown for a new match, showInactive left the overlay under the game. Showing raises it.
  overlay.visible = false; raiseOverlay.mockClear();
  fixture.raw(healthy);
  expect(overlay.visible).toBe(true); expect(raiseOverlay).toHaveBeenCalledTimes(1);
  overlay.webContents.send.mockClear(); launcher.webContents.send.mockClear(); fixture.obs.mockClear();
  fixture.raw(healthy);
  expect(overlay.webContents.send.mock.calls.filter(([channel]: string[]) => channel === "state")).toHaveLength(1);
  expect(launcher.webContents.send.mock.calls.filter(([channel]: string[]) => channel === "state")).toHaveLength(0);
  expect(fixture.obs).toHaveBeenCalledTimes(1);
  overlay.webContents.send.mockClear();
  await vi.advanceTimersByTimeAsync(1000);
  fixture.handlers.get("overlay-shape")!({ sender: overlay.webContents }, [{ x: 20, y: 20, width: 272, height: 200 }]);
  expect(overlay.webContents.send).not.toHaveBeenCalled();
  launcher.visible = true; launcher.emit("show");
  expect(launcher.webContents.send).toHaveBeenLastCalledWith("state", expect.objectContaining({ snapshot: expect.objectContaining({ tick: 1000 }) }));
  launcher.visible = false;
  // Hiding and restoring between observations must suspend the engine too, not just its window.
  const tag = fixture.windows[2];
  expect(call("state").lite).toBe(false);
  expect(tag.webContents.send).toHaveBeenLastCalledWith("nudge", expect.objectContaining({ text: expect.any(String), lite: false }));
  const nudgeRecord = vi.spyOn(MatchRecorder.prototype, "recordNudge");
  call("toggle-hud"); call("toggle-hud");
  tag.webContents.send.mockClear();
  fixture.raw(healthy);
  expect(tag.webContents.send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(4000);
  fixture.raw({ ...healthy, tick: 1040 });
  expect(nudgeRecord).not.toHaveBeenCalled();
  nudgeRecord.mockRestore();
  const record = vi.spyOn(MatchRecorder.prototype, "recordDecision");
  const decision = { kind: "recovery", text: "Recovering" };
  const reportDecision = fixture.handlers.get("overlay-decision")!;
  reportDecision(authorized, "own-game", 1000, decision); expect(record).not.toHaveBeenCalled();
  reportDecision({ sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame }, "own-game", 1000, decision);
  expect(record).toHaveBeenCalledWith("own-game", 1000, decision); record.mockClear();
  fixture.raw({ ...healthy, me: { ...healthy.me, maxTroops: undefined } });
  reportDecision({ sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame }, "own-game", 1000, decision);
  expect(record).not.toHaveBeenCalled(); record.mockRestore();
  // Cross-plan B/G: Settings resolves LauncherState.lite, which reaches the actual nudge window.
  await fixture.handlers.get("settings")!(authorized, { ...call("state").settings, liteMode: "on" });
  expect(call("state").lite).toBe(true);
  fixture.raw({ ...healthy, gameId: "unranked-check" });
  expect(tag.webContents.send).toHaveBeenLastCalledWith("nudge", expect.objectContaining({ text: expect.stringMatching(/^(Head|Attack|Defense|Economy) coach: /), lite: true }));
  state.settings.ranked = false;
  const raw: RawExtract = { inGame: true, visible: true, gameId: "ranked", game: { rankedType: "ffa" }, me: { troops: 20 } };
  fixture.raw(raw); fixture.game(mapToSnapshot(raw)); await vi.advanceTimersByTimeAsync(1000);
  state = call("state"); expect(overlay.visible).toBe(false); expect(state.health?.growth).toBe("unavailable");
  expect(await fixture.handlers.get("review-get")!(authorized, "fixture.json")).toEqual({ status: "waiting" });
  fixture.raw({ ...healthy, replay: true });
  expect(await fixture.handlers.get("review-get")!(authorized, "fixture.json")).toEqual({ status: "waiting" });
  // 0.3.0: the live match above raised a coach nudge in the cursor-tag window; the ranked match hid it.
  expect(tag.webContents.send).toHaveBeenLastCalledWith("nudge", null);
  expect(tag.visible).toBe(false);
  const updater = await import("electron-updater");
  updater.default.autoUpdater.emit("update-downloaded", { version: "0.2.1", releaseNotes: "fixture" } as never);
  call("update-restart"); expect(fixture.quit).toHaveBeenCalledTimes(1);
  // All Electron/native objects in this test are fakes; no game, notification or updater network runs.
  expect(launcher).toBeInstanceOf(EventEmitter);
});
