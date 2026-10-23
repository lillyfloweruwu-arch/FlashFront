import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { MAPS, HEAT_MAPS } from "./maps.ts";
import { fetchMap, readCachedMap } from "./fetch-maps.ts";
import { COMMUNITY } from "./community.ts";
import { isOcean, spacingFor, scoreMap } from "./score.ts";
import { renderMinimap } from "./render-minimap.ts";

const root = new URL("../../", import.meta.url);
const dataDir = new URL("packages/core/src/spawn/", root);
const imageDir = new URL("apps/launcher/resources/minimaps/", root);
const galleryDir = new URL("apps/gallery/public/minimaps/", root);
const license = `# Map data and derived assets\n\nMap data © OpenFront contributors, CC BY-SA 4.0\n\nSources: https://github.com/openfrontio/OpenFrontIO/tree/v0.34.25/resources/maps\nhttps://github.com/openfrontio/OpenFrontIO/tree/v0.35.2/resources/maps\n\nLicense: https://creativecommons.org/licenses/by-sa/4.0/\n\nFlashFront modifications: terrain-derived spawn scores, coordinates and reasons, and\nresized minimaps recolored with the FlashFront palette. The generated spots.json and\nheatmaps.json (four-tile coast/room grids, quantized and gzip-compressed) and minimap PNGs are distributed under CC BY-SA 4.0. Community notes are short paraphrases\nwith separate source metadata. These heuristic suggestions are not win-rate guarantees.\n`;
for (const dir of [dataDir, imageDir, galleryDir]) { await mkdir(dir, { recursive: true }); await writeFile(new URL("LICENSE-MAPDATA.md", dir), license); }
const maps: Record<string, unknown> = {};
const rows = ["| Map | Picks | Top reason |", "| --- | --- | --- |"];
const start = Date.now();
if (process.argv.includes("--heat-only")) {
  const missing: string[] = []; const fallback: string[] = [];
  for (const map of HEAT_MAPS) {
    let sourceVersion = "0.35.2";
    let cached;
    try { cached = await (process.argv.includes("--fetch") ? fetchMap(map.folder, sourceVersion) : readCachedMap(map.folder, sourceVersion)); }
    catch (error) {
      console.warn(`${map.wireName}: ${String(error)}`);
      sourceVersion = "0.34.25";
      try { cached = await readCachedMap(map.folder); fallback.push(map.wireName); }
      catch { missing.push(map.wireName); continue; }
    }
    const { manifest, terrain } = cached;
    const { heat } = scoreMap(terrain, manifest);
    maps[map.wireName] = { folder: map.folder, width: manifest.map.width, height: manifest.map.height,
      columns: manifest.map16x.width, rows: manifest.map16x.height, sourceVersion,
      data: gzipSync(heat, { level: 9 }).toString("base64") };
    if (["World", "Iceland", "Europe", "Four Islands"].includes(map.wireName)) {
      await writeFile(new URL(`${map.folder}.png`, galleryDir), renderMinimap(terrain, manifest.map16x.width, manifest.map16x.height));
    }
    console.log(`${map.wireName}: ${heat.length} heat cells (${sourceVersion})`);
  }
  const json = JSON.stringify({ format: "gzip-u8-v1", missing, fallback, maps }) + "\n";
  await writeFile(new URL("heatmaps.json", dataDir), json);
  console.log(`Heat grids: ${Object.keys(maps).length}/${HEAT_MAPS.length}, ${Buffer.byteLength(json)} bytes. Missing: ${missing.join(", ") || "none"}. Older cache: ${fallback.join(", ") || "none"}.`);
  process.exit(0);
}
for (const map of MAPS) {
  const { manifest, terrain } = await readCachedMap(map.folder);
  const result = scoreMap(terrain, manifest);
  assert.ok(result.picks.length <= 3, `${map.wireName}: at most 3 picks`);
  for (const [index, p] of result.picks.entries()) {
    const i = p.y / 4 * manifest.map16x.width + p.x / 4;
    assert.equal(result.passable[i], 1, `${map.wireName}: pick is not passable`);
    for (const q of result.picks.slice(index + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= spacingFor(manifest));
    if (map.wireName === "World") assert.ok(p.y <= 0.9 * manifest.map.height, "World: polar pick");
    assert.ok(p.percentile >= 0 && p.percentile <= 1);
    assert.ok(p.reasons.length <= 3);
  }
  maps[map.wireName] = { displayName: map.displayName, folder: map.folder, width: manifest.map.width, height: manifest.map.height, hasOcean: terrain.some(isOcean), picks: result.picks, ...(COMMUNITY[map.wireName] ? { community: COMMUNITY[map.wireName] } : {}), ...(manifest.teamGameSpawnAreas && Object.keys(manifest.teamGameSpawnAreas).length ? { teamAreas: true } : {}) };
  const png = renderMinimap(terrain, manifest.map16x.width, manifest.map16x.height);
  await writeFile(new URL(`${map.folder}.png`, imageDir), png);
  if (["World", "Iceland", "Europe", "Four Islands"].includes(map.wireName)) await writeFile(new URL(`${map.folder}.png`, galleryDir), png);
  rows.push(`| ${map.displayName} | ${result.picks.map(p => `(${p.x}, ${p.y})`).join("; ")} | ${result.picks[0]?.reasons[0] ?? "No eligible land component"} |`);
  console.log(`${map.wireName}: ${result.picks.length} picks; passable + spacing ≥${spacingFor(manifest)} checked; component ≥20k: ${result.eligibleComponents}`);
}
const generatedAt = new Date().toISOString();
const json = JSON.stringify({ rulesVersion: "0.34.25", generatedAt, maps }) + "\n";
assert.ok(Buffer.byteLength(json) < 200_000, "spots.json must stay under 200 KB");
await writeFile(new URL("spots.json", dataDir), json);
await writeFile(new URL("docs/SPAWN-SPOTS-v0.34.25.md", root), `# Spawn spots · OpenFront v0.34.25\n\nGenerated ${generatedAt}. ${MAPS.length} maps. JSON: ${Buffer.byteLength(json)} bytes.\n\nMap data © OpenFront contributors, CC BY-SA 4.0\n\n[Source maps](https://github.com/openfrontio/OpenFrontIO/tree/v0.34.25/resources/maps) · [License](https://creativecommons.org/licenses/by-sa/4.0/)\n\nCoordinates are Normal full tiles, sampled at four-tile resolution. Compact coordinates\nare halved and approximate. Public cached terrain and nation anchors are the only scoring\ninputs. Team areas are flagged, not enforced. No live crowding or game interaction.\n\nWeights from the 145-game calibration: 0.60 reach120 + 0.05 reach60 + 0.10 defense\n+ 0.05 coast - 0.10 nationNear - 0.10 smallIsland. V4b uses percentile-ranked terms\namong valid tiles. The Python report used max-scaled reach and raw other terms, so\nits measured correlations do not validate this percentile variant (see README Decisions).\nTerrain explains a small part of results; player skill and selection can confound the fit.\n\nEach map has up to three passable picks, spaced at least min(250, 0.25 × shorter\nfull-map side) tiles apart. Limited eligible land can leave fewer picks. World has no pick below 90% of its height. Score percentiles\nuse all valid tiles before spacing suppression. Up to three reasons and one independent\nwarning accompany each pick; island, nation and edge warnings take salience priority\nin that order. Community tips cover seven named-area guides and three partial guides;\ntheir dates and sources are embedded in spots.json. Minimap PNGs are regenerated from cache.\n\n${rows.join("\n")}\n`);
console.log(`Built ${MAPS.length} maps, ${Buffer.byteLength(json)} bytes JSON in ${((Date.now() - start) / 1000).toFixed(1)}s. All sanity checks passed.`);
