import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { HEAT_MAPS } from "./maps.ts";

export interface Manifest {
  map: { width: number; height: number };
  map16x: { width: number; height: number };
  nations: { name: string; coordinates?: [number, number] }[];
  teamGameSpawnAreas?: Record<string, unknown[]>;
}
export const CACHE = new URL("./.cache/v0.34.25/", import.meta.url);
export const MAP_BASE = "https://raw.githubusercontent.com/openfrontio/OpenFrontIO/v0.34.25/resources/maps/";
let lastRequest = 0;

export function parseManifest(bytes: Uint8Array): Manifest {
  const m = JSON.parse(Buffer.from(bytes).toString("utf8")) as Manifest;
  for (const size of [m.map, m.map16x]) {
    if (!size || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width <= 0 || size.height <= 0 || size.width * size.height > 20_000_000) throw Error("Invalid manifest dimensions");
  }
  if (m.map.width !== m.map16x.width * 4 || m.map.height !== m.map16x.height * 4 || !Array.isArray(m.nations)) throw Error("Unexpected map16x scale or nations");
  for (const n of m.nations) if (n.coordinates && (n.coordinates.length !== 2 || !n.coordinates.every(Number.isFinite))) throw Error("Invalid nation coordinates");
  return m;
}
export function validateTerrain(bytes: Uint8Array, manifest: Manifest) {
  if (bytes.length !== manifest.map16x.width * manifest.map16x.height) throw Error("map16x.bin length does not match manifest dimensions");
}
async function cached(folder: string, file: "manifest.json" | "map16x.bin", validate: (b: Uint8Array) => void, version: string): Promise<Uint8Array> {
  const dir = new URL(`./.cache/v${version}/${folder}/`, import.meta.url); const path = new URL(file, dir);
  try {
    const bytes = await readFile(path); validate(bytes); return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(Math.max(0, 600 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    // Only these two pinned raw GitHub files; refuse redirects to any other host.
    const response = await fetch(`${MAP_BASE.replace("0.34.25", version)}${folder}/${file}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel(); await delay(2000 * (attempt + 1)); continue;
    }
    if (!response.ok) throw Error(`${folder}/${file}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer()); validate(bytes);
    const temporary = new URL(`${file}.tmp`, dir);
    await writeFile(temporary, bytes); await rename(temporary, path);
    return bytes;
  }
  throw Error(`Download failed: ${folder}/${file}`);
}
export async function fetchMap(folder: string, version = "0.34.25") {
  if (!HEAT_MAPS.some(map => map.folder === folder) || !["0.34.25", "0.35.2", "0.35.4"].includes(version)) throw Error("Unknown map folder or version");
  const manifest = parseManifest(await cached(folder, "manifest.json", bytes => { parseManifest(bytes); }, version));
  const terrain = await cached(folder, "map16x.bin", bytes => validateTerrain(bytes, manifest), version);
  return { manifest, terrain };
}
export async function readCachedMap(folder: string, version = "0.34.25") {
  const dir = new URL(`./.cache/v${version}/${folder}/`, import.meta.url);
  const manifest = parseManifest(await readFile(new URL("manifest.json", dir)));
  const terrain = await readFile(new URL("map16x.bin", dir)); validateTerrain(terrain, manifest);
  return { manifest, terrain };
}
