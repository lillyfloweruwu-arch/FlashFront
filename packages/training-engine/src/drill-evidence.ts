// Turns a simulated drill attempt into judge evidence: what the engine actually executed, read from the
// branch's normalized intents, own samples and the final board, never from which button was pressed.
import { derivePlayerIds } from "@flashfront/core";
import type { DrillCheck, DrillEvidence } from "@flashfront/core";
import type { BoardFrame, TrainingTrace } from "./contracts";

/** A drill's cast: display label to session player id, and to the client id that plays it. */
export interface DrillCast { labels: Record<string, string>; clients: Record<string, string> }
export const POST_KIND = "Defense Post";

/** `frame` is the board at the check's deadline (posts must stand then); `startUnits` are unit ids already there at the start. */
export function drillEvidence(check: DrillCheck, trace: TrainingTrace, frame: BoardFrame, cast: DrillCast, startTick: number, startUnits: ReadonlySet<string> = new Set()): DrillEvidence {
  const { record, match } = trace;
  const own = match.me.clientId!;
  const ownKey = cast.labels.You!;
  const observedUntilTick = match.samples.at(-1)?.tick ?? startTick;
  const mine = record.intents.filter((i) => i.by === own && i.tick >= startTick);
  switch (check.kind) {
    case "ally": {
      const ids = derivePlayerIds(record.gameId, record.players.length);
      const labelOf = (upstreamId: string) => {
        const client = record.players[ids.indexOf(upstreamId)]?.clientId;
        return Object.keys(cast.clients).find((l) => cast.clients[l] === client);
      };
      const first = mine.find((i) => i.kind === "allianceRequest" || i.kind === "allianceReject");
      if (!first) return { observedUntilTick };
      const target = labelOf(first.kind === "allianceRequest" ? first.to : first.kind === "allianceReject" ? first.requestor : "");
      if (first.kind === "allianceReject") return { decision: "decline", target, decisionTick: first.tick, observedUntilTick };
      const key = target ? cast.labels[target] : undefined;
      const allied = frame.alliances.some((a) => (a.a === ownKey && a.b === key) || (a.b === ownKey && a.a === key));
      return { decision: allied ? "accept" : "request", target, decisionTick: first.tick, observedUntilTick };
    }
    case "post": {
      const build = mine.find((i) => i.kind === "build" && i.unit === POST_KIND);
      const ownSmall = Number(ownKey.slice(1));
      const unit = frame.units.find((u) => u.owner === ownSmall && u.kind === POST_KIND && !startUnits.has(u.id));
      if (!build || !unit) return { observedUntilTick };
      return { postTile: unit.tile, postTick: build.tick, observedUntilTick };
    }
    case "send": {
      const at = (tick: number) => match.samples.find((s) => s.tick === tick);
      const sendIntent = mine.find((i) => i.kind === "attack");
      if (!sendIntent || sendIntent.kind !== "attack") {
        const s = at(startTick);
        return s && s.maxTroops > 0 ? { sentPct: 0, reservePct: (s.troops / s.maxTroops) * 100, observedUntilTick } : { observedUntilTick };
      }
      const s = at(sendIntent.tick);
      if (!s || s.troops <= 0 || s.maxTroops <= 0 || sendIntent.troops === null) return { observedUntilTick };
      return { sentPct: (sendIntent.troops / s.troops) * 100, reservePct: ((s.troops - sendIntent.troops) / s.maxTroops) * 100, observedUntilTick };
    }
  }
}
