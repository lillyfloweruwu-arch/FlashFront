import type { PlayerProfile } from "@flashfront/core";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const num = (v: unknown) => typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
const str = (v: unknown) => typeof v === "string" ? v : undefined;
export interface TypeStats { type: string; games: number; wins: number; }
export function profileStats(body: unknown): TypeStats[] {
  const rows: TypeStats[] = [];
  function visit(value: unknown, type: string) {
    const v = obj(value);
    if (Number.isFinite(num(v.total)) && Number.isFinite(num(v.wins))) rows.push({ type, games: num(v.total), wins: num(v.wins) });
    else for (const [key, child] of Object.entries(v)) if (key !== "stats") visit(child, `${type} · ${key}`);
  }
  for (const [type, value] of Object.entries(obj(obj(body).stats))) if (type !== "recent") visit(value, type);
  return rows;
}
export function profileFromApi(id: string, body: unknown, boards: unknown[] = []): PlayerProfile {
  const p = obj(body); const rows = profileStats(body);
  const clans = Array.isArray(p.clans) ? p.clans : [];
  let rankedElo: number | undefined; let rankedTier: string | undefined;
  for (const board of boards) for (const mode of ["1v1", "2v2", "ffa"]) {
    const entries = obj(board)[mode];
    if (!Array.isArray(entries)) continue;
    const own = entries.map(obj).find(e => e.public_id === id);
    if (own && rankedElo === undefined && Number.isFinite(num(own.elo))) {
      rankedElo = num(own.elo); rankedTier = str(own.tier) ?? `${mode} · #${own.rank}`;
    }
  }
  return { publicId: id, name: str(p.username) ?? "Unknown player", clanTag: str(obj(clans[0]).tag), rankedElo, rankedTier,
    gamesPlayed: rows.reduce((n, r) => n + r.games, 0), wins: rows.reduce((n, r) => n + r.wins, 0), eloHistory: [] };
}
export interface ProfileGame {
  id: string;
  map: string;
  mode: string;
  type: string;
  start: string;
  duration?: number;
  result: string;
  rank?: number;
  sourceKey?: string;
}
export function recentGames(body: unknown): { cursor?: string; games: ProfileGame[] } {
  const b = obj(body);
  return { cursor: str(b.nextCursor), games: (Array.isArray(b.results) ? b.results : []).map(obj).map(g => ({
    id: str(g.gameId) ?? "", map: str(g.map) ?? "", mode: str(g.mode) ?? "", type: str(g.type) ?? "",
    start: str(g.start) ?? "", duration: typeof g.durationSeconds === "number" && Number.isFinite(g.durationSeconds) && g.durationSeconds >= 0 ? g.durationSeconds : undefined, result: str(g.result) ?? "incomplete",
    rank: typeof g.rank === "number" && Number.isSafeInteger(g.rank) && g.rank > 0 ? g.rank : undefined,
  })) };
}
