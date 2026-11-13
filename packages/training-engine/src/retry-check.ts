import type { DrillCheck, MistakeType } from "@flashfront/core";

/** RetrySession used review feedback, not a DrillCheck. Only a send's configured reserve
 * floor can be translated without inventing a post tile or an alliance recommendation. */
export function retryCheck(mistake: MistakeType, reserveFloorPct: number): DrillCheck | undefined {
  if (mistake !== "sendSize" || !Number.isFinite(reserveFloorPct) || reserveFloorPct < 0 || reserveFloorPct > 100) return undefined;
  return { kind: "send", minSendPct: 0, maxSendPct: 100, minReservePct: reserveFloorPct };
}
