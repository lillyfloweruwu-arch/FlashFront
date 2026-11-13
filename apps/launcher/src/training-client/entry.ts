import { installOfflineGuard, trainingAllowed } from "./offline-guard";
import type { TrainingBridgeApi } from "../shared";

declare global { interface Window { flashfrontTraining: TrainingBridgeApi; __offsite: string[] } }

// No upstream static imports: their module bodies must run AFTER the guard and bootstrap config.
window.__offsite = [];
installOfflineGuard(url => trainingAllowed(url, location.origin),
  url => { window.__offsite.push(url); console.warn("[training] blocked", url); });
window.BOOTSTRAP_CONFIG = {
  gameEnv: "dev", turnstileSiteKey: "", jwtAudience: "localhost",
  gitCommit: "14ba82badb1e945ef2e758999238339404fdb788", assetManifest: {}, cdnBase: "",
};
localStorage.setItem("settings.tutorialDismissed", "true");
// Only English and its flag are vendored. Do not fetch a previously selected locale.
localStorage.setItem("lang", "en");

async function boot(): Promise<void> {
  const load = await window.flashfrontTraining.load();
  if (load.status === "unavailable") {
    window.flashfrontTraining.report({ kind: "error", reason: load.reason });
    return;
  }
  await import("./mute-audio");
  await import("./upstream-entry");
  document.body.append(Object.assign(document.createElement("lang-selector"), { hidden: true }));
  const { createClientBridge } = await import("./bridge");
  const bridge = createClientBridge();
  window.addEventListener("pagehide", () => bridge.stop(), { once: true });
  await bridge.start(load.data, load.snapshot, "play");
  const { mountTraining } = await import("./runtime");
  const dispose = mountTraining(bridge, load, window.flashfrontTraining);
  window.addEventListener("pagehide", dispose, { once: true });
  window.flashfrontTraining.ready();
}
void boot().catch(error => {
  console.error("Training failed to start", error);
  window.flashfrontTraining.report({ kind: "error", reason: "bootFailed" });
  const status = document.createElement("p");
  status.setAttribute("role", "alert");
  status.textContent = "Training unavailable. Close this window and try again.";
  document.body.append(status);
});
