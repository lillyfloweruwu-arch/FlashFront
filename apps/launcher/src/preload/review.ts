import { contextBridge, ipcRenderer } from "electron";
import type { ReviewBridgeApi, ReviewLoad } from "../review-types";
const api: ReviewBridgeApi = {
  load: () => ipcRenderer.invoke("review-load"),
  onSnapshot(cb) { const listener = (_event: unknown, load: ReviewLoad) => cb(load); ipcRenderer.on("review-snapshot", listener); return () => { ipcRenderer.removeListener("review-snapshot", listener); }; },
  ready: tick => ipcRenderer.send("review-ready", tick),
  failed: () => ipcRenderer.send("review-failed"),
  step: direction => ipcRenderer.send("review-step", direction),
};
contextBridge.exposeInMainWorld("flashfrontReview", api);
