import { contextBridge, ipcRenderer } from "electron";
import type { TrainingBridgeApi } from "../shared";

const api: TrainingBridgeApi = {
  load: () => ipcRenderer.invoke("training-load"),
  ready: () => ipcRenderer.send("training-ready"),
  report: outcome => ipcRenderer.send("training-report", outcome),
  close: () => ipcRenderer.send("training-close"),
};
contextBridge.exposeInMainWorld("flashfrontTraining", api);
