// SPDX-License-Identifier: AGPL-3.0-only
// Copyright OpenFront and Contributors.
// FlashFront: upstream TerrainMapFileLoader with maps pinned to the private local scheme.
import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap, type TerrainMapData } from "@openfront/engine-lib/game/TerrainMapLoader";
import { FetchGameMapLoader } from "@openfront/shared/FetchGameMapLoader";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";

export const terrainMapFileLoader = new FetchGameMapLoader("fftraining://app/maps");
const terrainMaps = new Map<string, TerrainMapData>();

/** The maps the client draws on, built once per map and size. */
export async function loadCachedTerrainMap(map: GameMapType, mapSize: GameMapSize): Promise<TerrainMapData> {
  const key = `${map}:${mapSize}`;
  const cached = terrainMaps.get(key);
  if (cached !== undefined) return cached;
  const terrain = await loadTerrainMap(await loadMapFiles(terrainMapFileLoader, map, mapSize));
  terrainMaps.set(key, terrain);
  return terrain;
}
