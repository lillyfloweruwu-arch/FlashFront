import { installOfflineGuard, trainingAllowed } from "./offline-guard";
import type { ReviewBridgeApi, ReviewLoad } from "../review-types";
import { subscribeReviewLoads } from "./review-load";
declare global { interface Window { flashfrontReview: ReviewBridgeApi } }
window.__offsite = [];
installOfflineGuard(url => trainingAllowed(url, location.origin), url => window.__offsite.push(url));
window.BOOTSTRAP_CONFIG = { gameEnv: "dev", turnstileSiteKey: "", jwtAudience: "localhost", gitCommit: "14ba82badb1e945ef2e758999238339404fdb788", assetManifest: {}, cdnBase: "" };
localStorage.setItem("settings.tutorialDismissed", "true");
localStorage.setItem("lang", "en");
async function boot(): Promise<void> {
  await import("./mute-audio");
  await import("./upstream-entry");
  await import("./review.css");
  document.body.classList.add("review-map");
  document.body.append(Object.assign(document.createElement("lang-selector"), { hidden: true }));
  const { createClientBridge } = await import("./bridge");
  const bridge = createClientBridge();
  let generation = 0;
  const show = async (load: ReviewLoad) => {
    const current = ++generation;
    bridge.stop();
    if (load.status !== "ready") { window.flashfrontReview.failed(); return; }
    try {
      await bridge.startReplay(load.value.data, load.value.snapshot);
      if (current === generation) window.flashfrontReview.ready(load.value.data.startTick);
    } catch { if (current === generation) window.flashfrontReview.failed(); }
  };
  const connection = subscribeReviewLoads(window.flashfrontReview, show);
  window.addEventListener("pagehide", () => { generation++; connection.dispose(); bridge.stop(); }, { once: true });
  await connection.ready;
}
void boot().catch(() => window.flashfrontReview.failed());
