import { TICKS_PER_SECOND } from "../mechanics";
import type { RecordedMatch } from "../recorder";
import { toRecordingSec } from "./pushes";
import { ownPlayer, targetKind, type ReviewRecord, type TargetKind } from "./record";
import { REVIEW_THRESHOLDS as T } from "./thresholds";
import { toRecordingTick, type IncomingWave } from "./waves";

export interface AllyRequest {
  direction: "incoming" | "outgoing"; tick: number; t: number;
  other: { clientId?: string; playerId?: string; kind: TargetKind; name?: string };
  outcome: "accepted" | "rejected" | "ignored" | "unknown"; attackedMeAfterSec?: number; landLostPct?: number;
}
export interface Opening { portSec?: number; allySec?: number; applicable: boolean }

type Pending = AllyRequest & { answerTick?: number };

/** Pairs requests that involve me. Accepting is a request back; nations answer inside the engine, so their outcome is unknown. */
function pairRequests(record: ReviewRecord, match: RecordedMatch): Pending[] {
  const own = ownPlayer(record, match.me.clientId ?? "");
  if (!record.idsVerified || !own?.playerId) return [];
  const window = T.allyRequestSec * TICKS_PER_SECOND, out: Pending[] = [];
  const open = (direction: AllyRequest["direction"], playerId: string, tick: number) =>
    out.find(r => r.direction === direction && r.outcome === "ignored" && r.other.playerId === playerId && tick >= r.tick && tick - r.tick <= window);
  const answer = (r: Pending | undefined, outcome: "accepted" | "rejected", tick: number) => {
    if (!r) return false;
    r.outcome = outcome; if (outcome === "accepted") r.answerTick = tick;
    return true;
  };
  for (const i of record.intents) {
    if (i.kind === "allianceRequest" && i.to === own.playerId && i.by !== own.clientId) {
      const from = record.players.find(p => p.clientId === i.by);
      if (!from?.playerId || answer(open("outgoing", from.playerId, i.tick), "accepted", i.tick)) continue;
      out.push({ direction: "incoming", tick: i.tick, t: toRecordingSec(match, i.tick), outcome: "ignored",
        other: { clientId: from.clientId, playerId: from.playerId, kind: targetKind(record, from.playerId), name: from.name } });
    } else if (i.kind === "allianceRequest" && i.by === own.clientId && i.to !== own.playerId) {
      if (answer(open("incoming", i.to, i.tick), "accepted", i.tick)) continue;
      const to = record.players.find(p => p.playerId === i.to), kind = targetKind(record, i.to);
      out.push({ direction: "outgoing", tick: i.tick, t: toRecordingSec(match, i.tick), outcome: kind === "human" ? "ignored" : "unknown",
        other: to ? { clientId: to.clientId, playerId: i.to, kind, name: to.name } : { playerId: i.to, kind } });
    } else if (i.kind === "allianceReject" && i.by === own.clientId) {
      answer(open("incoming", i.requestor, i.tick), "rejected", i.tick);
    } else if (i.kind === "allianceReject" && i.requestor === own.playerId) {
      const from = record.players.find(p => p.clientId === i.by);
      if (from?.playerId) answer(open("outgoing", from.playerId, i.tick), "rejected", i.tick);
    }
  }
  for (const request of out)
    if (request.outcome === "ignored" && record.durationTicks < request.tick + window) request.outcome = "unknown";
  return out;
}

export function allyRequests(record: ReviewRecord, match: RecordedMatch, waves: IncomingWave[]): AllyRequest[] {
  const own = ownPlayer(record, match.me.clientId ?? "");
  return pairRequests(record, match).map(({ answerTick: _, ...r }) => {
    if (r.direction !== "incoming" || !r.other.clientId) return r;
    const hit = record.intents.find(i => i.kind === "attack" && i.by === r.other.clientId && i.target === own?.playerId
      && i.tick > r.tick && i.tick - r.tick <= T.allyBetrayalSec * TICKS_PER_SECOND);
    if (!hit) return r;
    r.attackedMeAfterSec = (hit.tick - r.tick) / TICKS_PER_SECOND;
    const wave = waves.filter(w => w.attackers.includes(r.other.clientId!) && w.startTick <= hit.tick).at(-1);
    if (wave?.landLostPct !== undefined) r.landLostPct = wave.landLostPct;
    return r;
  });
}

const earliest = (values: number[]) => values.length ? Math.min(...values) : undefined;

/** Port and first alliance timing in game seconds. Skipped without alliances, in 1v1 ranked, or when the recording missed the start. */
export function openingCheck(record: ReviewRecord, match: RecordedMatch): Opening {
  const ownClient = match.me.clientId;
  const portTick = earliest([
    ...record.intents.filter(i => i.kind === "build" && i.by === ownClient && i.unit === "Port").map(i => i.tick),
    ...match.events.filter(e => e.kind === "build" && e.unit === "portLevels").map(e => toRecordingTick(match, e.t)),
  ]);
  const allyTick = earliest([
    ...pairRequests(record, match).flatMap(r => r.answerTick === undefined ? [] : [r.answerTick]),
    ...match.samples.filter(s => (s.allianceCount ?? 0) > 0).slice(0, 1).map(s => s.tick),
  ]);
  const opening: Opening = {
    applicable: record.alliancesEnabled && match.rankedType !== "1v1" && (match.samples[0]?.tick ?? Infinity) <= T.openingStartTick
      && (match.samples.at(-1)?.tick ?? 0) >= T.openingSec * TICKS_PER_SECOND,
  };
  if (portTick !== undefined) opening.portSec = portTick / TICKS_PER_SECOND;
  if (allyTick !== undefined) opening.allySec = allyTick / TICKS_PER_SECOND;
  return opening;
}
