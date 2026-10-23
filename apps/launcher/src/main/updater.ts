import type { AppUpdater } from "electron-updater";
import type { LauncherState } from "../shared";

export type UpdateClient = Pick<AppUpdater, "autoDownload" | "autoInstallOnAppQuit" | "logger" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall" | "on" | "removeListener" | "emit">;
type Release = { version: string; releaseNotes?: string | { version: string; note: string | null }[] | null };
const notes = (info: Release) => typeof info.releaseNotes === "string" ? info.releaseNotes : info.releaseNotes?.map(note => note.note ?? "").join("\n\n") ?? "";

export function startUpdater(updater: UpdateClient, publish: (update: LauncherState["update"]) => void, log: (message: string) => void = console.warn) {
  let stopped = false; let checking = false; let downloading = false; let ready = false; let logged = false;
  const failed = () => { if (!stopped && !logged) { logged = true; log("FlashFront update check or download unavailable; retrying later."); } };
  updater.logger = null;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  const available = (info: Release) => {
    if (stopped || ready || downloading) return;
    publish({ version: info.version, notes: notes(info), ready: false });
    downloading = true;
    void (async () => { try { await updater.downloadUpdate(); } catch { failed(); } finally { downloading = false; } })();
  };
  const downloaded = (info: Release) => {
    if (stopped) return;
    ready = true; publish({ version: info.version, notes: notes(info), ready: true });
  };
  updater.on("error", failed); updater.on("update-available", available); updater.on("update-downloaded", downloaded);
  const check = async () => {
    if (stopped || checking || downloading || ready) return;
    checking = true;
    try { await updater.checkForUpdates(); } catch { failed(); } finally { checking = false; }
  };
  void check(); const timer = setInterval(() => void check(), 6 * 60 * 60 * 1000);
  return {
    restart() { if (ready) { try { updater.quitAndInstall(false, true); } catch { failed(); } } },
    stop() {
      stopped = true; clearInterval(timer);
      updater.removeListener("update-available", available); updater.removeListener("update-downloaded", downloaded);
      // Keep the error listener through shutdown: a pending network request may still reject.
    },
  };
}
