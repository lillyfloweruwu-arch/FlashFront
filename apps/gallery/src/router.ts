export function parseRoute(hash: string): { path: string; search: string; matchId: string | null } {
  const [path = "/", search = ""] = hash.replace(/^#/, "").split("?");
  let matchId: string | null = null;
  if (path.startsWith("/stats/match/")) {
    try { matchId = decodeURIComponent(path.slice("/stats/match/".length)); } catch { matchId = ""; }
  }
  return { path: path || "/", search, matchId };
}
