import type { MatchListItem } from "./main/recorder";
import type { ProfileGame } from "./stats";
import type { ReviewResult } from "./shared";
export interface ArchiveRow {
  key: string; gameId?: string; recordings: MatchListItem[]; map: string; mode: string;
  startedAt?: string; durationSec?: number; rank?: number; outcome: "Win" | "Eliminated" | "Incomplete"; review?: ReviewResult;
}
const outcome = (value: unknown): ArchiveRow["outcome"] => value === "win" || value === "won" || value === "victory" ? "Win" : value === "loss" || value === "eliminated" || value === "defeat" ? "Eliminated" : "Incomplete";
const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export function joinArchive(games: readonly ProfileGame[], recordings: readonly MatchListItem[], reviews: ReadonlyMap<string, ReviewResult>): ArchiveRow[] {
  const groups = new Map<string, { games: ProfileGame[]; recordings: MatchListItem[]; gameId?: string }>();
  const group = (key: string, gameId?: string) => { let g = groups.get(key); if (!g) { g = { games: [], recordings: [], gameId }; groups.set(key, g); } return g; };
  games.forEach((g, i) => { const id = g.id?.trim(); group(id ? `game:${id}` : `public:${g.sourceKey ?? i}`, id || undefined).games.push(g); });
  recordings.forEach((r, i) => { const id = r.gameId?.trim(); group(id ? `game:${id}` : `local:${r.file || i}`, id || undefined).recordings.push(r); });
  return [...groups].map(([key, g]): ArchiveRow => {
    const locals = [...g.recordings].sort((a, b) => date(b.startedAt) - date(a.startedAt) || a.file.localeCompare(b.file));
    const firstPublic = <K extends keyof ProfileGame>(field: K) => g.games.find(p => p[field] !== undefined && p[field] !== "")?.[field];
    const publicOutcome = g.games.map(p => outcome(p.result)).find(o => o !== "Incomplete");
    const results = locals.flatMap(r => reviews.has(r.file) ? [reviews.get(r.file)!] : []);
    return { key, gameId: g.gameId, recordings: locals,
      map: firstPublic("map") || locals[0]?.map || "Unknown", mode: firstPublic("mode") || locals[0]?.mode || "Unknown",
      startedAt: firstPublic("start") || locals[0]?.startedAt, durationSec: firstPublic("duration") ?? locals[0]?.durationSec,
      rank: firstPublic("rank") ?? locals.find(r => r.finalRank !== undefined && r.finalRank > 0)?.finalRank,
      outcome: publicOutcome ?? locals.map(r => outcome(r.outcome)).find(o => o !== "Incomplete") ?? "Incomplete",
      review: results.find(r => r.status === "ready") ?? results[0],
    };
  }).sort((a, b) => date(b.startedAt) - date(a.startedAt) || a.key.localeCompare(b.key));
}
