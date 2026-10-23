// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { BuildPlanner } from "@flashfront/ui";
import { MockDataSource } from "@flashfront/core";
import { loadFonts } from "./fonts";
vi.mock("./fonts", () => ({ loadFonts: vi.fn(async () => "/* local test fonts */") }));
import * as heatData from "../../../packages/core/src/heat-data";

let root: Root; let host: HTMLDivElement;
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(heatData, "decodeHeatGrid").mockImplementation(async grid => new Uint8Array(grid.columns * grid.rows).fill(32));
  vi.mocked(loadFonts).mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", class { onmessage?: (event: { data: Uint8ClampedArray }) => void; postMessage() {} terminate() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("innerWidth", 1280);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 850 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 290 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 250 });
  HTMLElement.prototype.setPointerCapture = () => {};
  localStorage.clear(); window.location.hash = "#/";
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  consoleError = vi.spyOn(console, "error");
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  // JSDOM queues native hashchange tasks even though route() dispatches them
  // synchronously. Drain those once; recurring application timers must be gone.
  await act(async () => vi.runOnlyPendingTimers());
  try {
    expect(consoleError.mock.calls).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
const mount = async (path = "/") => { window.location.hash = `#${path}`; await act(async () => { root.render(<App />); }); await act(async () => { await vi.dynamicImportSettled(); }); };
const route = async (path: string) => { await act(async () => { window.location.hash = `#${path}`; window.dispatchEvent(new HashChangeEvent("hashchange")); }); await act(async () => { await vi.dynamicImportSettled(); }); };
function button(text: string) { const found = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text)); expect(found).toBeTruthy(); return found!; }
const click = async (element: HTMLElement) => { await act(async () => element.click()); };

// Mock start shown as playing: no port yet (Trade hidden) and the spawn event ended with spawn (Field Reports hidden).
const showClock = async () => { await click(button("Edit HUD")); await click(host.querySelector<HTMLButtonElement>('[aria-label="Show Match overview"]')!); await click(button("Finish editing")); };
const VISIBLE_AT_START = ["gauge", "attack", "build", "alliances", "opening", "goal"];
it("renders every route, sortable history, match details and not-found states without console errors", async () => {
  await mount(); expect(host.textContent).toContain("Read the field.");
  await route("/stats"); expect(host.querySelectorAll("tbody tr")).toHaveLength(20);
  await click(button("Placement")); expect(host.querySelector("tbody tr")!.textContent).toContain("#1");
  await click(button("Placement")); expect(host.querySelector("tbody tr")!.textContent).not.toContain("#1 ");
  await route("/stats/match/mock-42-1"); expect(host.textContent).toContain("Buildings constructed");
  expect(host.querySelectorAll(".chart > svg")).toHaveLength(3);
  await route("/stats/match/missing"); expect(host.textContent).toContain("Match not found");
  await route("/unknown"); expect(host.textContent).toContain("Page not found");
});

it("updates the HUD, toggles with Ctrl+Alt+H, edits, drags, collapses and persists layout", async () => {
  await mount("/hud?phase=playing"); expect(host.querySelectorAll("[data-panel]")).toHaveLength(11); await showClock();
  const clock = () => host.querySelector('[data-panel="clock"] .clock')!.textContent;
  expect(clock()).toBe("0:00");
  await act(async () => vi.advanceTimersByTime(1500)); expect(clock()).toBe("0:01");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", ctrlKey: true, altKey: true })));
  expect(host.querySelector<HTMLElement>(".hud-layer")!.style.visibility).toBe("hidden");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true, altKey: true })));
  expect(host.querySelector<HTMLElement>(".hud-layer")!.style.visibility).toBe("visible");
  const handle = host.querySelector<HTMLButtonElement>('[aria-label="Move Match overview"]')!;
  const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(event, "pointerId", { value: 1 }); handle.dispatchEvent(event); };
  await act(async () => { pointer("pointerdown", 20, 20); pointer("pointermove", 125, 80); pointer("pointerup", 125, 80); });
  const moved = host.querySelector<HTMLElement>('[data-panel="clock"]')!.style.left;
  expect(parseInt(moved)).toBeGreaterThan(50);
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Collapse Troop growth"]')!);
  expect(host.querySelector('[data-panel="gauge"] .hud-panel-content')).toBeNull();
  const saved = JSON.parse(localStorage.getItem("flashfront.hud.v5.1280x850")!);
  expect(saved.gauge.collapsed).toBe(true); expect(saved.clock.x).toBe(parseFloat(moved));
  await route("/"); await route("/hud"); expect(host.querySelector('[data-panel="gauge"] .hud-panel-content')).toBeNull();
  expect(host.querySelector<HTMLElement>('[data-panel="clock"]')!.style.left).toBe(moved);
});

it("responds to simulation seed and speed controls", async () => {
  await mount("/hud"); await showClock();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Simulation speed"]')!;
  await act(async () => { select.value = "20"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => vi.advanceTimersByTime(1500));
  expect(host.querySelector('[data-panel="clock"] .clock')!.textContent).toBe("0:30");
  const input = host.querySelector<HTMLInputElement>('[aria-label="Simulation seed"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "73");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(button("Apply seed"));
  expect(host.querySelector('[data-panel="clock"] .clock')!.textContent).toBe("0:00");
  await route("/stats"); expect(host.querySelector("tbody a")!.getAttribute("href")).toBe("#/stats/match/mock-73-1");
});

it("selects and anchors OBS widgets, toggles transparent classes, and updates sparklines", async () => {
  await mount("/stream"); expect(host.querySelectorAll("[data-widget]")).toHaveLength(5);
  await act(async () => vi.advanceTimersByTime(1500));
  expect(host.querySelector('[data-widget="stats"] .chart-line')!.getAttribute("d")).toContain("L");
  await route("/stream/obs?widgets=card,top&scale=0.75&anchor=br");
  expect(host.querySelectorAll("[data-widget]")).toHaveLength(2);
  expect(host.querySelector<HTMLElement>(".stream-obs")!.style.transform).toBe("scale(0.75)");
  expect(host.querySelector(".anchor-br")).not.toBeNull();
  expect(document.body.classList.contains("obs-transparent")).toBe(true);
  expect(document.documentElement.classList.contains("obs-transparent")).toBe(true);
  expect(host.querySelector(".site-header")).toBeNull();
  await route("/stats"); expect(document.body.classList.contains("obs-transparent")).toBe(false);
});

it("exposes keyboard chart tooltips and respects reduced motion for numbers", async () => {
  await mount("/stats");
  const svg = host.querySelector(".chart > svg")!;
  await act(async () => svg.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  const previous = host.querySelector('[role="tooltip"]')!.textContent;
  await act(async () => svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(host.querySelector('[role="tooltip"]')!.textContent).not.toBe(previous);
  await route("/hud"); await showClock(); await act(async () => vi.advanceTimersByTime(3000));
  expect(host.querySelector('[data-panel="clock"] .clock')!.textContent).toBe("0:03");
});

it("toggles zone boxes and panel visibility and ignores stale v0-v3 layouts", async () => {
  localStorage.setItem("flashfront.hud.v0", JSON.stringify({ gauge: { hidden: true } }));
  localStorage.setItem("flashfront.hud.v1", JSON.stringify({ gauge: { hidden: true } }));
  localStorage.setItem("flashfront.hud.v2", JSON.stringify({ gauge: { hidden: true } }));
  localStorage.setItem("flashfront.hud.v3", JSON.stringify({ gauge: { hidden: true } }));
  await mount("/hud?phase=playing");
  // Trade waits for a port and Field Reports for something to report (2026-10-17 polish).
  expect([...host.querySelectorAll<HTMLElement>("[data-panel]:not([hidden])")].map(e => e.dataset.panel)).toEqual(VISIBLE_AT_START);
  const toggle = host.querySelector<HTMLInputElement>('.zone-toggle input')!;
  await click(toggle); expect(host.querySelectorAll("[data-game-zone]")).toHaveLength(6);
  await click(toggle); expect(host.querySelectorAll("[data-game-zone]")).toHaveLength(0);
  await click(button("Edit HUD"));
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Show Match overview"]')!);
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Hide Troop growth"]')!);
  await click(button("Finish editing"));
  expect(host.querySelector<HTMLElement>('[data-panel="clock"]')!.hidden).toBe(false);
  expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.hidden).toBe(true);
  await route("/"); await route("/hud");
  expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.hidden).toBe(true);
});
it("offers four themes, preserves HUD placement, and honors the OBS override", async () => {
  await mount("/hud?phase=playing");
  const picker = host.querySelector<HTMLSelectElement>('[aria-label="Theme"]')!;
  expect([...picker.options].map(o => o.value)).toEqual(["abyss", "daylight", "ember", "signal"]);
  const before = host.querySelector<HTMLElement>('[data-panel="gauge"]')!.style.cssText;
  expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.style.height).toBe("");
  for (const theme of ["daylight", "ember", "signal", "abyss"]) {
    await act(async () => { picker.value = theme; picker.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.documentElement.dataset.ffTheme).toBe(theme);
    expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.style.cssText).toBe(before);
  }
  await route("/stream/obs?theme=signal"); expect(document.documentElement.dataset.ffTheme).toBe("signal");
  await route("/stream/obs?theme=unknown"); expect(document.documentElement.dataset.ffTheme).toBe("abyss");
});
it("skips font loading on fresh nofonts HUD and removes fonts on route changes", async () => {
  await mount("/hud?nofonts=1");
  expect(loadFonts).not.toHaveBeenCalled();
  expect(document.querySelector('[data-flashfront-fonts]')).toBeNull();
  await route("/stream"); expect(loadFonts).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-flashfront-fonts]')).not.toBeNull();
  await route("/hud?nofonts=1"); expect(document.querySelector('[data-flashfront-fonts]')).toBeNull();
  await route("/stats"); expect(loadFonts).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-flashfront-fonts]')).not.toBeNull();
});
it("previews players landing and moving, fades, hides at spawn end and repeats", async () => {
  await mount("/hud?phase=spawn&map=World");
  expect(host.querySelectorAll(".spawn-heat canvas"), host.querySelector(".spawn-heat")?.outerHTML).toHaveLength(1);
  expect(host.querySelector(".spawn-preview-map")?.getAttribute("src")).toBe("minimaps/world.png");
  expect(host.querySelector("[data-panel=spawn]")).toBeNull();
  expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.hidden).toBe(true);
  await act(async () => vi.advanceTimersByTime(6000));
  expect(host.querySelectorAll('[aria-label="Landed mock player"]')).toHaveLength(2);
  // 4-10 s the mock player has let go of Space: the dock shows the "Hold Space" keycap hint instead of heat.
  expect(host.querySelector(".spawn-heat canvas")).toBeNull();
  expect(host.querySelector(".spawn-heat-hint")?.textContent).toBe("Hold Space: spawn heat");
  expect(host.querySelector(".spawn-heat-hint kbd")?.textContent).toBe("Space");
  const own = host.querySelector<HTMLElement>('[aria-label="Your mock spawn"]')!.style.left;
  await act(async () => vi.advanceTimersByTime(11_000));
  expect(host.querySelector<HTMLElement>('[aria-label="Your mock spawn"]')!.style.left).not.toBe(own);
  expect(host.querySelector<HTMLElement>(".spawn-heat")!.style.opacity).toBe("0.6");
  await act(async () => vi.advanceTimersByTime(3000));
  expect(host.querySelector(".spawn-heat")).toBeNull();
  expect(host.textContent).toContain("Spawn ended");
  await act(async () => vi.advanceTimersByTime(5000));
  expect(host.querySelectorAll(".spawn-heat canvas"), host.querySelector(".spawn-heat")?.outerHTML).toHaveLength(1);
  await route("/hud?phase=spawn&map=Iceland&size=Compact");
  expect(host.querySelectorAll(".spawn-heat canvas"), host.querySelector(".spawn-heat")?.outerHTML).toHaveLength(1);
  await route("/hud?phase=spawn&map=Unknown");
  expect(host.textContent).toContain("No spawn heat data for this map yet.");
  await route("/hud?phase=playing");
  expect(host.querySelector("[data-panel=spawn]")).toBeNull();
  expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')!.hidden).toBe(false);
  expect(host.querySelector<HTMLElement>('[data-panel="attack"]')!.hidden).toBe(false);
});
it("tracks idle city gold in game seconds, resetting on spending, price changes, rewind and new games", async () => {
  const self = new MockDataSource().getSnapshot().self!;
  self.gold = 125_000;
  const render = async (seconds: number, gameId = "test") => { await act(async () => root.render(<BuildPlanner self={self} elapsedSec={seconds} gameId={gameId} />)); };
  await render(100); await render(129.9); expect(host.querySelector('.idle-gold')).toBeNull();
  await render(130); expect(host.textContent).toContain("Affordable for 0:30");
  await render(145); expect(host.textContent).toContain("Affordable for 0:45");
  expect(host.textContent).toContain("+25K max troops");
  self.gold = 124_999; await render(146); expect(host.querySelector('.idle-gold')).toBeNull();
  self.gold = 500_000; await render(150); await render(195); expect(host.querySelector('.idle-gold')).not.toBeNull();
  self.buildings.find(b => b.type === "City")!.nextCost = 250_000;
  await render(196); expect(host.querySelector('.idle-gold')).toBeNull();
  await render(226); expect(host.querySelector('.idle-gold')).not.toBeNull();
  await render(1); expect(host.querySelector('.idle-gold')).toBeNull();
  await render(31); expect(host.querySelector('.idle-gold')).not.toBeNull();
  await render(31, "new"); expect(host.querySelector('.idle-gold')).toBeNull();
});
it("shows the approved mark sizes, palette roles and complete type scale on the brand route", async () => {
  await mount("/brand");
  expect(host.querySelectorAll(".brand-marks svg")).toHaveLength(3);
  expect(host.querySelectorAll(".brand-palette article")).toHaveLength(13);
  expect(host.querySelectorAll(".brand-types > div")).toHaveLength(8);
  expect(host.textContent).toContain("Mark, action, selection");
  expect(host.textContent).toContain("Exposed, danger, incoming");
});
