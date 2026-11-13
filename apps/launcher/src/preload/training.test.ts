import { expect, it, vi } from "vitest";
import type { TrainingBridgeApi, LauncherApi } from "../shared";
const bridge = vi.hoisted(() => ({ exposed: new Map<string, unknown>(), invoke: vi.fn(), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() }));
vi.mock("electron", () => ({ contextBridge: { exposeInMainWorld: (name: string, api: unknown) => bridge.exposed.set(name, api) }, ipcRenderer: bridge }));
import "./training";
import "./index";

it("exposes only the four dedicated Training operations", async () => {
  const api = bridge.exposed.get("flashfrontTraining") as TrainingBridgeApi;
  expect(Object.keys(api).sort()).toEqual(["close", "load", "ready", "report"]);
  await api.load(); expect(bridge.invoke).toHaveBeenCalledWith("training-load");
  api.ready(); expect(bridge.send).toHaveBeenCalledWith("training-ready");
  api.report({ kind: "passed", verdict: "Great" }); expect(bridge.send).toHaveBeenCalledWith("training-report", { kind: "passed", verdict: "Great" });
  api.close(); expect(bridge.send).toHaveBeenCalledWith("training-close");
});
it("starts Training and unsubscribes without exposing the IPC event", async () => {
  const api = bridge.exposed.get("flashfront") as LauncherApi;
  const request = { kind: "prepared" as const, drillId: "ally-02" }, outcome = { kind: "left" as const };
  await api.startTraining(request); expect(bridge.invoke).toHaveBeenCalledWith("training-start", request);
  const cb = vi.fn(), off = api.onTrainingEnded(cb);
  const listener = bridge.on.mock.calls.find(([channel]) => channel === "training-ended")![1];
  listener({ sender: "private" }, request, outcome); expect(cb).toHaveBeenCalledExactlyOnceWith(request, outcome);
  off(); expect(bridge.removeListener).toHaveBeenCalledWith("training-ended", listener);
});
