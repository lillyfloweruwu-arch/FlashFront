// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { MockDataSource } from "@flashfront/core";
import * as heatData from "@flashfront/core/heat-data";
import * as core from "@flashfront/core";
import { HudRoot } from "./HudRoot";
import { SpawnHeatmap } from "./SpawnHeatmap";
import { TeamSwatch } from "./TeamSwatch";
import { arrangePanels, GAME_UI_ZONES, LocalStorageLayoutStore, PANEL_HEIGHTS, PANEL_WIDTH, panelIds, presetLayout } from "./layout";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });
it("does not mount hidden or collapsed panel bodies", () => {
  const snapshot = { ...new MockDataSource().getSnapshot(), phase: "playing" as const };
  const layout = presetLayout("learning", 1920, 1080); layout.attack.collapsed = true; layout.build.hidden = true;
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<HudRoot snapshot={snapshot} layoutStore={{ load: () => layout, save() {} }} />);
  expect(host.querySelector('[data-panel="attack"] .hud-panel-content')).toBeNull();
  expect(host.querySelector('[data-panel="build"] .hud-panel-content')).toBeNull();
});
it("migrates v4 positions once per resolution without overriding v5 or undoing reset", () => {
  const legacy = presetLayout("custom", 1920, 1080); legacy.build.x = 777; legacy.attack.collapsed = true;
  localStorage.setItem("flashfront.hud.v4", JSON.stringify(legacy));
  const store = new LocalStorageLayoutStore(1920, 1080);
  expect(store.load()).toEqual(legacy);
  expect(JSON.parse(localStorage.getItem(store.key)!)).toEqual(legacy);
  const next = structuredClone(legacy); next.build.x = 888; store.save(next);
  expect(store.load()).toEqual(next);
  store.reset(); expect(new LocalStorageLayoutStore(1920, 1080).load()).toBeNull();
  expect(new LocalStorageLayoutStore(1280, 720).load()).toEqual(legacy);
});
it("does not replace invalid v5 data with legacy positions or migrate malformed v4", () => {
  const store = new LocalStorageLayoutStore(1920, 1080);
  localStorage.setItem("flashfront.hud.v4", JSON.stringify(presetLayout("custom", 1920, 1080)));
  localStorage.setItem(store.key, "bad JSON"); expect(store.load()).toBeNull();
  localStorage.clear(); localStorage.setItem("flashfront.hud.v4", "{}");
  expect(store.load()).toBeNull(); expect(localStorage.getItem(store.key)).toBeNull();
});
it("replaces unhealthy panels and their dependent readouts with explicit status", () => {
  const snapshot = { ...new MockDataSource().getSnapshot(), phase: "playing" as const };
  for (const status of ["paused", "unavailable"] as const) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<HudRoot snapshot={snapshot} hudPreset="learning" editMode featureHealth={{ growth: status, attack: status, build: status, trade: status, alliances: status, spawnHeat: status }} />);
    for (const id of ["gauge", "attack", "build", "trade", "alliances", "decision", "opening", "self", "events", "goal"]) {
      expect(host.querySelector(`[data-panel=${id}] .hud-panel-content`)?.textContent).toBe(status === "paused" ? "estimate paused" : "unavailable");
    }
  }
});
it("keeps unhealthy heat off the canvas while preserving the released Space hint", () => {
  const snapshot = new MockDataSource().getSnapshot();
  for (const held of [false, true]) {
    const html = renderToStaticMarkup(<HudRoot snapshot={snapshot} heatHeld={held} featureHealth={{ spawnHeat: "paused" }} />);
    expect(html).not.toContain("<canvas"); expect(html).toContain("estimate paused");
    const hint = document.createElement("div"); hint.innerHTML = html;
    expect(hint.querySelector("[data-heat-legend]")?.textContent).toBe(held ? "estimate paused" : "Hold Space: spawn heat · estimate paused");
  }
});
it("keeps each preset clear of the game UI at the reference resolution", () => {
  const visible = { minimal: ["decision", "gauge", "attack"], learning: [...panelIds], economy: ["decision", "build", "trade", "goal"] };
  for (const preset of ["minimal", "learning", "economy"] as const) {
    const layout = presetLayout(preset, 1920, 1080);
    expect(panelIds.filter(id => !layout[id].hidden).sort()).toEqual(visible[preset].sort());
    for (const id of panelIds.filter(id => !layout[id].hidden)) {
      const p = layout[id];
      expect(p.x + PANEL_WIDTH).toBeLessThanOrEqual(1920);
      expect(p.y + PANEL_HEIGHTS[id]).toBeLessThanOrEqual(1080);
      for (const zone of GAME_UI_ZONES) expect(p.x < zone.x + zone.width && p.x + PANEL_WIDTH > zone.x && p.y < zone.y + zone.height && p.y + PANEL_HEIGHTS[id] > zone.y, `${preset}: ${id} / ${zone.id}`).toBe(false);
    }
  }
});
it("stores layouts separately for each resolution", () => {
  const large = new LocalStorageLayoutStore(1920, 1080), small = new LocalStorageLayoutStore(1280, 720);
  const layout = presetLayout("economy", 1920, 1080);
  large.save(layout);
  expect(localStorage.getItem("flashfront.hud.v5.1920x1080")).toBe(JSON.stringify(layout));
  expect(small.load()).toBeNull(); expect(large.load()).toEqual(layout);
});
it("fits measured editor panels without overlaps or covered game controls", () => {
  const heights = { decision: 152, gauge: 210, attack: 390, build: 180, trade: 180, goal: 160, opening: 150, events: 140, alliances: 110, clock: 200, self: 200 };
  const positions = arrangePanels(heights, 1920, 1080);
  const placed: { x: number; y: number; width: number; height: number }[] = [...GAME_UI_ZONES];
  for (const [id, h] of Object.entries(heights)) {
    const [x, y] = positions[id as keyof typeof heights]!;
    expect(y + h).toBeLessThanOrEqual(1080); expect(x + PANEL_WIDTH).toBeLessThanOrEqual(1920);
    for (const p of placed) expect(x < p.x + p.width && x + PANEL_WIDTH > p.x && y < p.y + p.height && y + h > p.y, id).toBe(false);
    placed.push({ x, y, width: PANEL_WIDTH, height: h });
  }
});
it("sets comfortable HUD text independently of the theme", () => {
  const html = renderToStaticMarkup(<HudRoot snapshot={new MockDataSource().getSnapshot()} textSize="comfortable" />);
  expect(html).toContain("--font-scale:1.15");
});
it("hides every HUD panel in ranked matches and replays", () => {
  const snapshot = new MockDataSource().getSnapshot();
  for (const patch of [{ mode: "Ranked" as const }, { observer: "replay" as const }]) {
    const html = renderToStaticMarkup(<HudRoot snapshot={{ ...snapshot, ...patch }} editMode />);
    expect(html).not.toContain("data-panel"); expect(html).not.toContain("canvas");
  }
});
it("skips heat scoring while released and removes the canvas on the next held-state update", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const grid = heatData.heatGridFor("World")!;
  vi.spyOn(heatData, "decodeHeatGrid").mockResolvedValue(new Uint8Array(grid.columns * grid.rows).fill(32));
  const scores = vi.spyOn(core, "crowdedScores"); const put = vi.fn();
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: Uint8ClampedArray }) => void;
    terminate() {}
    postMessage(job: { heat: core.SpawnHeat }) {
      const data = core.heatPixels(core.crowdedScores(new Uint8Array(grid.columns * grid.rows).fill(32), grid, job.heat));
      queueMicrotask(() => this.onmessage?.({ data }));
    }
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: put } as unknown as CanvasRenderingContext2D);
  const snapshot = new MockDataSource().getSnapshot(); snapshot.map = "World";
  snapshot.spawnHeat = { others: [], remainingSec: 10, camera: { scale: 1, offsetX: 0, offsetY: 0, mapWidth: grid.width, mapHeight: grid.height, left: 0, top: 0, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080 } };
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<SpawnHeatmap snapshot={snapshot} held={false} />));
    expect(host.querySelector("canvas")).toBeNull(); expect(host.querySelector("[data-heat-legend]")?.textContent).toBe("Hold Space: spawn heat");
    expect(scores).toHaveBeenCalledTimes(0);
    const next = { ...snapshot, spawnHeat: { ...snapshot.spawnHeat, others: [{ x: 50, y: 50 }] } };
    await act(async () => root.render(<SpawnHeatmap snapshot={next} held={false} />));
    expect(scores).toHaveBeenCalledTimes(0);
    await act(async () => { vi.advanceTimersByTime(500); }); expect(scores).toHaveBeenCalledTimes(0);
    await act(async () => root.render(<SpawnHeatmap snapshot={next} held />));
    expect(host.querySelectorAll("canvas")).toHaveLength(1); expect(put).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<SpawnHeatmap snapshot={next} held={false} />));
    expect(host.querySelector("canvas")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(50); }); expect(host.querySelector("canvas")).toBeNull();
    await act(async () => root.render(<SpawnHeatmap snapshot={{ ...next, phase: "playing" }} held={false} />));
    expect(host.innerHTML).toBe("");
  } finally { await act(async () => root.unmount()); }
});
it("labels the own team only during a live team spawn", () => {
  const snapshot = { ...new MockDataSource().getSnapshot(), mode: "Teams" as const };
  const html = renderToStaticMarkup(<TeamSwatch snapshot={snapshot} team={{ team: "TEAL", teamColor: "#009E73" }} />);
  expect(html).toContain("Your team: TEAL"); expect(html).toContain("data-heat-legend");
  for (const patch of [{ mode: "FFA" as const }, { phase: "playing" as const }, { observer: "replay" as const }, { mode: "Ranked" as const }]) expect(renderToStaticMarkup(<TeamSwatch snapshot={{ ...snapshot, ...patch }} team={{ team: "TEAL" }} />)).toBe("");
});
