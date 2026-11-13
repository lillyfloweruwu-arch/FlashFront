import type { DrillCheck } from "../../../../packages/core/src/training/drills";
import type { DrillEvidence } from "../../../../packages/core/src/training/judge";
import type { StampedIntent } from "./TrainingServer";

export interface IntentContext {
  tick: number;
  /** Read from the current game's own player at intent time. */
  ownTroops: number;
  idOf(clientOrPlayerId: string): string;
}

export function evidenceFor(intent: StampedIntent, check: DrillCheck, ctx: IntentContext): DrillEvidence | null {
  switch (check.kind) {
    case "ally":
      if (intent.type === "allianceReject") {
        return { decision: "decline", target: ctx.idOf(intent.requestor), decisionTick: ctx.tick };
      }
      if (intent.type === "allianceRequest") {
        // Upstream accepts an incoming offer by sending a reciprocal request. Prepared
        // request drills have no incoming offer; accept/decline drills supply one.
        return { decision: check.decision === "request" ? "request" : "accept",
          target: ctx.idOf(intent.recipient), decisionTick: ctx.tick };
      }
      return null;
    case "send": {
      if (intent.type !== "attack") return null;
      // Null troops asks the engine for its default size, which this context cannot know.
      if (intent.troops === null || !Number.isFinite(intent.troops) || !Number.isFinite(ctx.ownTroops) || ctx.ownTroops <= 0) return {};
      const sentPct = intent.troops / ctx.ownTroops * 100;
      return { sentPct, reservePct: 100 - sentPct };
    }
    case "post":
      return intent.type === "build_unit" && intent.unit === "Defense Post"
        ? { postTile: intent.tile, postTick: ctx.tick } : null;
  }
}
