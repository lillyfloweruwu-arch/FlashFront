// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockDataSource } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi, type Settings } from "../../shared";
import { LEGACY_STREAM_KEY, StreamStudio, streamUrl } from "./StreamStudio";

let host: HTMLDivElement; let root: Root; let resize: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); localStorage.clear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear(); });
const radio = (label: string, text: string) => [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${label}"] [role="radio"]`)].find(b => b.textContent === text)!;
const button = (text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text);
const code = () => host.querySelector("details.raw-url code")!.textContent;
const render = (api: LauncherApi, settings: Settings) => act(async () => root.render(<StreamStudio api={api} settings={settings} snapshot={new MockDataSource().getSnapshot()} />));

it("previews the real public profile, or says it is unavailable, never a live identity", async () => {
  const stats = vi.fn(async () => ({ status: 200, body: { username: "Public self", stats: { Public: { total: "12", wins: "4" } } } }));
  await render({ stats } as unknown as LauncherApi, { ...DEFAULT_SETTINGS, publicId: "OWN12345" });
  expect(stats).toHaveBeenCalledWith("/api/player/OWN12345");
  expect(host.querySelector('[data-widget="card"]')!.textContent).toContain("Public self");
  await render({ stats } as unknown as LauncherApi, DEFAULT_SETTINGS);
  expect(host.querySelector('[data-widget="card"]')!.textContent).toContain("Profile unavailable");
  expect(host.textContent).not.toContain("Lobby");
});

it("saves widgets, scale, anchor, delay and privacy once, against the latest settings, and Cancel restores", async () => {
  const latest = { ...DEFAULT_SETTINGS, reserveFloor: 55 };
  const saveSettings = vi.fn(async () => {}); const writeText = vi.fn(async () => {}); vi.stubGlobal("navigator", { clipboard: { writeText } });
  const api = { getState: async () => ({ settings: latest }), saveSettings } as unknown as LauncherApi;
  await render(api, DEFAULT_SETTINGS);
  const before = code();
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
  await act(async () => radio("Widget anchor", "Bottom right").click());
  await act(async () => radio("Stream delay", "30s").click());
  await act(async () => (host.querySelector('[aria-label="Hide own troops and gold"]') as HTMLInputElement).click());
  expect(saveSettings).not.toHaveBeenCalled();
  expect(code()).toBe(before); expect(button("Copy")!.disabled).toBe(true);
  expect(host.querySelectorAll(".ff-button-primary")).toHaveLength(1);
  expect(host.querySelector(".ff-button-primary")!.textContent).toBe("Save stream settings");
  expect(host.querySelector(".studio-main.ff-glass")).not.toBeNull();
  expect(host.querySelector(".studio-settings.ff-glass")).not.toBeNull();
  expect(host.querySelector("h1.ff-page-title")!.textContent).toBe("Stream studio");
  expect(host.textContent).toContain("Save stream settings to copy this layout");
  expect(host.querySelector(".stream-root")!.classList.contains("anchor-br")).toBe(true);
  await act(async () => button("Cancel")!.click());
  expect(host.querySelector(".stream-root")!.classList.contains("anchor-tl")).toBe(true); expect(host.querySelector("[data-stream-saved]")).not.toBeNull();
  await act(async () => radio("Widget anchor", "Bottom right").click());
  await act(async () => radio("Stream delay", "30s").click());
  await act(async () => (host.querySelector("[data-save-stream]") as HTMLButtonElement).click());
  expect(saveSettings).toHaveBeenCalledTimes(1);
  expect(saveSettings).toHaveBeenCalledWith({ ...latest, obsDelaySec: 30, obsHideOwnNumbers: false, streamLayout: { widgets: ["card", "stats", "top", "result"], scale: 1, anchor: "br" } });
  expect(code()).toBe(streamUrl({ widgets: ["card", "stats", "top", "result"], scale: 1, anchor: "br" }));
  expect(button("Copy")!.disabled).toBe(false);
});

it("keeps the draft and the old URL when Save fails", async () => {
  const api = { getState: async () => ({ settings: DEFAULT_SETTINGS }), saveSettings: vi.fn(async () => { throw new Error("disk full"); }) } as unknown as LauncherApi;
  await render(api, DEFAULT_SETTINGS);
  const before = code();
  await act(async () => radio("Widget anchor", "Top right").click());
  await act(async () => (host.querySelector("[data-save-stream]") as HTMLButtonElement).click());
  expect(host.textContent).toContain("disk full"); expect(code()).toBe(before);
  expect(host.querySelector(".stream-root")!.classList.contains("anchor-tr")).toBe(true); expect(button("Copy")!.disabled).toBe(true);
});

it("migrates a legacy layout only when none is saved, removing the old key after a successful save", async () => {
  localStorage.setItem(LEGACY_STREAM_KEY, "?widgets=card,lobby&scale=2&anchor=bl");
  const saved: Settings = { ...DEFAULT_SETTINGS, streamLayout: { widgets: ["stats"], scale: 1, anchor: "tr" } };
  const saveSettings = vi.fn(async () => {});
  await render({ getState: async () => ({ settings: saved }), saveSettings } as unknown as LauncherApi, saved);
  expect(host.querySelector(".stream-root")!.classList.contains("anchor-tr")).toBe(true); expect(host.querySelector("[data-stream-saved]")).not.toBeNull();
  await act(async () => root.unmount()); root = createRoot(host);
  await render({ getState: async () => ({ settings: DEFAULT_SETTINGS }), saveSettings } as unknown as LauncherApi, DEFAULT_SETTINGS);
  expect(host.querySelector(".stream-root")!.classList.contains("anchor-bl")).toBe(true);
  expect(localStorage.getItem(LEGACY_STREAM_KEY)).not.toBeNull();
  await act(async () => (host.querySelector("[data-save-stream]") as HTMLButtonElement).click());
  expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ streamLayout: { widgets: ["card"], scale: 2, anchor: "bl" } }));
  expect(localStorage.getItem(LEGACY_STREAM_KEY)).toBeNull();
});

it("scales the 1920x1080 canvas to the preview width", async () => {
  await render({} as LauncherApi, DEFAULT_SETTINGS);
  const box = host.querySelector<HTMLElement>(".studio-preview")!;
  Object.defineProperty(box, "clientWidth", { configurable: true, value: 960 });
  await act(async () => resize!());
  expect(host.querySelector<HTMLElement>(".studio-screen")!.style.transform).toBe("scale(0.5)"); expect(box.style.height).toBe("540px");
});
