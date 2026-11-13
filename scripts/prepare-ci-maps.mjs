import { readFileSync } from "node:fs";
import { fetchMap } from "../tools/spawn/fetch-maps.ts";
const spots = JSON.parse(readFileSync(new URL("../packages/core/src/spawn/spots.json", import.meta.url)));
const heat = JSON.parse(readFileSync(new URL("../packages/core/src/spawn/heatmaps.json", import.meta.url)));
const requests = new Map();
for (const m of Object.values(spots.maps)) requests.set(`0.34.25/${m.folder}`, [m.folder, "0.34.25"]);
for (const m of Object.values(heat.maps)) requests.set(`${m.sourceVersion}/${m.folder}`, [m.folder, m.sourceVersion]);
for (const [key, args] of requests) { await fetchMap(...args); console.log(`Prepared ${key}`); }
