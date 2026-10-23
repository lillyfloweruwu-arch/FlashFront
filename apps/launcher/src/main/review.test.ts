import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { MatchRecorder } from "@flashfront/core";
import { MatchFiles } from "./recorder";
vi.mock("electron", () => ({ app: { getPath: () => "fixture", setPath: vi.fn(), requestSingleInstanceLock: () => false, quit: vi.fn() },
  BrowserWindow: vi.fn(), clipboard: {}, globalShortcut: {}, ipcMain: {}, screen: {}, shell: {},
  dialog: { showSaveDialog: vi.fn() }, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1200, height: 630 }), toPNG: () => Buffer.from("png fixture") }) } }));
vi.mock("./foreground", () => ({ createForegroundProbe: () => () => null }));
import { annotateMatch, saveSharePng } from "./index";
import { dialog, type BrowserWindow } from "electron";
let directory: string | undefined;
afterEach(async () => { if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep + "flashfront-review-test-")) await rm(directory, { recursive: true, force: true }); vi.clearAllMocks(); });
it("round-trips a bookmark note in the same local recording, preserving concurrent notes", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-review-test-")); const files = new MatchFiles(directory);
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null); const m = r.finish()!;
  m.events = [{ kind: "bookmark", t: 42 }, { kind: "bookmark", t: 60 }]; const file = await files.save(m);
  await Promise.all([annotateMatch(files, file, 42, "First push"), annotateMatch(files, file, 60, "Recovered")]);
  expect((await files.get(file)).events).toEqual([{ kind: "bookmark", t: 42, note: "First push" }, { kind: "bookmark", t: 60, note: "Recovered" }]);
  expect(await files.list()).toHaveLength(1);
  await expect(annotateMatch(files, "../settings.json", 42, "no")).rejects.toThrow();
  await expect(annotateMatch(files, file, 12, "no")).rejects.toThrow("Bookmark");
  await expect(annotateMatch(files, file, 42, "x".repeat(501))).rejects.toThrow("note");
  await annotateMatch(files, file, 42, ""); expect((await files.get(file)).events[0]).toEqual({ kind: "bookmark", t: 42 });
});
it("validates share input, handles cancellation, and saves only to the dialog destination", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-review-test-")); const file = join(directory, "card.png");
  const win = {} as BrowserWindow; const header = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.write("IHDR", 12); header.writeUInt32BE(1200, 16); header.writeUInt32BE(630, 20); const data = `data:image/png;base64,${header.toString("base64")}`;
  await expect(saveSharePng(win, "not a PNG")).rejects.toThrow("PNG"); expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: true, filePath: "" });
  expect(await saveSharePng(win, data)).toBe(false);
  vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: false, filePath: file });
  expect(await saveSharePng(win, data)).toBe(true); expect(await readFile(file, "utf8")).toBe("png fixture");
});
