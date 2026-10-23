import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { SpawnAlerts, spawnAlert, spawnChime } from "./alerts";

const native = vi.hoisted(() => ({ show: vi.fn(), play: vi.fn(), load: vi.fn(), options: vi.fn() }));
vi.mock("koffi", () => ({ default: { load: native.load } }));
vi.mock("electron", () => ({ Notification: class extends EventEmitter { static isSupported() { return true; } constructor(options: unknown) { super(); native.options(options); } show() { native.show(); } } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("alerts once per game even after a reconnect, and suppresses ranked and replay", () => {
  const alert = vi.fn(); const tracker = new SpawnAlerts(alert);
  const spawn = { gameId: "one", inGame: true, visible: true, inSpawnPhase: true };
  tracker.observe(spawn); tracker.observe(spawn); tracker.observe(null); tracker.observe(spawn);
  tracker.observe({ ...spawn, gameId: "two", replay: true });
  tracker.observe({ ...spawn, gameId: "three", game: { rankedType: "ffa" } });
  expect(alert).toHaveBeenCalledTimes(1);
  tracker.observe({ ...spawn, gameId: "four" }); expect(alert).toHaveBeenCalledTimes(2);
});
it("flashes until focus, uses a quiet notification and an optional original short WAV, without focusing", () => {
  vi.stubGlobal("process", { ...process, platform: "win32" });
  native.load.mockReturnValue({ func: () => native.play });
  const win = Object.assign(new EventEmitter(), { flashFrame: vi.fn(), isDestroyed: () => false, isFocused: () => false, focus: vi.fn() });
  spawnAlert(win as unknown as BrowserWindow, { chime: true });
  expect(native.options).toHaveBeenCalledWith(expect.objectContaining({ title: "Spawn phase started", silent: true }));
  expect(win.flashFrame).toHaveBeenCalledWith(true); win.emit("focus"); expect(win.flashFrame).toHaveBeenLastCalledWith(false);
  expect(win.focus).not.toHaveBeenCalled(); expect(native.play).toHaveBeenCalledTimes(1);
  const wav = spawnChime(); expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.readUInt32LE(40) / wav.readUInt32LE(28)).toBeLessThanOrEqual(1);
  spawnAlert(win as unknown as BrowserWindow, { chime: false }); expect(native.play).toHaveBeenCalledTimes(1);
  vi.stubGlobal("process", { ...process, platform: "linux" }); spawnAlert(win as unknown as BrowserWindow, { chime: true });
  expect(native.show).toHaveBeenCalledTimes(2);
});
