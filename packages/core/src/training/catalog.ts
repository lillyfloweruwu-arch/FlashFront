// The prepared drill catalogue: lightweight metadata only. Boards and scripts are launcher assets,
// written with this file by packages/training-engine/src/drills/author.gen.ts and pinned by SHA-256.
import data from "./catalog.json";
import { validateCatalog, type PreparedDrill } from "./drills";

export interface DrillAssetHashes { board: string; script: string }
export const DRILL_ASSET_HASHES: Readonly<Record<string, DrillAssetHashes>> = Object.fromEntries(data.drills.map((d) => [d.id, d.assets]));
export const DRILL_CATALOG: readonly PreparedDrill[] = validateCatalog(data.drills.map(({ assets: _assets, ...drill }) => drill));
