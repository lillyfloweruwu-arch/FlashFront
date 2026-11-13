// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import type { TrainingLoad } from "../shared";
const mock = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), guard: vi.fn() }));
vi.mock("./offline-guard", () => ({ installOfflineGuard: mock.guard, trainingAllowed: () => true }));
vi.mock("./mute-audio", () => ({}));
vi.mock("./upstream-entry", () => ({}));
vi.mock("./runtime", () => ({ mountTraining: () => () => {} }));
vi.mock("./bridge", () => ({ createClientBridge: () => ({ start: mock.start, stop: mock.stop }) }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.start.mockResolvedValue(undefined);
  window.flashfrontTraining = { load: vi.fn(), ready: vi.fn(), report: vi.fn(), close: vi.fn() };
});
it("signals ready only after the real-client bridge becomes live", async () => {
  const data = { drillId: "ally-02" }, snapshot = new Uint8Array([1, 2]);
  vi.mocked(window.flashfrontTraining.load).mockResolvedValue({ status: "ready", data, snapshot, lite: true, reducedMotion: true, names: "generated" } as TrainingLoad);
  let live!: () => void;
  mock.start.mockImplementation(() => new Promise<void>(resolve => { live = resolve; }));
  await import("./entry");
  await vi.waitFor(() => expect(mock.start).toHaveBeenCalledWith(data, snapshot, "play"));
  expect(window.flashfrontTraining.ready).not.toHaveBeenCalled(); live();
  await vi.waitFor(() => expect(window.flashfrontTraining.ready).toHaveBeenCalledOnce());
  expect(window.__offsite).toEqual([]);
});
it("reports unavailable loads without starting a client", async () => {
  vi.mocked(window.flashfrontTraining.load).mockResolvedValue({ status: "unavailable", reason: "missingMap" });
  await import("./entry");
  await vi.waitFor(() => expect(window.flashfrontTraining.report).toHaveBeenCalledWith({ kind: "error", reason: "missingMap" }));
  expect(mock.start).not.toHaveBeenCalled(); expect(window.flashfrontTraining.ready).not.toHaveBeenCalled();
});
