import dims from "./heat-dims.json";
import type { GameSnapshot, SpawnCamera, SpawnHeat, SpawnPosition } from "../types";

export interface HeatGrid {
  folder: string; width: number; height: number; columns: number; rows: number; sourceVersion: string; data: string;
}
export function spawnHeatOpacity(snapshot: Pick<GameSnapshot, "phase" | "mode" | "observer" | "spawnHeat">): number {
  if (snapshot.phase !== "spawn" || snapshot.mode === "Ranked" || snapshot.observer) return 0;
  const seconds = snapshot.spawnHeat?.remainingSec;
  return seconds === undefined ? 1 : Number.isFinite(seconds) ? Math.max(0, Math.min(1, Math.ceil(seconds * 4) / 20)) : 0;
}
/** v0.35.2 TransformHandler.worldToScreenCoordinates, in the game's viewport CSS pixels. */
export function spawnWorldToScreen(point: SpawnPosition, camera: SpawnCamera): SpawnPosition {
  return { x: (point.x - camera.mapWidth / 2 - camera.offsetX) * camera.scale + camera.mapWidth / 2 + camera.left,
    y: (point.y - camera.mapHeight / 2 - camera.offsetY) * camera.scale + camera.mapHeight / 2 + camera.top };
}
export function heatCameraMatches(grid: Pick<HeatGrid, "width" | "height">, camera: SpawnCamera | undefined, mapSize?: GameSnapshot["mapSize"]): camera is SpawnCamera {
  const factor = mapSize === "Compact" ? 0.5 : 1;
  return !!camera && Object.values(camera).every(Number.isFinite) && camera.scale > 0 && camera.viewportWidth > 0 && camera.viewportHeight > 0
    && camera.width > 0 && camera.height > 0 && camera.mapWidth === grid.width * factor && camera.mapHeight === grid.height * factor;
}
/**
 * Map sizes only (3 KB): the 2.7 MB grids live in `@flashfront/core/heat-data`, which only the
 * overlay imports, so the main process never loads them.
 */
export function heatDimensions(map: string): { width: number; height: number } | null {
  if (!Object.hasOwn(dims, map)) return null;
  const [width, height] = (dims as Record<string, number[]>)[map]! as [number, number];
  return { width, height };
}
export function spawnHeatActive(snapshot: GameSnapshot | null | undefined): boolean {
  if (!snapshot || spawnHeatOpacity(snapshot) <= 0) return false;
  const size = heatDimensions(snapshot.map);
  return !!size && heatCameraMatches(size, snapshot.spawnHeat?.camera, snapshot.mapSize);
}
/**
 * Terrain (room + coast) and openness weigh equally. Openness comes from the NEAREST spawn only:
 * summing every spawn saturated the whole map in a 450-spawn public lobby (live, 2026-10-18).
 */
export const combineSpawnScore = (terrain: number, crowding: number) => 0.5 * terrain + 0.5 * (1 - Math.max(0, Math.min(1, crowding)));
export function crowdedScores(cells: Uint8Array, grid: HeatGrid, heat: SpawnHeat, compact = false, scores: Float32Array = new Float32Array(cells.length), crowding: Float32Array = new Float32Array(cells.length)): Float32Array {
  crowding.fill(0);
  const step = grid.width / grid.columns * (compact ? 0.5 : 1);
  const radius = 120; const reach = Math.ceil(radius / step);
  const apply = (point: SpawnPosition, weight: number) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const cx = Math.floor(point.x / step); const cy = Math.floor(point.y / step);
    for (let y = Math.max(0, cy - reach); y <= Math.min(grid.rows - 1, cy + reach); y++) {
      for (let x = Math.max(0, cx - reach); x <= Math.min(grid.columns - 1, cx + reach); x++) {
        const i = y * grid.columns + x;
        if (!cells[i]) continue;
        const distance = Math.hypot((x + 0.5) * step - point.x, (y + 0.5) * step - point.y) / radius;
        if (distance < 1) crowding[i] = Math.max(crowding[i]!, weight * (1 - distance) ** 2);
      }
    }
  };
  for (const point of heat.others) apply(point, 1);
  if (heat.own) apply(heat.own, 0.15);
  for (let i = 0; i < cells.length; i++) scores[i] = cells[i] ? combineSpawnScore(Math.fround((cells[i]! - 1) / 31), crowding[i]!) : -1;
  return scores;
}
// Okabe-Ito green / yellow / vermilion: labelled states, never FlashFront's signature red.
export const HEAT_COLORS = ["#D55E00", "#F0E442", "#009E73"] as const;
/**
 * Colors rank land within the current map, not an absolute scale: absolute scores bunched in the
 * middle and painted 68% of Germany one yellow (live, 2026-10-18). Bottom of the ranking is
 * vermilion, the middle yellow (55th percentile), the best ~15% solid green.
 */
export function heatPercentiles(scores: Float32Array, ranks: Float32Array = new Float32Array(scores.length), land: number[] = []): Float32Array {
  land.length = 0;
  for (let i = 0; i < scores.length; i++) if (scores[i]! >= 0) land.push(i);
  land.sort((a, b) => scores[a]! - scores[b]!);
  ranks.fill(-1);
  for (let r = 0; r < land.length;) {
    let end = r; while (end + 1 < land.length && scores[land[end + 1]!] === scores[land[r]!]) end++;
    const p = land.length > 1 ? (r + end) / 2 / (land.length - 1) : 1;
    for (let k = r; k <= end; k++) ranks[land[k]!] = p;
    r = end + 1;
  }
  return ranks;
}
export function heatPixels(scores: Float32Array, pixels: Uint8ClampedArray = new Uint8ClampedArray(scores.length * 4), rankBuffer?: Float32Array, land?: number[]): Uint8ClampedArray {
  const stops = [[213, 94, 0], [240, 228, 66], [0, 158, 115]];
  const ranks = heatPercentiles(scores, rankBuffer, land);
  pixels.fill(0);
  for (let i = 0; i < scores.length; i++) {
    const p = ranks[i]!; if (p < 0) continue;
    const band = p < 0.55 ? 0 : 1; const t = band === 0 ? p / 0.55 : Math.min(1, (p - 0.55) / 0.3);
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = stops[band]![c]! * (1 - t) + stops[band + 1]![c]! * t;
    pixels[i * 4 + 3] = 82;
  }
  return pixels;
}
