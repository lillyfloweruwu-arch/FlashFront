import type { RecordedMatch } from "./recorder";
import { formatTroops } from "./format";
import { TICKS_PER_SECOND } from "./mechanics";

/** What the last minute before an elimination looked like, from the player's own recorded numbers. */
export interface Debrief {
  windowSec: number;
  /** Fractions of max troops. */
  reserveBeforeLastPush?: number; reserveAfterLastPush?: number;
  peakIncoming: number;
  landLostPct: number;
  /** Observed sequence only; never inferred enemy actions or causes. */
  lines: string[];
}
/** Defined only for eliminated matches. The window ends at death, not later spectating. */
export function debrief(m: RecordedMatch): Debrief | undefined {
  if (m.outcome !== "eliminated") return;
  const first = m.samples[0];
  const offset = first ? first.tick / TICKS_PER_SECOND - first.t : 0;
  const end = m.endedAtSec === undefined ? m.samples.at(-1)?.t ?? m.durationSec : m.endedAtSec - offset;
  const samples = m.samples.filter(s => s.t >= end - 60 && s.t <= end);
  const push = m.events.filter(e => e.kind === "push" && e.t >= end - 60 && e.t <= end).at(-1);
  const before = samples[0]; const after = samples.at(-1);
  const peakIncoming = samples.reduce((peak, s) => Math.max(peak, s.incoming), 0);
  const landLostPct = before && after && before.tiles > 0 ? Math.max(0, (before.tiles - after.tiles) / before.tiles * 100) : 0;
  const lines: string[] = [];
  if (push?.kind === "push") lines.push(`Last push: reserves ${Math.floor(push.fractionBefore * 100)}% → ${Math.floor(push.fractionAfter * 100)}%.`);
  if (samples.length) lines.push(`Peak observed incoming: ${formatTroops(peakIncoming)}.`);
  if (before && after && before !== after && before.tiles > 0) lines.push(`Land fell ${Math.floor(landLostPct)}% across the observed window.`);
  if (!samples.length) lines.push("Final-minute observations unavailable.");
  else if (samples.length < 2 || before!.t > end - 55 || after!.t < end - 5
    || samples.some((s, i) => i > 0 && s.t - samples[i - 1]!.t > 10)) lines.push("Partial final-minute observations.");
  return { windowSec: 60, reserveBeforeLastPush: push?.kind === "push" ? push.fractionBefore : undefined,
    reserveAfterLastPush: push?.kind === "push" ? push.fractionAfter : undefined, peakIncoming, landLostPct, lines };
}
