import data from "./spots.json";

export const MAP_ATTRIBUTION = "Map data © OpenFront contributors, CC BY-SA 4.0";
export interface SpawnPick { x: number; y: number; score: number; percentile: number; reasons: string[]; warning?: string }
export interface SpawnMap {
  displayName: string; folder: string; width: number; height: number;
  hasOcean: boolean;
  picks: SpawnPick[];
  community?: { map: string; tips: string[]; source: { name: string; url: string; date: string } };
  teamAreas?: boolean;
  note?: string;
}
/** Precomputed public terrain only. No game objects or live player state. */
export function spotsFor(mapWireName: string, mapSize?: "Normal" | "Compact"): SpawnMap | null {
  if (!Object.hasOwn(data.maps, mapWireName)) return null;
  const entry = structuredClone((data.maps as Record<string, SpawnMap>)[mapWireName]!);
  if (mapSize === "Compact") {
    entry.width *= 0.5; entry.height *= 0.5;
    entry.picks = entry.picks.map(p => ({ ...p, x: p.x * 0.5, y: p.y * 0.5 }));
    entry.note = "Compact map: picks are approximate";
  }
  return entry;
}
