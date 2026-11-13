import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainingWindow, BOOT_TIMEOUT_MS, wireTrainingIpc, trainingNetworkAllowed } from "./training-window";
import type { TrainingDeps } from "./training";

class FakeWindow extends EventEmitter {
  webContents = Object.assign(new EventEmitter(), { mainFrame: {}, setWindowOpenHandler: vi.fn() });
  destroyed = false;
  destroy = vi.fn(() => { this.destroyed = true; this.emit("closed"); });
  isDestroyed = () => this.destroyed;
  focus = vi.fn();
  loadURL = vi.fn(async () => {});
}
let dir: string, win: FakeWindow, controller: TrainingWindow, inMatch: boolean;
let deps: ConstructorParameters<typeof TrainingWindow>[0];
const request = { kind: "prepared" as const, drillId: "ally-02" };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ff-training-window-"));
  await mkdir(join(dir, "renderer"));
  await writeFile(join(dir, "renderer", "training.html"), "board");
  await writeFile(join(dir, "package.json"), "private");
  for (const suffix of ["json", "snapshot.bin"]) await writeFile(join(dir, `ally-02.${suffix}`), await readFile(new URL(`../../resources/training/drills/client/ally-02.${suffix}`, import.meta.url)));
  inMatch = false; win = new FakeWindow();
  deps = {
    createWindow: vi.fn(() => win as unknown as BrowserWindow), bounds: () => ({ x: 30, y: 40, width: 800, height: 600 }),
    preload: "training.cjs", rendererDir: join(dir, "renderer"), drillsDir: dir,
    training: { inMatch: () => inMatch, cacheDir: dir, manifest: async () => ({ upstream: { commit: "engine" }, maps: [{ key: "europe", id: "Europe", files: {} }] }) } as TrainingDeps,
    loadMap: vi.fn(async () => ({ status: "ready" as const, value: { mapId: "Europe", mapSize: "Compact" as const, manifest: {}, map4xBin: new Uint8Array([1]), map16xBin: new Uint8Array([2]) } })),
    preferences: () => ({ lite: true, reducedMotion: true }),
    drills: { complete: vi.fn(async () => {}), recordVisit: vi.fn(async () => {}) }, ended: vi.fn(), log: vi.fn(),
  };
  controller = new TrainingWindow(deps);
});
afterEach(async () => { controller.close({ kind: "left" }); vi.useRealTimers(); await rm(dir, { recursive: true, force: true }); });
it("load returns ready for a prepared drill", async () => {
  await controller.open(request);
  const result = await controller.load();
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("not ready");
  expect(result.snapshot).toEqual(new Uint8Array(await readFile(join(dir, "ally-02.snapshot.bin"))));
  expect(result).toMatchObject({ lite: true, reducedMotion: true, names: "generated", data: { drillId: "ally-02" } });
  expect(deps.createWindow).toHaveBeenCalledWith(expect.objectContaining({ frame: false, fullscreen: true, x: 30, y: 40, webPreferences: expect.objectContaining({ partition: "persist:training", sandbox: true, contextIsolation: true, nodeIntegration: false }) }));
});
it("commit mismatch is unsupportedVersion", async () => {
  const data = JSON.parse(await readFile(join(dir, "ally-02.json"), "utf8")); data.engineCommit = "other";
  await writeFile(join(dir, "ally-02.json"), JSON.stringify(data));
  await controller.open(request);
  expect(await controller.load()).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
  expect(deps.loadMap).not.toHaveBeenCalled();
});
it("missing map is missingMap", async () => {
  deps.loadMap = vi.fn(async () => ({ status: "unavailable" as const, reason: "missingMap" as const }));
  await controller.open(request); expect(await controller.load()).toEqual({ status: "unavailable", reason: "missingMap" });
});
it("boot timeout closes with bootFailed", async () => {
  vi.useFakeTimers(); await controller.open(request); await vi.advanceTimersByTimeAsync(BOOT_TIMEOUT_MS);
  expect(win.destroy).toHaveBeenCalledOnce(); expect(deps.ended).toHaveBeenCalledWith(request, { kind: "error", reason: "bootFailed" }); expect(deps.log).toHaveBeenCalled();
});
it("ready cancels the timeout and crashes still close", async () => {
  vi.useFakeTimers(); await controller.open(request); await controller.load(); controller.ready();
  await vi.advanceTimersByTimeAsync(BOOT_TIMEOUT_MS); expect(win.destroy).not.toHaveBeenCalled();
  win.webContents.emit("render-process-gone", {}, { reason: "crashed" });
  await vi.waitFor(() => expect(deps.ended).toHaveBeenCalledWith(request, { kind: "error", reason: "bootFailed" }));
});
it("live match closes as left", async () => {
  await controller.open(request); inMatch = true; controller.matchChanged();
  expect(win.destroy).toHaveBeenCalledOnce(); await vi.waitFor(() => expect(deps.ended).toHaveBeenCalledWith(request, { kind: "left" }));
  expect(deps.drills.complete).not.toHaveBeenCalled(); expect(deps.drills.recordVisit).toHaveBeenCalledWith("ally-02");
});
it("second open reuses the window and replaces the drill", async () => {
  await controller.open(request); await controller.open({ kind: "prepared", drillId: "ally-03" });
  expect(deps.createWindow).toHaveBeenCalledOnce(); expect(win.focus).toHaveBeenCalled(); expect(win.loadURL).toHaveBeenCalledTimes(2);
  controller.close({ kind: "left" }); await vi.waitFor(() => expect(deps.ended).toHaveBeenLastCalledWith({ kind: "prepared", drillId: "ally-03" }, { kind: "left" }));
});
it("scheme serves only renderer and prepared map files", async () => {
  expect((await controller.serve("fftraining://app/")).status).toBe(200);
  for (const url of ["fftraining://app/../package.json", "fftraining://app/%2e%2e/package.json", "fftraining://app/%2e%2e%5cpackage.json", "fftraining://other/training.html", "fftraining://app/maps/europe/map4x.bin"]) expect((await controller.serve(url)).status).toBe(404);
  await mkdir(join(dir, "engine", "europe"), { recursive: true }); await writeFile(join(dir, "engine", "europe", "map4x.bin"), new Uint8Array([1]));
  await controller.open(request); await controller.load();
  expect(new Uint8Array(await (await controller.serve("fftraining://app/maps/europe/map4x.bin")).arrayBuffer())).toEqual(new Uint8Array([1]));
});
it("rejects foreign senders and subframes on every IPC", async () => {
  const handlers = new Map<string, Function>(); const launcher = new FakeWindow();
  wireTrainingIpc({ handle: (name: string, fn: Function) => handlers.set(name, fn), on: (name: string, fn: Function) => handlers.set(name, fn) } as any, controller, () => launcher as unknown as BrowserWindow);
  await controller.open(request);
  for (const channel of ["training-load", "training-ready", "training-report", "training-close", "training-start"]) {
    const owner = channel === "training-start" ? launcher : win;
    for (const event of [{ sender: {}, senderFrame: owner.webContents.mainFrame }, { sender: owner.webContents, senderFrame: {} }]) {
      if (channel === "training-load" || channel === "training-start") await expect(async () => handlers.get(channel)!(event, request)).rejects.toThrow();
      else expect(() => handlers.get(channel)!(event, { kind: "left" })).not.toThrow();
    }
  }
  expect(controller.isOpen()).toBe(true);
  expect(deps.ended).not.toHaveBeenCalled();
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  expect((await handlers.get("training-load")!(event)).status).toBe("ready");
  handlers.get("training-report")!(event, { kind: "passed", verdict: "Blunder" });
  expect(controller.isOpen()).toBe(true);
  handlers.get("training-report")!(event, { kind: "passed", verdict: "Great" });
  await vi.waitFor(() => expect(deps.ended).toHaveBeenCalledWith(request, { kind: "passed", verdict: "Great" }));
});
it("does not resurrect a load closed while its map is being unpacked", async () => {
  const loadMap = deps.loadMap!;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  deps.loadMap = vi.fn(async (training, mapId, mapSize) => { await waiting; return loadMap(training, mapId, mapSize); });
  await controller.open(request); const result = controller.load();
  await vi.waitFor(() => expect(deps.loadMap).toHaveBeenCalled());
  inMatch = true; controller.matchChanged(); release();
  expect(await result).toEqual({ status: "unavailable", reason: "cancelled" });
  expect(controller.isOpen()).toBe(false);
  expect((await controller.serve("fftraining://app/maps/europe/map4x.bin")).status).toBe(404);
});
it("does not create a window during a match and validates request paths", async () => {
  await expect(controller.open({ kind: "prepared", drillId: "../secret" })).rejects.toThrow();
  inMatch = true; await controller.open(request);
  expect(deps.createWindow).not.toHaveBeenCalled();
  expect(deps.ended).toHaveBeenCalledWith(request, { kind: "error", reason: "inMatch" });
});
it("native close emits one left outcome and cancels the boot timer", async () => {
  vi.useFakeTimers(); await controller.open(request); win.destroy();
  await vi.advanceTimersByTimeAsync(BOOT_TIMEOUT_MS);
  expect(deps.ended).toHaveBeenCalledExactlyOnceWith(request, { kind: "left" });
  expect(deps.log).not.toHaveBeenCalled();
});
it("records a passed drill once and denies navigation", async () => {
  await controller.open(request); const preventDefault = vi.fn(); win.webContents.emit("will-navigate", { preventDefault });
  expect(preventDefault).toHaveBeenCalled(); expect(win.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: "deny" });
  controller.close({ kind: "passed", verdict: "Good" }); controller.close({ kind: "left" });
  await vi.waitFor(() => expect(deps.ended).toHaveBeenCalledOnce());
  expect(deps.drills.complete).toHaveBeenCalledOnce(); expect(deps.ended).toHaveBeenCalledOnce();
});
it("blocks network except the dev origin and local Training scheme", () => {
  for (const url of ["https://openfront.io/maps/europe/map.bin", "http://127.0.0.1:5175/", "ws://127.0.0.1:9/blocked", "file:///secret"]) expect(trainingNetworkAllowed(url, true)).toBe(false);
  expect(trainingNetworkAllowed("http://127.0.0.1:5174/training.html", true)).toBe(true);
  expect(trainingNetworkAllowed("http://127.0.0.1:5174/training.html", false)).toBe(false);
  expect(trainingNetworkAllowed("fftraining://app/maps/europe/map.bin", false)).toBe(true);
});
it("notifies the hub only after passed progress is persisted", async () => {
  let finishSave!: () => void;
  deps.drills.complete = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve; }));
  await controller.open(request); controller.close({ kind: "passed", verdict: "Good" });
  await vi.waitFor(() => expect(deps.drills.complete).toHaveBeenCalled());
  expect(deps.ended).not.toHaveBeenCalled();
  finishSave();
  await vi.waitFor(() => expect(deps.ended).toHaveBeenCalledExactlyOnceWith(request, { kind: "passed", verdict: "Good" }));
});
it("still notifies the hub when progress persistence fails", async () => {
  deps.drills.recordVisit = vi.fn(async () => { throw new Error("disk unavailable"); });
  await controller.open(request); controller.close({ kind: "failed" });
  await vi.waitFor(() => expect(deps.log).toHaveBeenCalledWith("Training: progress could not be saved"));
  expect(deps.ended).toHaveBeenCalledExactlyOnceWith(request, { kind: "failed" });
});
it("aborts a pending retry and returns cancellation instead of its late error", async () => {
  let signal!: AbortSignal;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  deps.retry = vi.fn(async (_request, supplied) => { signal = supplied; await waiting; return { status: "unavailable", reason: "missingRecord" } as const; });
  await controller.open({ kind: "retry", file: "game.json", tick: 100, mistake: "sendSize" });
  const loading = controller.load();
  controller.close({ kind: "left" }); expect(signal.aborted).toBe(true); release();
  expect(await loading).toEqual({ status: "unavailable", reason: "cancelled" });
});
