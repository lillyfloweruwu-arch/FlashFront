// E's stable Training engine contracts (sub-plan E Task 2). F builds drills on these types only.
// This module has no engine side effects: importing it loads no worker, engine code or map bytes.
import type { RecordedMatch, ReviewRecord } from "@flashfront/core";

export type EngineFailure = "inMatch" | "missingRecord" | "unsupportedVersion" | "missingMap" | "invalidRecord" | "desync" | "cancelled" | "historyLimit";
export type EngineResult<T> = { status: "ready"; value: T } | { status: "unavailable"; reason: EngineFailure };
/** Targets and actors are session-local player ids (`p<smallId>`), never public ids or names. */
export type TrainingAction =
  | { kind: "attack"; target: string | null; troops: number }
  | { kind: "allianceRequest" | "allianceAccept" | "allianceDecline"; target: string }
  | { kind: "buildPost"; tile: number }
  | { kind: "wait" };
export interface ScheduledAction { tick: number; actor: string; action: TrainingAction }
export interface PreparedBoard { id: string; engineCommit: string; mapId: string; mapSize: "Normal" | "Compact"; record: unknown; startTick: number; ownClientId: string }
export type BoardSource = { kind: "record"; record: unknown; ownClientId: string; startTick: number } | { kind: "prepared"; board: PreparedBoard };
/** `ownPlayer` is the session-local id of the player the source's own client controls. */
export interface BoardHandle { sessionId: string; startTick: number; endTick: number; ticksPerSecond: number; ownPlayer: string; mapId: string; mapSize: "Normal" | "Compact" }
/** `owners` holds each tile's owner small id (0 = nobody); player `p<n>` owns tiles marked n. */
export interface BoardFrame {
  tick: number; width: number; height: number; terrain: Uint8Array; owners: Uint16Array;
  requests: readonly { from: string; to: string }[];
  alliances: readonly { a: string; b: string; expiresTick: number }[];
  units: readonly { id: string; tile: number; owner: number; kind: string; troops: number }[];
  players: readonly { id: string; troops: number; gold: number; tiles: number }[];
}
export interface EngineCheckpoint { sessionId: string; tick: number; bytes: Uint8Array }
export interface TrainingTrace { match: RecordedMatch; record: ReviewRecord }
export interface TrainingEngine {
  rebuild(source: BoardSource, signal: AbortSignal): Promise<EngineResult<BoardHandle>>;
  frame(): Promise<BoardFrame>;
  checkpoint(): Promise<EngineCheckpoint>;
  restore(checkpoint: EngineCheckpoint): Promise<void>;
  run(input: { untilTick: number; own: readonly ScheduledAction[]; opponents: "recorded" | readonly ScheduledAction[] }, signal: AbortSignal): Promise<EngineResult<TrainingTrace>>;
  rewind(options: { toTick: number; durationMs: 1500; onFrame: (frame: BoardFrame) => void }, signal: AbortSignal): Promise<EngineResult<void>>;
  dispose(): void;
}

/** Rejection for calls made after dispose, while a call is cancelled, or on a stale session. */
export class TrainingEngineError extends Error {
  constructor(readonly reason: EngineFailure | "staleSession", message: string = reason) { super(message); this.name = "TrainingEngineError"; }
}

export const PLAYER_ID = /^p[0-9]{1,5}$/;
const nonNegativeInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Why an action is invalid, or null. Legality on the board is the engine's call, not this one's. */
export function actionProblem(action: TrainingAction): string | null {
  switch (action.kind) {
    case "attack":
      if (action.target !== null && !PLAYER_ID.test(action.target)) return "attack target must be a player id or null";
      return typeof action.troops === "number" && Number.isFinite(action.troops) && action.troops > 0 ? null : "attack troops must be positive";
    case "allianceRequest": case "allianceAccept": case "allianceDecline":
      return typeof action.target === "string" && PLAYER_ID.test(action.target) ? null : `${action.kind} needs a player id target`;
    case "buildPost":
      return nonNegativeInt(action.tile) ? null : "post tile must be a non-negative integer";
    case "wait":
      return null;
    default:
      return "unknown action";
  }
}

export function scheduledProblem(s: ScheduledAction): string | null {
  if (!nonNegativeInt(s.tick)) return "tick must be a non-negative integer";
  if (typeof s.actor !== "string" || !PLAYER_ID.test(s.actor)) return "actor must be a player id";
  return actionProblem(s.action);
}
