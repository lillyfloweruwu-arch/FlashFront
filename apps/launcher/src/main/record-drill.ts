import type { DrillCheck, MistakeType } from "@flashfront/core";
import type { EngineResult } from "@flashfront/training-engine/contracts";
import { RECORD_COMMITS, sourceMap, type MapBytes } from "@flashfront/training-engine/protocol";
import type { DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import { retryCheck } from "../../../../packages/training-engine/src/retry-check";

export interface RecordDrillInput { record: unknown; ownClientId: string; tick: number; mistake: MistakeType; map: MapBytes; check: DrillCheck }
export type RecordDrillResult = EngineResult<{ data: DrillClientData; snapshot: Uint8Array }>;
export interface RecordDrillDeps {
  signal?: AbortSignal;
  loadMap(mapId: string, mapSize: string): Promise<EngineResult<MapBytes>>;
  reserveFloorPct: number;
  /** Production runs this in a Node worker so a large record cannot block Electron. */
  build: (input: RecordDrillInput) => Promise<RecordDrillResult>;
}

export function createRecordDrillBuilder(deps: RecordDrillDeps) {
  return async function drillFromRecord(record: unknown, ownClientId: string, tick: number, mistake: MistakeType): Promise<RecordDrillResult> {
    if (deps.signal?.aborted) return { status: "unavailable", reason: "cancelled" };
    const source = { kind: "record" as const, record, ownClientId, startTick: tick };
    const mapSpec = sourceMap(source);
    if (!mapSpec || !mapSpec.commit || !Number.isSafeInteger(tick) || tick < 0) return { status: "unavailable", reason: "invalidRecord" };
    if (!RECORD_COMMITS.includes(mapSpec.commit)) return { status: "unavailable", reason: "unsupportedVersion" };
    const check = retryCheck(mistake, deps.reserveFloorPct);
    if (!check) return { status: "unavailable", reason: "invalidRecord" };
    const map = await deps.loadMap(mapSpec.mapId, mapSpec.mapSize);
    if (deps.signal?.aborted) return { status: "unavailable", reason: "cancelled" };
    if (map.status !== "ready") return map;
    return deps.build({ record, ownClientId, tick, mistake, map: map.value, check });
  };
}


