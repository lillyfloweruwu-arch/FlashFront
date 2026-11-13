import type { RecordedMatch } from "../recorder";
import { accuracy, type AccuracyBreakdown } from "./accuracy";
import { allyRequests, openingCheck, type AllyRequest, type Opening } from "./allies";
import { labelPushes, type LabelledPush, type PushLabel } from "./labels";
import { findMoments, mistakeCosts, type KeyMoment, type MistakeType } from "./moments";
import { extractPushes, toRecordingSec } from "./pushes";
import { ownPlayer, type ReviewRecord } from "./record";
import { incomingWaves, type IncomingWave } from "./waves";

/** What leaves the review: other players appear only by name, never by client id. */
export type ReviewWave = Omit<IncomingWave, "attackers"> & { attackers: { name: string }[] };
export type ReviewAlly = Omit<AllyRequest, "other"> & { other: Omit<AllyRequest["other"], "clientId"> };
export interface GameReview {
  gameId: string; accuracy: AccuracyBreakdown; counts: Record<PushLabel, number>; pushes: LabelledPush[];
  waves: ReviewWave[]; allies: ReviewAlly[]; opening: Opening; keyMoments: KeyMoment[]; mistakes: Record<MistakeType, number>;
  coverage: { ratedPushes: number; totalPushes: number; idsVerified: boolean };
}

export function gameReview(record: ReviewRecord, match: RecordedMatch, opts: { reserveFloorPct: number }): GameReview {
  if (!ownPlayer(record, match.me.clientId ?? "")) throw new Error("notInRecord");
  const pushes = labelPushes(extractPushes(record, match), opts.reserveFloorPct);
  const waves = incomingWaves(record, match), allies = allyRequests(record, match, waves), opening = openingCheck(record, match);
  const moments = findMoments(pushes, waves, allies, opening, tick => toRecordingSec(match, tick));
  const counts: Record<PushLabel, number> = { great: 0, good: 0, neutral: 0, costly: 0, blunder: 0 };
  for (const p of pushes) if (p.label) counts[p.label]++;
  const name = (clientId: string) => record.players.find(p => p.clientId === clientId)?.name ?? "";
  return {
    gameId: record.gameId, accuracy: accuracy(pushes, waves, opening), counts, pushes,
    waves: waves.map(w => ({ ...w, attackers: w.attackers.map(id => ({ name: name(id) })) })),
    allies: allies.map(({ other: { clientId: _, ...other }, ...a }) => ({ ...a, other })),
    opening, keyMoments: moments.slice(0, 5), mistakes: mistakeCosts(moments),
    coverage: { ratedPushes: pushes.filter(p => p.label).length, totalPushes: pushes.length, idsVerified: record.idsVerified },
  };
}
