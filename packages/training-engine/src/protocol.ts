// Messages between client.ts and training.worker.ts. Every message names its session and request.
import type { BoardFrame, BoardSource, EngineFailure, EngineResult, ScheduledAction } from "./contracts";

/** The pinned upstream build (v0.35.4); the vendor manifest and the worker must agree with it. */
export const ENGINE_COMMIT = "14ba82badb1e945ef2e758999238339404fdb788";
/** Record builds this engine replays exactly. v0.35.3 is listed because tools/training/vendor.ts
 * proved its engine and map files byte-identical to v0.35.4 (and its records replay hash-exact). */
export const RECORD_COMMITS: readonly string[] = [ENGINE_COMMIT, "a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7"];

/** v0.35.5: engine code is unchanged from v0.35.4 (only generated map metadata differs), so its records replay
 * exactly, except on the maps whose files changed upstream (map tile data differs from the vendored copy). Review only. */
export const V0355_COMMIT = "bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0";
export const V0355_CHANGED_MAPS: readonly string[] = ["riodejaneiro", "unitedstates"];
export const REVIEW_COMMITS: readonly string[] = [...RECORD_COMMITS, V0355_COMMIT];

/** One map's files as the host supplies them; the worker never reads disk or network. */
export interface MapBytes { mapId: string; mapSize: "Normal" | "Compact"; manifest: unknown; mapBin?: Uint8Array; map4xBin: Uint8Array; map16xBin?: Uint8Array }
export interface RunInput { untilTick: number; own: readonly ScheduledAction[]; opponents: "recorded" | readonly ScheduledAction[] }

export type WorkerRequest = { id: number; session: string } & (
  | { op: "rebuild"; source: BoardSource; map: MapBytes }
  | { op: "frame" }
  | { op: "checkpoint" }
  | { op: "restore"; tick: number; bytes: Uint8Array }
  | { op: "run"; input: RunInput }
  | { op: "rewind"; toTick: number; durationMs: number; fps: number }
  | { op: "cancel"; target: number }
);
export type WorkerResponse =
  | { id: number; session: string; kind: "result"; result: EngineResult<unknown> }
  | { id: number; session: string; kind: "frame"; frame: BoardFrame }
  /** A rewind step: the previous frame with `values` written at `idx`, and this step's lists. */
  | { id: number; session: string; kind: "patch"; meta: Pick<BoardFrame, "tick" | "units" | "players" | "requests" | "alliances">; idx: Uint32Array; values: Uint16Array }
  | { id: number; session: string; kind: "error"; reason: EngineFailure | "staleSession"; message: string };

/** Map id and size a source needs, read without the engine; null when the source lacks them. */
export function sourceMap(source: BoardSource): { mapId: string; mapSize: "Normal" | "Compact"; commit: string | null } | null {
  if (source.kind === "prepared") return { mapId: source.board.mapId, mapSize: source.board.mapSize, commit: source.board.engineCommit };
  const record = source.record as { gitCommit?: unknown; info?: { config?: { gameMap?: unknown; gameMapSize?: unknown } } } | null;
  const config = record?.info?.config;
  if (typeof config?.gameMap !== "string" || (config.gameMapSize !== "Normal" && config.gameMapSize !== "Compact")) return null;
  return { mapId: config.gameMap, mapSize: config.gameMapSize, commit: typeof record?.gitCommit === "string" ? record.gitCommit : null };
}
