import data from "./spawn/heatmaps.json";
import type { HeatGrid } from "./spawn/heat";

/** Bundled per-map spawn heat grids (2.7 MB). Import only where the heat canvas is drawn. */
export function heatGridFor(map: string): HeatGrid | null {
  return Object.hasOwn(data.maps, map) ? (data.maps as Record<string, HeatGrid>)[map]! : null;
}
export async function decodeHeatGrid(grid: HeatGrid): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(grid.data), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const cells = new Uint8Array(await new Response(stream).arrayBuffer());
  if (cells.length !== grid.columns * grid.rows || cells.some(v => v > 32)) throw Error("Invalid heat grid");
  return cells;
}
