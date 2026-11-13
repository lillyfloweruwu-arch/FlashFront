import type { ReviewBridgeApi, ReviewLoad } from "../review-types";

/** Subscribe before loading, but never let that initial IPC reply replace a newer seek. */
export function subscribeReviewLoads(api: ReviewBridgeApi, show: (load: ReviewLoad) => Promise<void>) {
  let active = true, receivedSnapshot = false;
  const off = api.onSnapshot(load => {
    if (!active) return;
    receivedSnapshot = true;
    void show(load).catch(() => { if (active) api.failed(); });
  });
  const ready = api.load().then(async load => { if (active && !receivedSnapshot) await show(load); });
  return { ready, dispose() { active = false; off(); } };
}
