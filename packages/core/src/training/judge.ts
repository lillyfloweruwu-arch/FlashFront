// Judges a prepared drill attempt from evidence the engine run produced, not from button intent.
import type { DrillCheck } from "./drills";

export interface DrillEvidence {
  decision?: "accept" | "decline" | "request"; target?: string; decisionTick?: number;
  postTile?: number; postTick?: number;
  sentPct?: number; reservePct?: number;
  /** How far the attempt was simulated; lets "no decision" become wrong once the deadline passed. */
  observedUntilTick?: number;
}
export type DrillVerdict = "correct" | "wrong" | "unavailable";

const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function judgeDrill(check: DrillCheck, e: DrillEvidence): DrillVerdict {
  switch (check.kind) {
    case "ally": {
      if (e.decision === undefined) return known(e.observedUntilTick) && e.observedUntilTick > check.deadlineTick ? "wrong" : "unavailable";
      if (e.target === undefined || !known(e.decisionTick)) return "unavailable";
      return e.decision === check.decision && e.target === check.target && e.decisionTick <= check.deadlineTick ? "correct" : "wrong";
    }
    case "post": {
      if (!known(e.postTile) || !known(e.postTick)) return known(e.observedUntilTick) && e.observedUntilTick >= check.beforeTick ? "wrong" : "unavailable";
      return check.allowedTiles.includes(e.postTile) && e.postTick < check.beforeTick ? "correct" : "wrong";
    }
    case "send": {
      if (!known(e.sentPct) || !known(e.reservePct)) return "unavailable";
      return e.sentPct >= check.minSendPct && e.sentPct <= check.maxSendPct && e.reservePct >= check.minReservePct ? "correct" : "wrong";
    }
  }
}
