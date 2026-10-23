import type { PracticeGoal } from "./habits";
import type { RecordedMatch } from "./recorder";
import { reviewMode } from "./bests";
export { personalBests, reviewMode, recordedLandPct, type ReviewMode, type ReviewMatch } from "./bests";

export type TrendMatch = Pick<RecordedMatch, "startedAt" | "type" | "durationSec" | "endedAtSec" | "practiceGoal"> & { coverage?: number } & Partial<Pick<RecordedMatch, "map" | "mode" | "rankedType" | "samples" | "summary">>;
export interface TrendFilter { mode?: string; map?: string }
/** Five-second samples (ten after an hour); longer gaps are unobserved, not interpolated. */
export function recordingCoverage(m: TrendMatch): number | undefined {
  if (m.coverage !== undefined) return m.coverage;
  if (!m.samples?.length) return undefined;
  const duration = m.endedAtSec ?? m.samples.at(-1)!.tick / 10;
  if (!(duration > 0)) return undefined;
  let seconds = 0;
  for (let i = 1; i < m.samples.length; i++) {
    const delta = m.samples[i]!.t - m.samples[i - 1]!.t;
    if (delta > 0 && delta <= 10) seconds += delta;
  }
  return Math.min(1, seconds / duration);
}
const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { value: sorted.length ? sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2 : undefined, count: sorted.length };
};
export function matchTrend(matches: TrendMatch[], goal?: PracticeGoal, filter: TrendFilter = {}) {
  const publicMatches = matches.filter(m => (m.type?.toLowerCase() === "public" || reviewMode(m) === "Ranked")
    && (!filter.mode || reviewMode(m) === filter.mode) && (!filter.map || m.map === filter.map))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const summarize = (group: TrendMatch[]) => {
    const goals = group.filter(m => goal && m.practiceGoal?.id === goal && ["hit", "miss"].includes(m.practiceGoal.status));
    return {
      count: group.length,
      survived: group.filter(m => (m.endedAtSec ?? m.durationSec) > 300).length,
      idleGold: median(group.flatMap(m => m.summary && m.durationSec > 0 ? [m.summary.idleGoldSeconds * 60 / m.durationSec] : [])),
      over70: median(group.flatMap(m => m.summary && m.durationSec > 0 ? [m.summary.timeInZone.wasting * 60 / m.durationSec] : [])),
      coverage: median(group.flatMap(m => { const value = recordingCoverage(m); return value === undefined ? [] : [value]; })),
      attackTempo: median(group.flatMap(m => m.summary?.attackTempo === undefined ? [] : [m.summary.attackTempo])),
      goal: { hits: goals.filter(m => m.practiceGoal?.status === "hit").length, count: goals.length },
    };
  };
  return { current: summarize(publicMatches.slice(0, 10)), previous: summarize(publicMatches.slice(10, 20)) };
}
