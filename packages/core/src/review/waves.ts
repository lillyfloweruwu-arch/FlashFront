import { TICKS_PER_SECOND } from "../mechanics";
import type { RecordedMatch } from "../recorder";
import { measureWindow, toRecordingSec } from "./pushes";
import { ownPlayer, type ReviewRecord } from "./record";
import { REVIEW_THRESHOLDS as T } from "./thresholds";

export interface IncomingWave {
  startTick: number; t: number; attackers: string[]; source: "record" | "recording" | "both";
  post: "onTime" | "late" | "none"; rated: boolean; landLostPct?: number;
}

/** Inverse of toRecordingSec, for the recording's own second-stamped events. */
export function toRecordingTick(match: RecordedMatch, t: number): number {
  const first = match.samples[0];
  return first ? first.tick + Math.round((t - first.t) * TICKS_PER_SECOND) : Math.round(t * TICKS_PER_SECOND);
}

/** Human attacks are in the record; nation and bot attacks only show up as the recording's own incoming events. */
export function incomingWaves(record: ReviewRecord, match: RecordedMatch): IncomingWave[] {
  const own = ownPlayer(record, match.me.clientId ?? "");
  const hits: { tick: number; by?: string }[] = [];
  if (record.idsVerified && own?.playerId)
    for (const i of record.intents) if (i.kind === "attack" && i.target === own.playerId && i.by !== own.clientId) hits.push({ tick: i.tick, by: i.by });
  for (const e of match.events) if (e.kind === "incoming") hits.push({ tick: toRecordingTick(match, e.t) });
  hits.sort((a, b) => a.tick - b.tick);
  const groups: (typeof hits)[] = [];
  for (const hit of hits) {
    const group = groups.at(-1);
    if (!group || hit.tick - group.at(-1)!.tick > T.waveGroupGapSec * TICKS_PER_SECOND) groups.push([hit]);
    else group.push(hit);
  }
  const posts = [
    ...record.intents.filter(i => i.kind === "build" && i.by === own?.clientId && i.unit === "Defense Post").map(i => i.tick),
    ...match.events.filter(e => e.kind === "build" && e.unit === "defensePosts").map(e => toRecordingTick(match, e.t)),
  ];
  return groups.map(group => {
    const start = group[0]!.tick, fromRecord = group.some(h => h.by), fromRecording = group.some(h => !h.by);
    const post = posts.some(p => p >= start - T.postLeadSec * TICKS_PER_SECOND && p <= start) ? "onTime"
      : posts.some(p => p > start && p <= start + T.postLateSec * TICKS_PER_SECOND) ? "late" : "none";
    const land = measureWindow(match, start, start + T.landWindowSec * TICKS_PER_SECOND);
    const wave: IncomingWave = {
      startTick: start, t: toRecordingSec(match, start), attackers: [...new Set(group.flatMap(h => h.by ? [h.by] : []))],
      source: fromRecord && fromRecording ? "both" : fromRecord ? "record" : "recording", post, rated: land.rated,
    };
    if (land.rated) wave.landLostPct = land.landLostPct;
    return wave;
  });
}
