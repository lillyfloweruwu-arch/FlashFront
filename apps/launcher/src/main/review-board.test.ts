import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import type { BrowserWindow, WebContentsView } from "electron";
import { ReviewBoardController } from "./review-board";
const payload = { status: "ready" as const, value: { data: { engineCommit: "x", snapshotFormat: "1", startTick: 0, endTick: 900, ownClientId: "me", gameStartInfo: {}, opponents: [], coach: [] }, snapshot: new Uint8Array([1]) } };
function setup() {
  const contents = Object.assign(new EventEmitter(), { mainFrame: {}, loadURL: vi.fn(async () => {}), close: vi.fn(), isDestroyed: () => false, setWindowOpenHandler: vi.fn(), send: vi.fn() });
  const view = { webContents: contents, setBounds: vi.fn(), setVisible: vi.fn() };
  const win = { contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }), webContents: { mainFrame: {} } };
  let inMatch = false;
  const deps = { createView: vi.fn(() => view as unknown as WebContentsView), launcher: () => win as unknown as BrowserWindow, preload: "review.cjs", dev: true,
    inMatch: () => inMatch, prepare: vi.fn(async () => payload), seek: vi.fn(async () => payload), cancel: vi.fn(), status: vi.fn(), step: vi.fn() };
  return { view, contents, win, deps, controller: new ReviewBoardController(deps), match: () => { inMatch = true; } };
}
it("embeds an isolated view and closes it with its worker", async () => {
  const s = setup();
  await s.controller.open("one.json", { x: 10, y: 20, width: 500, height: 400 });
  expect(s.win.contentView.addChildView).toHaveBeenCalledWith(s.view);
  expect(s.deps.createView).toHaveBeenCalledWith(expect.objectContaining({ webPreferences: expect.objectContaining({ sandbox: true, nodeIntegration: false, contextIsolation: true }) }));
  expect(await s.controller.load()).toEqual(payload);
  s.controller.close();
  expect(s.contents.close).toHaveBeenCalled();
  expect(s.win.contentView.removeChildView).toHaveBeenCalledWith(s.view);
  expect(s.deps.cancel).toHaveBeenCalled();
});
it("blocks live matches and ignores late preparations after teardown", async () => {
  const s = setup(); s.match();
  await s.controller.open("one.json", { x: 0, y: 0, width: 500, height: 400 });
  expect(s.deps.createView).not.toHaveBeenCalled();
  expect(s.deps.status).toHaveBeenCalledWith({ status: "unavailable", reason: "inMatch" });
  const t = setup(); let finish!: (r: typeof payload) => void;
  t.deps.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const opening = t.controller.open("one.json", { x: 0, y: 0, width: 500, height: 400 });
  t.controller.close(); finish(payload); await opening;
  expect(t.deps.createView).not.toHaveBeenCalled();
});
it("clamps the board to the launcher and hides an offscreen rectangle", async () => {
  const s = setup(); await s.controller.open("one.json", { x: -20, y: 30, width: 600, height: 400 });
  expect(s.view.setBounds).toHaveBeenCalledWith({ x: 0, y: 30, width: 580, height: 400 });
  s.controller.resize({ x: 2000, y: 0, width: 500, height: 400 });
  expect(s.view.setVisible).toHaveBeenLastCalledWith(false);
  s.controller.close();
});

it("does not reveal the previous board when its ready arrives during a seek", async () => {
  const s = setup(); await s.controller.open("one.json", { x: 0, y: 0, width: 500, height: 400 });
  let finish!: (r: typeof payload) => void;
  s.deps.seek.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const seeking = s.controller.seek(300);
  s.controller.ready(0);
  expect(s.view.setVisible).toHaveBeenLastCalledWith(false);
  expect(s.deps.status).toHaveBeenLastCalledWith({ status: "loading" });
  finish({ ...payload, value: { ...payload.value, data: { ...payload.value.data, startTick: 300 } } }); await seeking;
  s.controller.ready(300); expect(s.view.setVisible).toHaveBeenLastCalledWith(true);
  s.controller.close();
});

it("ignores a destroyed view crash after a replacement has opened", async () => {
  const s = setup(), replacement = setup();
  await s.controller.open("one.json", { x: 0, y: 0, width: 500, height: 400 });
  s.deps.createView.mockReturnValue(replacement.view as unknown as WebContentsView);
  await s.controller.open("two.json", { x: 0, y: 0, width: 500, height: 400 });
  s.contents.emit("render-process-gone");
  expect(replacement.contents.close).not.toHaveBeenCalled();
  expect(s.controller.load().status).toBe("ready");
  s.controller.close();
});
