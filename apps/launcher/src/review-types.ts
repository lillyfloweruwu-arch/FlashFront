import type { EngineFailure, EngineResult } from "@flashfront/training-engine/contracts";
import type { MapBytes } from "@flashfront/training-engine/protocol";
import type { DrillClientData } from "../../../packages/training-engine/src/drill-client-data";
export type ClientSessionData = Pick<DrillClientData, "engineCommit" | "snapshotFormat" | "startTick" | "ownClientId" | "gameStartInfo" | "opponents" | "coach">;
export type ReviewClientData = ClientSessionData & { endTick: number };
export type ReviewLoad = EngineResult<{ data: ReviewClientData; snapshot: Uint8Array }>;
export interface ReviewBuildInput { record: unknown; ownClientId: string; map: MapBytes; tick: number }
export interface ReviewBounds { x: number; y: number; width: number; height: number }
export type ReviewBoardStatus = { status: "loading" } | { status: "ready"; tick: number } | { status: "unavailable"; reason: EngineFailure | "bootFailed" };
export interface ReviewBridgeApi {
  load(): Promise<ReviewLoad>;
  onSnapshot(cb: (load: ReviewLoad) => void): () => void;
  ready(tick: number): void;
  failed(): void;
  step(direction: -1 | 1): void;
}
