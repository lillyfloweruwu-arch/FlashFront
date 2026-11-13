import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { HEAT_MAPS } from "./maps.ts";
import { readCachedMap } from "./fetch-maps.ts";
import { isPassable, scoreMap } from "./score.ts";
import data from "../../packages/core/src/spawn/heatmaps.json";

it("ships a grid or an explicit missing entry for every old and v0.35 map", async () => {
  expect([...Object.keys(data.maps), ...data.missing].sort()).toEqual(HEAT_MAPS.map(m => m.wireName).sort());
  expect(data.format).toBe("gzip-u8-v1");
  const bytes = await readFile(new URL("../../packages/core/src/spawn/heatmaps.json", import.meta.url));
  expect(bytes.length).toBeLessThan(5_000_000);
  for (const grid of Object.values(data.maps)) {
    const cells = gunzipSync(Buffer.from(grid.data, "base64"));
    expect(cells.length).toBe(grid.columns * grid.rows);
    expect(grid.width / grid.columns).toBe(4); expect(grid.height / grid.rows).toBe(4);
    expect(cells.every(v => v <= 32)).toBe(true);
    const { terrain } = await readCachedMap(grid.folder, grid.sourceVersion);
    expect(cells.every((v, i) => (v > 0) === isPassable(terrain[i]!)), grid.folder).toBe(true);
  }
}, 30_000);
it("reproduces the public-terrain grid without changing calibrated picks", async () => {
  const grid = data.maps.World;
  const { manifest, terrain } = await readCachedMap(grid.folder, grid.sourceVersion);
  const result = scoreMap(terrain, manifest);
  expect(Buffer.from(result.heat)).toEqual(gunzipSync(Buffer.from(grid.data, "base64")));
  expect(result.heat.some(v => v >= 28)).toBe(true);
}, 30_000);
it("Brain Rot's grid comes from its v0.35.4 terrain (OpenFront v0.35.3 reworked the map)", () => {
  expect(data.maps["Brain Rot"].sourceVersion).toBe("0.35.4");
  // Ommatrypta's terrain files did not change in v0.35.3, only its layer images, so its grid stays.
  expect(data.maps.Ommatrypta.sourceVersion).toBe("0.35.2");
});
