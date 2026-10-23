import { expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeHeatGrid, heatGridFor } from "../heat-data";
import { combineSpawnScore, crowdedScores, heatCameraMatches, heatDimensions, heatPercentiles, heatPixels, spawnHeatActive, spawnHeatOpacity, spawnWorldToScreen, type HeatGrid } from "./heat";
import { mapToSnapshot } from "../mapToSnapshot";
import { MatchRecorder } from "../recorder";
import type { RawExtract } from "../raw";
import type { SpawnCamera } from "../types";

const grid: HeatGrid = { folder: "fixture", width: 400, height: 4, columns: 100, rows: 1, sourceVersion: "fixture", data: "" };
// Saved source-reference transform, not a live Steam capture: v0.35.2 TransformHandler.ts.
const camera: SpawnCamera = { scale: 1.8, offsetX: -350, offsetY: -200, mapWidth: 2000, mapHeight: 1000,
  left: 16, top: 24, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080 };
it("maps the saved transform, pan and zoom in viewport CSS pixels", () => {
  expect(spawnWorldToScreen({ x: 0, y: 0 }, camera)).toEqual({ x: -154, y: -16 });
  expect(spawnWorldToScreen({ x: 1000, y: 500 }, camera)).toEqual({ x: 1646, y: 884 });
  expect(spawnWorldToScreen({ x: 1000, y: 500 }, { ...camera, scale: 2, offsetX: 100, offsetY: 50 })).toEqual({ x: 816, y: 424 });
});
it("weighs terrain and openness equally, using only the nearest spawn", () => {
  expect(combineSpawnScore(1, 0)).toBe(1); expect(combineSpawnScore(1, 1)).toBe(0.5); expect(combineSpawnScore(0, 1)).toBe(0);
  const cells = new Uint8Array(100).fill(32); cells[0] = 0;
  const point = { x: 202, y: 2 };
  const other = crowdedScores(cells, grid, { others: [point] });
  const own = crowdedScores(cells, grid, { others: [], own: point });
  expect(other[50]).toBe(0.5); expect(own[50]).toBeCloseTo(0.925);
  expect(other[65]).toBeCloseTo(0.875); expect(other[80]).toBe(1); expect(other[0]).toBe(-1);
  // Live 2026-10-18: summing 450 spawns saturated the map. A second spawn on the same spot changes nothing.
  expect(crowdedScores(cells, grid, { others: [point, point] })[65]).toBeCloseTo(0.875);
  expect(crowdedScores(cells, grid, { others: [{ x: 2, y: 2 }] })[50]).toBe(1);
  expect(crowdedScores(cells, grid, { others: [{ x: 101, y: 1 }] }, true)[50]).toBe(0.5);
  expect(heatPixels(other).slice(0, 4)).toEqual(new Uint8ClampedArray(4));
  expect(heatPixels(other)[50 * 4 + 3]).toBe(82);
});
it("colors by rank within the map so the best spots stay green however busy the lobby is", () => {
  const scores = Float32Array.from([-1, 0.30, 0.31, 0.32, 0.33, 0.34, 0.35, 0.36, 0.37, 0.38, 0.39]);
  expect(Array.from(heatPercentiles(scores)).map(v => +v.toFixed(2))).toEqual([-1, ...Array.from({ length: 10 }, (_, i) => +(i / 9).toFixed(2))]);
  const px = heatPixels(scores);
  expect(Array.from(px.slice(4, 7))).toEqual([213, 94, 0]);          // lowest land: vermilion
  expect(Array.from(px.slice(40, 43))).toEqual([0, 158, 115]);       // highest land: green
  expect(heatPercentiles(Float32Array.from([0.4, 0.4]))[0]).toBe(0.5); // ties share a rank
});
it("reuses scoring, ranking and pixel buffers without keeping old crowding or water colors", () => {
  const cells = Uint8Array.from({ length: 100 }, (_, i) => i % 33);
  const scores = new Float32Array(100), crowding = new Float32Array(100), ranks = new Float32Array(100);
  const pixels = new Uint8ClampedArray(400); const land: number[] = [];
  for (const heat of [{ others: [{ x: 100, y: 2 }] }, { others: [] }, { others: [{ x: 20, y: 2 }], own: { x: 200, y: 2 } }]) {
    const expected = heatPixels(crowdedScores(cells, grid, heat));
    expect(crowdedScores(cells, grid, heat, false, scores, crowding)).toBe(scores);
    expect(heatPixels(scores, pixels, ranks, land)).toBe(pixels); expect(pixels).toEqual(expected);
  }
});
it("decodes bundled grids and rejects malformed lengths and values", async () => {
  expect(heatGridFor("missing")).toBeNull(); expect(heatGridFor("__proto__")).toBeNull();
  // The main process only sees sizes; they must match the grids the overlay draws.
  expect(heatDimensions("World")).toEqual({ width: heatGridFor("World")!.width, height: heatGridFor("World")!.height });
  expect(heatDimensions("__proto__")).toBeNull();
  const world = heatGridFor("World")!;
  const cells = await decodeHeatGrid(world);
  expect(cells.length).toBe(world.columns * world.rows);
  expect(cells.some(v => v === 0)).toBe(true); expect(cells.some(v => v > 20)).toBe(true);
  for (const bytes of [new Uint8Array(2), new Uint8Array(100).fill(33)]) {
    await expect(decodeHeatGrid({ ...grid, data: gzipSync(bytes).toString("base64") })).rejects.toThrow("Invalid heat grid");
  }
});
it("fades in quarter-second steps over the last five seconds and hides at spawn end", () => {
  const raw: RawExtract = { inGame: true, visible: true, inSpawnPhase: true, game: { map: "World" }, spawnHeat: { others: [], camera, remainingSec: 6 } };
  const snapshot = mapToSnapshot(raw)!;
  expect(spawnHeatOpacity(snapshot)).toBe(1);
  expect(spawnHeatOpacity({ ...snapshot, spawnHeat: { others: [], remainingSec: 2.5 } })).toBe(0.5);
  expect(spawnHeatOpacity({ ...snapshot, spawnHeat: { others: [], remainingSec: 0 } })).toBe(0);
  expect(spawnHeatOpacity({ ...snapshot, spawnHeat: { others: [] } })).toBe(1);
  for (const patch of [{ phase: "playing" as const }, { phase: "ended" as const }, { mode: "Ranked" as const }, { observer: "replay" as const }]) {
    expect(spawnHeatOpacity({ ...snapshot, ...patch })).toBe(0); expect(spawnHeatActive({ ...snapshot, ...patch })).toBe(false);
  }
  for (const patch of [{ inSpawnPhase: false }, { gameOver: true }, { replay: true }, { game: { rankedType: "ffa" } }]) {
    expect(mapToSnapshot({ ...raw, ...patch }, snapshot)?.spawnHeat).toBeUndefined();
  }
});
it("requires matching Normal or Compact map geometry before drawing", () => {
  expect(heatCameraMatches(grid, { ...camera, mapWidth: 400, mapHeight: 4 })).toBe(true);
  expect(heatCameraMatches(grid, { ...camera, mapWidth: 200, mapHeight: 2 }, "Compact")).toBe(true);
  expect(heatCameraMatches(grid, camera)).toBe(false);
  expect(heatCameraMatches(grid, undefined)).toBe(false);
});
it("never persists the ephemeral positions or camera in match recordings", () => {
  const raw: RawExtract = { inGame: true, visible: true, inSpawnPhase: true, tick: 0, spawnHeat: { others: [{ x: 1234, y: 5678 }], camera }, me: { alive: true } };
  const recorder = new MatchRecorder(); recorder.consume(raw, mapToSnapshot(raw));
  const [record] = recorder.consume({ inGame: false, visible: true }, null);
  expect(record).toBeDefined(); expect(JSON.stringify(record)).not.toMatch(/spawnHeat|1234|5678|offsetX/);
});
