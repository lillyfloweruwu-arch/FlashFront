import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { MAPS } from "./maps.ts";
import { parseManifest, readCachedMap, validateTerrain } from "./fetch-maps.ts";
import { componentAreas, diskSum, isOcean, isPassable, scoreMap, spacingFor } from "./score.ts";
import { renderMinimap } from "./render-minimap.ts";
import { COMMUNITY } from "./community.ts";
import data from "../../packages/core/src/spawn/spots.json";

it("matches a brute force disk convolution, including zero-padded edges", () => {
  const w = 7; const h = 5; const a = Float64Array.from({ length: w * h }, (_, i) => (i * 7 % 11) / 10);
  for (const radius of [0, 1, 2, 4]) {
    const actual = diskSum(a, w, h, radius);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) sum += a[(y + dy) * w + x + dx]!;
      }
      expect(actual.sum[y * w + x]).toBeCloseTo(sum, 10);
    }
  }
});
it("uses four-neighbor components without wrapping rows or crossing water", () => {
  expect([...componentAreas(Uint8Array.from([1, 0, 1, 0, 1, 0]), 3, 2)]).toEqual([16, 0, 16, 0, 16, 0]);
  expect([...componentAreas(Uint8Array.from([1, 1, 0, 1]), 2, 2)]).toEqual([48, 48, 0, 48]);
});
it("validates manifest dimensions and rejects truncated terrain", () => {
  expect(() => parseManifest(Buffer.from('{}'))).toThrow();
  const manifest = { map: { width: 8, height: 8 }, map16x: { width: 2, height: 2 }, nations: [] };
  expect(() => validateTerrain(new Uint8Array(3), manifest)).toThrow();
  expect(() => validateTerrain(new Uint8Array(4), manifest)).not.toThrow();
});
it("writes RGB PNGs with the six required colors and a maximum side of 320", () => {
  const png = renderMinimap(Uint8Array.from([32, 128, 138, 148, 159, 0]), 6, 1);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const idatLength = png.readUInt32BE(33);
  expect([...inflateSync(png.subarray(41, 41 + idatLength))]).toEqual([0, 12, 28, 41, 59, 91, 58, 107, 106, 69, 140, 140, 140, 90, 90, 90, 28, 58, 82]);
  const large = renderMinimap(new Uint8Array(1000 * 100), 1000, 100);
  expect(large.readUInt32BE(16)).toBe(320); expect(large.readUInt32BE(20)).toBe(32);
});
it("covers every pinned wire name under 200 KB and preserves all ten guide sources", async () => {
  expect(MAPS).toHaveLength(123);
  expect(Object.keys(data.maps).sort()).toEqual(MAPS.map(m => m.wireName).sort());
  expect((await readFile(new URL("../../packages/core/src/spawn/spots.json", import.meta.url))).length).toBeLessThan(200_000);
  expect(Object.keys(COMMUNITY)).toHaveLength(10);
  for (const entry of Object.values(COMMUNITY)) { expect(entry.source.url).toMatch(/^https:\/\//); expect(entry.source.date).toBeTruthy(); }
});
it("reproduces all picks from cached public files: passable, large components and scaled 250 spacing", async () => {
  // Tests and spawn:build read only the existing pinned terrain cache.
  for (const map of MAPS) {
    const { terrain, manifest } = await readCachedMap(map.folder);
    const result = scoreMap(terrain, manifest); const saved = data.maps[map.wireName];
    expect(saved.hasOcean, map.wireName).toBe(terrain.some(isOcean));
    expect(result.picks, map.wireName).toEqual(saved.picks);
    // V4b spacing can leave fewer than three eligible regions on small islands.
    expect(saved.picks.length, map.wireName).toBeLessThanOrEqual(3);
    for (const [index, p] of saved.picks.entries()) {
      const i = p.y / 4 * manifest.map16x.width + p.x / 4;
      expect(isPassable(terrain[i]!), map.wireName).toBe(true);
      expect(result.areas[i]).toBeGreaterThanOrEqual(20_000);
      for (const q of saved.picks.slice(index + 1)) expect(Math.hypot(p.x - q.x, p.y - q.y), map.wireName).toBeGreaterThanOrEqual(spacingFor(manifest));
      expect(p.reasons.length).toBeGreaterThan(0); expect(p.reasons.length).toBeLessThanOrEqual(3);
      expect(p.percentile).toBeGreaterThanOrEqual(0); expect(p.percentile).toBeLessThanOrEqual(1);
      expect(JSON.stringify(p)).not.toMatch(/always|must|winners do|betray/i);
    }
    const png = await readFile(new URL(`../../apps/launcher/resources/minimaps/${map.folder}.png`, import.meta.url));
    expect(png).toEqual(renderMinimap(terrain, manifest.map16x.width, manifest.map16x.height));
  }
}, 240_000);
it("keeps World picks out of Antarctica and at least 250 tiles apart", () => {
  // V4b drops the old coast/back-wall weights and the Iceland coastal-pick expectation.
  expect(data.maps.World.picks).toHaveLength(3);
  for (const [i, p] of data.maps.World.picks.entries()) {
    expect(p.y).toBeLessThanOrEqual(0.9 * data.maps.World.height);
    for (const q of data.maps.World.picks.slice(i + 1)) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(250);
  }
});
