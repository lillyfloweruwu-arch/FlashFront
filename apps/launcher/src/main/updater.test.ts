import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { startUpdater, type UpdateClient } from "./updater";
const release = { version: "0.2.0", files: [], path: "FlashFront.exe", sha512: "fixture", releaseDate: "2026-10-18" };

function client() {
  return Object.assign(new EventEmitter(), { autoDownload: true, autoInstallOnAppQuit: true, logger: console,
    checkForUpdates: vi.fn(async () => null), downloadUpdate: vi.fn(async () => []), quitAndInstall: vi.fn() }) as unknown as UpdateClient;
}
afterEach(() => vi.useRealTimers());
it("checks on start and every six hours without blocking launch; offline errors log once", async () => {
  vi.useFakeTimers(); const updater = client(); const publish = vi.fn(); const log = vi.fn();
  vi.mocked(updater.checkForUpdates).mockImplementation(async () => { const e = new Error("offline"); updater.emit("error", e); throw e; });
  const control = startUpdater(updater, publish, log);
  expect(control).toBeDefined();
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(1); expect(publish).not.toHaveBeenCalled();
  control.stop(); expect(vi.getTimerCount()).toBe(0);
});
it("downloads in the background and only allows restart after a download", async () => {
  vi.useFakeTimers(); const updater = client(); const publish = vi.fn();
  const control = startUpdater(updater, publish, vi.fn());
  control.restart(); expect(updater.quitAndInstall).not.toHaveBeenCalled();
  updater.emit("update-available", { ...release, releaseNotes: [{ version: "0.2.0", note: "Spawn alerts" }] });
  expect(publish).toHaveBeenLastCalledWith({ version: "0.2.0", notes: "Spawn alerts", ready: false });
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  updater.emit("update-downloaded", { ...release, downloadedFile: "FlashFront.exe", releaseNotes: "Spawn alerts" });
  expect(publish).toHaveBeenLastCalledWith({ version: "0.2.0", notes: "Spawn alerts", ready: true });
  control.restart(); expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  control.stop();
});
it("catches failed downloads and synchronous failures too", async () => {
  vi.useFakeTimers(); const updater = client(); const log = vi.fn();
  vi.mocked(updater.checkForUpdates).mockImplementation(() => { throw new Error("unavailable"); });
  vi.mocked(updater.downloadUpdate).mockRejectedValue(new Error("offline"));
  const control = startUpdater(updater, vi.fn(), log);
  updater.emit("update-available", release);
  await vi.advanceTimersByTimeAsync(0); expect(log).toHaveBeenCalledTimes(1); control.stop();
});
