import type { ArchiveRow } from "./match-archive";

export interface StatsOverview { wins: number; eliminated: number; incomplete: number; currentWinStreak: number; bestWinStreak: number; bestMap?: string; worstMap?: string }
/** Maps need this many finished (Win or Eliminated) games before they are ranked. */
export const MAP_MIN_FINISHED = 3;
const time = (row: ArchiveRow) => { const t = row.startedAt ? Date.parse(row.startedAt) : NaN; return Number.isFinite(t) ? t : -Infinity; };

/** Over joined, deduplicated rows. Incomplete games count in the record but break a streak and never rate a map. */
export function statsOverview(rows: readonly ArchiveRow[]): StatsOverview {
  const ordered = rows.map((row, i) => ({ row, i })).sort((a, b) => time(a.row) - time(b.row) || b.i - a.i).map(x => x.row);
  let wins = 0, eliminated = 0, incomplete = 0, streak = 0, bestWinStreak = 0;
  const maps = new Map<string, { wins: number; finished: number }>();
  for (const row of ordered) {
    if (row.outcome === "Win") { wins++; streak++; bestWinStreak = Math.max(bestWinStreak, streak); }
    else { streak = 0; if (row.outcome === "Eliminated") eliminated++; else incomplete++; }
    if (row.outcome === "Incomplete" || !row.map || row.map === "Unknown") continue;
    const m = maps.get(row.map) ?? { wins: 0, finished: 0 };
    m.finished++; if (row.outcome === "Win") m.wins++; maps.set(row.map, m);
  }
  const rated = [...maps].filter(([, m]) => m.finished >= MAP_MIN_FINISHED).map(([map, m]) => ({ map, rate: m.wins / m.finished, finished: m.finished }));
  const byCountThenName = (a: typeof rated[number], b: typeof rated[number]) => b.finished - a.finished || a.map.localeCompare(b.map);
  const best = [...rated].sort((a, b) => b.rate - a.rate || byCountThenName(a, b))[0];
  const worst = [...rated].sort((a, b) => a.rate - b.rate || byCountThenName(a, b))[0];
  return { wins, eliminated, incomplete, currentWinStreak: streak, bestWinStreak,
    ...(best ? { bestMap: best.map } : {}), ...(worst && worst.map !== best?.map ? { worstMap: worst.map } : {}) };
}
