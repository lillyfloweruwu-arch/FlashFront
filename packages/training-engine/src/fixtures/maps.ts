// The Onion map (CC BY-SA 4.0, "OpenFront"; see vendor/openfront/LICENSE-ASSETS) at the pinned build,
// brotli-packed like the shipped maps. Tests use it so they run without the full map pack.
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import type { MapBytes } from "../protocol";

const read = (name: string) => new Uint8Array(brotliDecompressSync(readFileSync(new URL(`./maps/onion/${name}.br`, import.meta.url))));

export function onionMap(mapSize: "Normal" | "Compact" = "Normal"): MapBytes {
  const manifest = JSON.parse(new TextDecoder().decode(read("manifest.json")));
  return mapSize === "Normal"
    ? { mapId: "Onion", mapSize, manifest, mapBin: read("map.bin"), map4xBin: read("map4x.bin") }
    : { mapId: "Onion", mapSize, manifest, map4xBin: read("map4x.bin"), map16xBin: read("map16x.bin") };
}

/** A Compact map packed like the shipped maps (Europe, World, Black Sea; CC BY-SA 4.0, "OpenFront"). */
export function compactMap(key: "europe" | "world" | "blacksea"): MapBytes {
  const get = (name: string) => new Uint8Array(brotliDecompressSync(readFileSync(new URL(`./maps/${key}/${name}.br`, import.meta.url))));
  const manifest = JSON.parse(new TextDecoder().decode(get("manifest.json")));
  return { mapId: manifest.name ?? manifest.id, mapSize: "Compact", manifest, map4xBin: get("map4x.bin"), map16xBin: get("map16x.bin") };
}
