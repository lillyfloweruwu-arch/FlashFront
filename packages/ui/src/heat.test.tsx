// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import * as core from "@flashfront/core";
import * as heatData from "@flashfront/core/heat-data";
import { SpawnHeatmap } from "./hud/SpawnHeatmap";

it.each([{ lite: false, redrawMs: 500 }, { lite: true, redrawMs: 1000 }])("draws aligned heat at the selected rate (Lite $lite) and removes it at the phase boundary", async ({ lite, redrawMs }) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  const grid = heatData.heatGridFor("World")!;
  vi.spyOn(heatData, "decodeHeatGrid").mockResolvedValue(new Uint8Array(grid.columns * grid.rows).fill(32));
  const put = vi.fn();
  const compute = vi.fn();
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: Uint8ClampedArray }) => void;
    terminate() {}
    postMessage(job: { heat: core.SpawnHeat; compact: boolean }) {
      compute(job);
      const data = core.heatPixels(core.crowdedScores(new Uint8Array(grid.columns * grid.rows).fill(32), grid, job.heat, job.compact));
      queueMicrotask(() => this.onmessage?.({ data }));
    }
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: put,
  } as unknown as CanvasRenderingContext2D);
  const snapshot = new core.MockDataSource().getSnapshot(); snapshot.map = "World";
  snapshot.spawnHeat = { others: [], remainingSec: 10, camera: {
    scale: 1, offsetX: 0, offsetY: 0, mapWidth: grid.width, mapHeight: grid.height,
    left: 20, top: 30, width: 1800, height: 900, viewportWidth: 1920, viewportHeight: 1080,
  } };
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={snapshot} />));
    expect(host.querySelectorAll("canvas")).toHaveLength(1); expect(put).toHaveBeenCalledTimes(1);
    expect(host.querySelector("canvas")!.style.transform).toContain("matrix(");
    const beforeTransform = host.querySelector("canvas")!.style.transform;
    const before = (put.mock.calls[0]![0].data as Uint8ClampedArray).slice();
    const x = grid.width / grid.columns / 2; const y = grid.height / grid.rows / 2;
    const crowded = { ...snapshot, spawnHeat: { ...snapshot.spawnHeat, others: [{ x, y }], remainingSec: 2.5 } };
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={crowded} />));
    expect(host.querySelector<HTMLElement>(".spawn-heat")!.style.opacity).toBe("0.5");
    // Live 2026-10-18: recomputing on every poll made the tint trail the camera. Colors redraw at most every 500 ms.
    expect(put).toHaveBeenCalledTimes(1);
    const moved = { ...crowded, spawnHeat: { ...crowded.spawnHeat, camera: { ...crowded.spawnHeat.camera!, offsetX: 40 } } };
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={moved} />));
    expect(host.querySelector("canvas")!.style.transform).not.toBe(beforeTransform);   // camera moves restyle at once
    await act(async () => { vi.advanceTimersByTime(redrawMs - 1); });
    expect(put).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.at(-1)![0].data.slice(0, 4)).not.toEqual(before.slice(0, 4));
    // Changing modes must replace an already scheduled color update's deadline.
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={snapshot} />));
    await act(async () => root.render(<SpawnHeatmap lite={!lite} snapshot={snapshot} />));
    await act(async () => { vi.advanceTimersByTime((lite ? 500 : 1000) - 1); });
    expect(put).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(put).toHaveBeenCalledTimes(3);
    // Queue a different draw inside the throttle, then hide before its deadline.
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={snapshot} held />));
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={snapshot} held={false} />));
    const count = compute.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(compute).toHaveBeenCalledTimes(count);
    expect(host.querySelector("canvas")).toBeNull();
    await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={crowded} held />));
    expect(compute).toHaveBeenCalledTimes(count + 1);
    expect(compute.mock.calls.at(-1)![0].heat.others).toEqual(crowded.spawnHeat.others);
    for (const patch of [{ phase: "playing" as const }, { mode: "Ranked" as const }, { observer: "replay" as const }]) {
      await act(async () => root.render(<SpawnHeatmap lite={lite} snapshot={{ ...crowded, ...patch }} />));
      expect(host.innerHTML).toBe("");
    }
  } finally { await act(async () => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
it("fails closed with a quiet note for unknown maps and missing transforms", () => {
  const snapshot = new core.MockDataSource().getSnapshot();
  expect(renderToStaticMarkup(<SpawnHeatmap snapshot={{ ...snapshot, map: "unknown" }} />)).toContain("No spawn heat data for this map yet.");
  const html = renderToStaticMarkup(<SpawnHeatmap snapshot={{ ...snapshot, map: "World" }} />);
  expect(html).toContain("waiting for map alignment"); expect(html).not.toContain("<canvas");
});
