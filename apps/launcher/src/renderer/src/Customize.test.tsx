// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockDataSource } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi } from "../../shared";
import { LayoutEditor, PANEL_TITLES } from "./LayoutEditor";
import { Customize } from "./Customize";
import { StreamStudio, streamUrl } from "./StreamStudio";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
const radio = (host: HTMLElement, group: string, text: string) => [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] [role="radio"]`)].find(b => b.textContent === text)!;
it("combines themes, the draggable map preview and nudges, saving through the existing settings path", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const latest = { ...DEFAULT_SETTINGS, reserveFloor: 55 };
  const saveSettings = vi.fn(async () => {});
  const api = { getState: async () => ({ settings: latest }), saveSettings } as unknown as LauncherApi;
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<Customize api={api} settings={DEFAULT_SETTINGS} />));
    expect([...host.querySelectorAll("h1")].map(h => h.textContent)).toEqual(["Customize"]);
    expect(host.querySelectorAll(".theme-palette")).toHaveLength(4);
    expect(host.querySelector(".layout-map-art")!.getAttribute("src")).toBe("minimaps/europe.png");
    expect(host.querySelector(".layout-canvas .hud-layer.editing")).not.toBeNull();
    expect(host.querySelectorAll(".ff-button-primary")).toHaveLength(1);
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Save layout")!.click());
    expect(saveSettings).toHaveBeenLastCalledWith({ ...latest, hudPreset: DEFAULT_SETTINGS.hudPreset, textSize: DEFAULT_SETTINGS.textSize });
    await act(async () => host.querySelector<HTMLInputElement>('[role="switch"]')!.click());
    expect(saveSettings).toHaveBeenLastCalledWith({ ...latest, nudges: false });
    const toggle = host.querySelector<HTMLInputElement>(".panel-toggles input")!;
    const wasShown = toggle.checked;
    await act(async () => toggle.click());
    expect(JSON.parse(localStorage.getItem("flashfront.hud.v5.1920x1080")!).decision.hidden).toBe(wasShown);
  } finally { await act(async () => root.unmount()); }
});
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
it("puts the stream preview first with Menu / Playing / Result states, a copyable OBS source and the raw URL behind a disclosure", async () => {
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
    expect(host.querySelector("details.raw-url code")!.textContent).toBe(streamUrl({ widgets: ["card", "stats", "top", "result"], scale: 1, anchor: "tl" }));
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "Copy")!.click());
    expect(writeText).toHaveBeenCalledWith(host.querySelector("details.raw-url code")!.textContent);
    // Playing: no lobby or result cells.
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card", "stats", "top"]);
    await act(async () => radio(host, "Preview state", "Menu").click());
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card"]);
    await act(async () => radio(host, "Preview state", "Result").click());
    expect([...host.querySelectorAll("[data-widget]")].map(el => el.getAttribute("data-widget"))).toEqual(["card", "result"]);
    expect(host.querySelector('[data-widget="result"] .placement')!.textContent).toBe("4");
    await act(async () => radio(host, "Stream delay", "30s").click());
    await act(async () => (host.querySelector("[data-save-stream]") as HTMLButtonElement).click());
    expect(api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, obsDelaySec: 30, streamLayout: { widgets: ["card", "stats", "top", "result"], scale: 1, anchor: "tl" } });
  } finally { await act(async () => root.unmount()); }
});
