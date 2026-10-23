import { expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ api: undefined as unknown as LauncherApi, invoke: vi.fn(), send: vi.fn(), on: vi.fn(), remove: vi.fn() }));
vi.mock("electron", () => ({ contextBridge: { exposeInMainWorld: (_name: string, api: LauncherApi) => { bridge.api = api; } }, ipcRenderer: { invoke: bridge.invoke, send: bridge.send, on: bridge.on, removeListener: bridge.remove } }));
import "./index";
import type { LauncherApi } from "../shared";
it("exposes the update and support handlers", async () => {
  await bridge.api.restartToUpdate(); expect(bridge.invoke).toHaveBeenCalledWith("update-restart");
  await bridge.api.suggestIdea(); expect(bridge.invoke).toHaveBeenCalledWith("feedback-open");
  await bridge.api.previewSupportReport(); expect(bridge.invoke).toHaveBeenCalledWith("support-preview");
  await bridge.api.copySupportReport(); expect(bridge.invoke).toHaveBeenCalledWith("support-copy");
  const decision = { kind: "recovery" as const, text: "Recovering", tone: "warning" as const };
  bridge.api.reportDecision("own", 1000, decision); expect(bridge.send).toHaveBeenCalledWith("overlay-decision", "own", 1000, decision);
});
it("exposes only review payloads and removes its matches-changed listener", async () => {
  const api = bridge.api; const changed = vi.fn();
  const off = api.onMatchesChanged(changed); const listener = bridge.on.mock.calls[0]![1]; listener({ sender: "not exposed" });
  expect(changed).toHaveBeenCalledWith(); off(); expect(bridge.remove).toHaveBeenCalledWith("matches-changed", listener);
  await api.annotateMatch("recording.json", 42, "my note"); expect(bridge.invoke).toHaveBeenCalledWith("matches-annotate", "recording.json", 42, "my note");
  await api.saveShare("data:image/png;base64,..."); expect(bridge.invoke).toHaveBeenCalledWith("share-save", "data:image/png;base64,...");
});
it("exposes the What is new release-notes opener with the version argument", async () => {
  await bridge.api.openReleaseNotes("0.2.1"); expect(bridge.invoke).toHaveBeenCalledWith("release-notes-open", "0.2.1");
});
