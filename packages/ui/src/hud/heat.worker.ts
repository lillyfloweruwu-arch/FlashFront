import { crowdedScores, heatPixels, type HeatGrid, type SpawnHeat } from "@flashfront/core";

let grid: HeatGrid;
let cells: Uint8Array;
let scores: Float32Array;
let crowding: Float32Array;
let ranks: Float32Array;
const land: number[] = [];
self.onmessage = ({ data }: MessageEvent<{ grid?: HeatGrid; cells?: Uint8Array; heat: SpawnHeat; compact: boolean; pixels?: Uint8ClampedArray }>) => {
  if (data.grid && data.cells) {
    grid = data.grid; cells = data.cells;
    scores = new Float32Array(cells.length); crowding = new Float32Array(cells.length); ranks = new Float32Array(cells.length);
  }
  const pixels = heatPixels(crowdedScores(cells, grid, data.heat, data.compact, scores, crowding), data.pixels, ranks, land);
  self.postMessage(pixels, { transfer: [pixels.buffer] });
};
