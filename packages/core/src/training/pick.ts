// Picks Today's drill from the land the player lost to each mistake type in their last ten reviewed
// games, never automatically repeating a drill within seven 24-hour periods.
import type { MistakeType } from "../review/moments";
import { MISTAKES, type PreparedDrill } from "./drills";

export interface ReviewForDrill { gameId: string; startedAt: string; mistakes: Record<MistakeType, number> }
/** `explicit`: opened by the player (a coach example), not an automatic pick; it still blocks repeats. */
export interface DrillVisit { drillId: string; selectedAtMs: number; localDay: string; completed: boolean; explicit?: boolean }

export const REVIEWS_USED = 10;
export const REPEAT_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The newest recording per game, newest first, at most ten. */
export function recentReviews(reviews: readonly ReviewForDrill[]): ReviewForDrill[] {
  const byGame = new Map<string, ReviewForDrill>();
  for (const r of reviews) {
    const prev = byGame.get(r.gameId);
    if (!prev || Date.parse(r.startedAt) > Date.parse(prev.startedAt)) byGame.set(r.gameId, r);
  }
  return [...byGame.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, REVIEWS_USED);
}

/** Land cost per mistake type over the last ten games, highest first; ties keep the fixed type order. */
export function rankMistakes(reviews: readonly ReviewForDrill[]): { mistake: MistakeType; cost: number }[] {
  const recent = recentReviews(reviews);
  const cost = (m: MistakeType) => recent.reduce((sum, r) => { const v = r.mistakes[m]; return sum + (Number.isFinite(v) && v > 0 ? v : 0); }, 0);
  return MISTAKES.map((mistake) => ({ mistake, cost: cost(mistake) })).sort((a, b) => b.cost - a.cost || MISTAKES.indexOf(a.mistake) - MISTAKES.indexOf(b.mistake));
}

export function pickNextDrill(reviews: readonly ReviewForDrill[], catalog: readonly PreparedDrill[], visits: readonly DrillVisit[], nowMs: number): PreparedDrill | undefined {
  const today = localDay(nowMs);
  const kept = [...visits].reverse().find((v) => !v.explicit && v.localDay === today && catalog.some((d) => d.id === v.drillId));
  if (kept) return catalog.find((d) => d.id === kept.drillId);
  // Recent picks, and any stamped in the future after a clock change, stay excluded.
  const excluded = new Set(visits.filter((v) => nowMs - v.selectedAtMs < REPEAT_GAP_MS).map((v) => v.drillId));
  const lastVisit = (id: string) => Math.max(-Infinity, ...visits.filter((v) => v.drillId === id).map((v) => v.selectedAtMs));
  for (const { mistake } of rankMistakes(reviews)) {
    const options = catalog.filter((d) => d.mistake === mistake && !excluded.has(d.id));
    if (options.length === 0) continue;
    return options.reduce((best, d) => (lastVisit(d.id) < lastVisit(best.id) ? d : best));
  }
  return undefined;
}
