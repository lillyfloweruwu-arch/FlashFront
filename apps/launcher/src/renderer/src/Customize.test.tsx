// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockDataSource, sweetSpotFraction } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi } from "../../shared";
import { LayoutEditor, PANEL_TITLES } from "./LayoutEditor";
import { StreamStudio, streamUrl } from "./StreamStudio";
import { LESSONS, TrainingSession, TrainingRoom } from "./TrainingRoom";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
it("builds a stream URL preserving top players and the selected scale and anchor", () => {
  const url = new URL(streamUrl({ widgets: ["stats", "top"], scale: 1.25, anchor: "br" }));
  expect(url.origin + url.pathname).toBe("http://127.0.0.1:47474/obs");
  expect(url.searchParams.get("widgets")).toBe("stats,top"); expect(url.searchParams.get("scale")).toBe("1.25"); expect(url.searchParams.get("anchor")).toBe("br");
});
it("saves layout presets and resets only the selected resolution", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const latest = { ...DEFAULT_SETTINGS, reserveFloor: 55 };
  const saveSettings = vi.fn(async () => {});
  const api = { getState: async () => ({ settings: latest }), saveSettings } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<LayoutEditor api={api} settings={DEFAULT_SETTINGS} />));
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="HUD preset"] [role="radio"]')].find(b => b.textContent === "Economy")!.click());
    expect(saveSettings).toHaveBeenLastCalledWith({ ...latest, hudPreset: "economy" });
    expect(JSON.parse(localStorage.getItem("flashfront.hud.v5.1920x1080")!).attack.hidden).toBe(true);
    localStorage.setItem("flashfront.hud.v5.1280x720", "keep");
    await act(async () => (host.querySelector('[data-reset-layout]') as HTMLButtonElement).click());
    expect(localStorage.getItem("flashfront.hud.v5.1920x1080")).toBeNull();
    expect(localStorage.getItem("flashfront.hud.v5.1280x720")).toBe("keep");
  } finally { await act(async () => root.unmount()); }
});
it("keeps the top widget in studio preview and saves privacy against the latest settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const latest = { ...DEFAULT_SETTINGS, reserveFloor: 55 }, saveSettings = vi.fn(async () => {});
  const api = { getState: async () => ({ settings: latest }), saveSettings } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<StreamStudio api={api} settings={DEFAULT_SETTINGS} snapshot={new MockDataSource().getSnapshot()} />));
    expect(host.querySelector('[data-widget="top"]')).not.toBeNull();
    await act(async () => (host.querySelector('[aria-label="Hide own troops and gold"]') as HTMLInputElement).click());
    await act(async () => (host.querySelector('[data-save-stream]') as HTMLButtonElement).click());
    expect(saveSettings).toHaveBeenCalledWith({ ...latest, obsHideOwnNumbers: true });
    expect(host.textContent).toContain("Hidden");
  } finally { await act(async () => root.unmount()); }
});
it("scales the 1920x1080 stream canvas to the preview box width and shows Save only for changed delay or privacy", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resize: (() => void) | undefined;
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  const api = { getState: async () => ({ settings: DEFAULT_SETTINGS }), saveSettings: vi.fn(async () => {}) } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    localStorage.setItem("flashfront.stream.v1", "?widgets=card&scale=1&anchor=br");
    await act(async () => root.render(<StreamStudio api={api} settings={DEFAULT_SETTINGS} snapshot={new MockDataSource().getSnapshot()} />));
    const box = host.querySelector<HTMLElement>(".studio-preview")!;
    Object.defineProperty(box, "clientWidth", { configurable: true, value: 960 });
    await act(async () => resize!());
    const screen = host.querySelector<HTMLElement>(".studio-screen")!;
    expect(screen.style.transform).toBe("scale(0.5)");
    expect(box.style.height).toBe("540px");
    // The chosen anchor positions the widget inside the scaled canvas.
    expect(screen.querySelector(".stream-root")!.classList.contains("anchor-br")).toBe(true);
    // Unchanged: a neutral "Saved" status, no disabled button.
    expect(host.querySelector("[data-save-stream]")).toBeNull();
    expect(host.querySelector("[data-stream-saved]")!.textContent).toBe("Saved");
    await act(async () => radio(host, "Stream delay", "30s").click());
    expect(host.querySelector("[data-stream-saved]")).toBeNull();
    expect((host.querySelector("[data-save-stream]") as HTMLButtonElement).disabled).toBe(false);
  } finally { await act(async () => root.unmount()); }
});
it("runs each 40-second lesson to its end with scripted input and specific feedback", () => {
  for (const lesson of LESSONS) {
    const session = new TrainingSession(lesson.id);
    expect(session.state.elapsedSec).toBe(0); expect(session.state.done).toBe(false);
    session.choose(lesson.choices[0]!.id);
    session.advance(39.9); expect(session.state.done).toBe(false);
    session.advance(0.1); expect(session.state.done).toBe(true);
    expect(session.state.elapsedSec).toBe(40);
    expect(session.answer(lesson.correct)).toMatchObject({ correct: true });
    expect(session.answer("wrong").correct).toBe(false);
    session.advance(100); expect(session.state.elapsedSec).toBe(40);
  }
  const held = new TrainingSession("recover"), sent = new TrainingSession("recover");
  held.choose("hold"); sent.choose("send"); held.advance(10); sent.advance(10);
  expect(held.state.snapshot.self!.troops).toBeGreaterThan(sent.state.snapshot.self!.troops);
  held.advance(30);
  expect(held.state.snapshot.self!.troops / held.state.snapshot.self!.maxTroops).toBeGreaterThanOrEqual(sweetSpotFraction(held.state.snapshot.self!.maxTroops));
  const spend = new TrainingSession("gold"); spend.choose("spend");
  expect(spend.state.snapshot.self!.cityLevels).toBe(1);
});
it("stops training timers on leaving and shows the lesson question at 40 seconds", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const host = document.createElement("div"), root = createRoot(host);
  await act(async () => root.render(<TrainingRoom />));
  await act(async () => (host.querySelector('[data-training-start]') as HTMLButtonElement).click());
  await act(async () => { vi.advanceTimersByTime(40_000); });
  expect(host.textContent).toContain(LESSONS[0]!.question);
  await act(async () => root.unmount()); expect(vi.getTimerCount()).toBe(0);
});

const radio = (host: HTMLElement, group: string, text: string) => [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] [role="radio"]`)].find(b => b.textContent === text)!;
it("edits the selected layout panel in a 240px inspector with segmented presets, Fit / 100% and no opacity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const api = { getState: async () => ({ settings: DEFAULT_SETTINGS }), saveSettings: vi.fn(async () => {}) } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<LayoutEditor api={api} settings={DEFAULT_SETTINGS} />));
    expect(host.querySelector("select")).toBeNull();
    expect([...host.querySelectorAll('[aria-label="HUD preset"] [role="radio"]')].map(b => b.textContent)).toEqual(["Minimal", "Learning", "Economy", "Custom"]);
    // The first module on the canvas is selected by default, so the inspector never opens empty.
    const first = host.querySelector<HTMLElement>(".layout-canvas [data-panel]")!.getAttribute("data-panel")!;
    expect(host.querySelector('[aria-label="Selected panel"] h2')!.textContent).toBe(PANEL_TITLES[first as keyof typeof PANEL_TITLES]);
    expect(host.querySelector("style")!.textContent).toContain(`[data-panel="${first}"]`);
    const attack = host.querySelector<HTMLElement>('[data-panel="attack"]')!;
    await act(async () => { attack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    expect(host.querySelector('[aria-label="Selected panel"] h2')!.textContent).toBe("Attack preview");
    expect(host.querySelector("style")!.textContent).toContain('[data-panel="attack"]');
    expect(host.querySelector('[aria-label="Selected panel"]')!.textContent).not.toMatch(/opacity/i);
    await act(async () => radio(host, "Panel visibility", "Hidden").click());
    const saved = JSON.parse(localStorage.getItem("flashfront.hud.v5.1920x1080")!);
    expect(saved.attack).toMatchObject({ hidden: true, opacity: 1 });
    const map = host.querySelector<HTMLElement>(".layout-editor-map")!;
    expect(map.style.transform).not.toBe("scale(1)");
    await act(async () => radio(host, "Preview zoom", "100%").click());
    expect(host.querySelector<HTMLElement>(".layout-editor-map")!.style.transform).toBe("scale(1)");
  } finally { await act(async () => root.unmount()); }
});
it("puts the stream preview first with Lobby / Playing / Result states, a copyable OBS source and the raw URL behind a disclosure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const writeText = vi.fn(async () => {}); vi.stubGlobal("navigator", { clipboard: { writeText } });
  const api = { getState: async () => ({ settings: DEFAULT_SETTINGS }), saveSettings: vi.fn(async () => {}) } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<StreamStudio api={api} settings={DEFAULT_SETTINGS} snapshot={new MockDataSource().getSnapshot()} />));
    expect(host.querySelector("select")).toBeNull();
    const all = [...host.querySelectorAll("*")];
    expect(all.indexOf(host.querySelector(".studio-preview")!)).toBeLessThan(all.indexOf(host.querySelector(".studio-settings")!));
    expect(host.textContent).toContain("OBS source · 1920x1080");
    expect(host.querySelector("details.raw-url code")!.textContent).toBe(streamUrl({ widgets: ["card", "stats", "top", "lobby", "result"], scale: 1, anchor: "tl" }));
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Copy")!.click());
    expect(writeText).toHaveBeenCalledWith(host.querySelector("details.raw-url code")!.textContent);
    // Playing: no lobby or result cells.
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card", "stats", "top"]);
    await act(async () => radio(host, "Preview state", "Lobby").click());
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card", "lobby"]);
    await act(async () => radio(host, "Preview state", "Result").click());
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card", "result"]);
    expect(host.querySelector('[data-widget="result"]')!.textContent).toContain("#4");
    await act(async () => radio(host, "Stream delay", "30s").click());
    await act(async () => (host.querySelector("[data-save-stream]") as HTMLButtonElement).click());
    expect(api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, obsDelaySec: 30 });
  } finally { await act(async () => root.unmount()); }
});
it("runs training as one sequence: segmented scenario, one red Run example, Pause while running, Restart secondary", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<TrainingRoom />));
    expect([...host.querySelectorAll('[aria-label="Scenario"] [role="radio"]')].map(b => b.textContent)).toEqual(LESSONS.map(l => l.title));
    const primary = host.querySelectorAll(".ff-button-primary");
    expect(primary).toHaveLength(1); expect(primary[0]!.textContent).toBe("Run example");
    expect(host.textContent).not.toMatch(/internal/i); expect(host.textContent).not.toContain("Of capacity");
    await act(async () => radio(host, "Example choice", LESSONS[0]!.choices[1].label).click());
    await act(async () => (primary[0] as HTMLButtonElement).click());
    expect(host.querySelector(".ff-button-primary")!.textContent).toBe("Pause");
    await act(async () => { vi.advanceTimersByTime(1_000); });
    await act(async () => (host.querySelector(".ff-button-primary") as HTMLButtonElement).click());
    expect(host.querySelector(".ff-button-primary")!.textContent).toBe("Run example");
    const restart = [...host.querySelectorAll("button")].find(b => b.textContent === "Restart")!;
    expect(restart.className).not.toContain("primary");
    await act(async () => radio(host, "Scenario", LESSONS[2]!.title).click());
    await act(async () => (host.querySelector("[data-training-start]") as HTMLButtonElement).click());
    await act(async () => { vi.advanceTimersByTime(40_000); });
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Lesson question"] button')][0]!.click());
    expect(host.textContent).not.toMatch(/internal/i);
  } finally { await act(async () => root.unmount()); }
});
