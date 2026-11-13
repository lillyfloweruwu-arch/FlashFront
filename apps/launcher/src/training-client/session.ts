import type { ClientSessionData } from "../review-types";
import type { TrainingServer } from "./TrainingServer";

export interface TrainingSession {
  data: ClientSessionData;
  snapshot: Uint8Array;
  mode: "play" | "demo" | "replay";
  server?: TrainingServer;
  onRunnerStarted?: () => void;
}
// Scoped to this renderer module, never placed on window/globalThis. The bridge owns registration
// and removal; WorkerClient receives only the upstream gameStartInfo, which retains gameID.
const sessions = new Map<string, TrainingSession>();
export function registerSession(gameID: string, session: TrainingSession): void {
  if (sessions.has(gameID)) throw new Error("Training game already running");
  sessions.set(gameID, session);
}
export function removeSession(gameID: string): void { sessions.delete(gameID); }
export function snapshotFor(gameID: string): Uint8Array {
  return sessionFor(gameID).snapshot.slice();
}
export function sessionFor(gameID: string): TrainingSession {
  const session = sessions.get(gameID);
  if (!session) throw new Error("Training snapshot was not supplied by the bridge");
  return session;
}

