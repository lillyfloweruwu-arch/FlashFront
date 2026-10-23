import type { RecordedMatch } from "./recorder";

export type ReviewMode = "FFA" | "Teams" | "Ranked";
export interface PersonalBest { bestRank?: number; maxLandPct?: number; longestSec?: number; maxTradeGold?: number }
/** Optional recorded metadata. Older files have no land denominator or map size. */
export type ReviewMatch = Omit<RecordedMatch, "summary" | "samples"> & {
  mapSize?: "Normal" | "Compact";
  summary: RecordedMatch["summary"] & { peakLandPct?: number };
  samples: (RecordedMatch["samples"][number] & { tilesOwnedPct?: number })[];
};
const valid = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0;
export function reviewMode(m: { mode?: string; rankedType?: string }): ReviewMode | undefined {
  if (m.rankedType || m.mode?.toLowerCase() === "ranked") return "Ranked";
  if (/^teams?$/i.test(m.mode ?? "")) return "Teams";
  if (/^(ffa|free for all)$/i.test(m.mode ?? "")) return "FFA";
  return undefined;
}
export function recordedLandPct(m: ReviewMatch): number | undefined {
  const values = [m.summary.peakLandPct, ...m.samples.map(s => s.tilesOwnedPct)].filter(n => valid(n) && n <= 100);
  return values.length ? Math.max(...values as number[]) : undefined;
}
export function personalBests(matches: (Pick<RecordedMatch, "durationSec"> & Partial<Pick<RecordedMatch, "mode" | "rankedType" | "endedAtSec" | "summary" | "samples">> & { best?: PersonalBest })[]): Record<ReviewMode, PersonalBest> {
  const result: Record<ReviewMode, PersonalBest> = { FFA: {}, Teams: {}, Ranked: {} };
  for (const m of matches) {
    const mode = reviewMode(m); if (!mode) continue;
    const best = result[mode];
    if (m.best) {
      if (m.best.bestRank !== undefined) best.bestRank = Math.min(best.bestRank ?? Infinity, m.best.bestRank);
      for (const key of ["maxLandPct", "longestSec", "maxTradeGold"] as const) if (m.best[key] !== undefined) best[key] = Math.max(best[key] ?? 0, m.best[key]!);
      continue;
    }
    const rank = m.summary?.bestRank;
    if (valid(rank) && rank > 0) best.bestRank = Math.min(best.bestRank ?? Infinity, rank);
    const land = m.summary ? recordedLandPct({ summary: m.summary, samples: m.samples ?? [] } as ReviewMatch) : undefined;
    if (land !== undefined) best.maxLandPct = Math.max(best.maxLandPct ?? 0, land);
    const last = m.samples?.at(-1);
    const seconds = m.endedAtSec ?? (last ? last.tick / 10 : undefined);
    const survival = valid(seconds) ? seconds : m.durationSec;
    if (valid(survival) && survival > 0) best.longestSec = Math.max(best.longestSec ?? 0, survival);
    for (const sample of m.samples ?? []) if (valid(sample.tradeGoldTotal)) best.maxTradeGold = Math.max(best.maxTradeGold ?? 0, sample.tradeGoldTotal);
  }
  return result;
}
