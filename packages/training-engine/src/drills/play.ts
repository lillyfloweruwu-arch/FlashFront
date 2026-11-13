// Plays one prepared drill attempt on the real engine and judges it. Used by the authoring script and
// the catalogue test; the launcher drives the same steps through the worker.
import { judgeDrill } from "@flashfront/core";
import type { DrillCheck, DrillEvidence, DrillVerdict } from "@flashfront/core";
import type { BoardFrame, PreparedBoard, ScheduledAction } from "../contracts";
import { drillEvidence, type DrillCast } from "../drill-evidence";
import { compactMap } from "../fixtures/maps";
import { BoardSession } from "../rebuild";
import { ATTEMPT_TICKS } from "./author";

const MAPS: Record<string, "europe" | "world" | "blacksea"> = { Europe: "europe", World: "world", "Black Sea": "blacksea" };
const control = { cancelled: () => false, yieldNow: async () => {} };

export async function openDrill(board: PreparedBoard): Promise<BoardSession> {
  const key = MAPS[board.mapId];
  if (!key) throw new Error(`no fixture map for ${board.mapId}`);
  const built = await BoardSession.rebuild(`drill-${board.id}`, { kind: "prepared", board }, compactMap(key), control);
  if (built.status !== "ready") throw new Error(`${board.id}: ${built.reason}`);
  return built.value;
}

export async function playAttempt(session: BoardSession, board: PreparedBoard, cast: DrillCast, check: DrillCheck, own: readonly ScheduledAction[], opponents: readonly ScheduledAction[]): Promise<{ verdict: DrillVerdict; evidence: DrillEvidence }> {
  const startUnits = new Set(session.frame().units.map((u) => u.id));
  const end = board.startTick + ATTEMPT_TICKS;
  const deadline = check.kind === "post" ? check.beforeTick : check.kind === "ally" ? check.deadlineTick + 1 : end;
  let atDeadline: BoardFrame | null = null;
  if (deadline < end) {
    const first = await session.run({ untilTick: deadline, own, opponents }, control);
    if (first.status !== "ready") throw new Error(`${board.id}: run ${first.reason}`);
    atDeadline = session.frame();
  }
  const r = await session.run({ untilTick: end, own, opponents }, control);
  if (r.status !== "ready") throw new Error(`${board.id}: run ${r.reason}`);
  const evidence = drillEvidence(check, r.value, check.kind === "post" && atDeadline ? atDeadline : session.frame(), cast, board.startTick, startUnits);
  return { verdict: judgeDrill(check, evidence), evidence };
}
