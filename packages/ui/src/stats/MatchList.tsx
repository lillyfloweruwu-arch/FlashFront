import { Icon } from "../icons";
import { useState } from "react";
import { formatDuration, type MatchSummary } from "@flashfront/core";
import { signed, formatMatchDate } from "../shared";
export function sortMatches(matches: MatchSummary[], key: "date" | "placement", direction: "asc" | "desc") {
  return [...matches].sort((a, b) => (key === "date" ? Date.parse(a.startedAt) - Date.parse(b.startedAt) : a.placement - b.placement) * (direction === "asc" ? 1 : -1));
}
export function MatchList({ matches }: { matches: MatchSummary[] }) {
  const [sort, setSort] = useState<{ key: "date" | "placement"; direction: "asc" | "desc" }>({ key: "date", direction: "desc" });
  const changeSort = (key: "date" | "placement") => setSort(s => ({ key, direction: s.key === key ? s.direction === "asc" ? "desc" : "asc" : key === "date" ? "desc" : "asc" }));
  if (!matches.length) return <p className="muted">No matches yet.</p>;
  return <div className="table-scroll"><table className="match-table"><caption>Recent matches <span className="muted">{matches.length} recorded</span></caption><thead><tr><th>Result / map</th><th aria-sort={sort.key === "date" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button onClick={() => changeSort("date")}>Date <Icon name={sort.key === "date" ? sort.direction === "asc" ? "up" : "down" : "sort"} /></button></th><th>Mode</th><th aria-sort={sort.key === "placement" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button onClick={() => changeSort("placement")}>Placement <Icon name={sort.key === "placement" ? sort.direction === "asc" ? "up" : "down" : "sort"} /></button></th><th>Duration</th><th>ELO</th></tr></thead><tbody>{sortMatches(matches, sort.key, sort.direction).map(m => <tr key={m.gameId}><td><a href={`#/stats/match/${encodeURIComponent(m.gameId)}`}><span className={m.won ? "result-badge gain" : "result-badge muted"}>{m.won ? "Win" : "Loss"}</span>{m.map}</a></td><td className="muted">{formatMatchDate(m.startedAt)}</td><td>{m.mode}</td><td className="number">#{m.placement} <span className="muted">/ {m.playerCount}</span></td><td className="number">{formatDuration(m.durationSec)}</td><td className={`number ${(m.eloDelta ?? 0) >= 0 ? "gain" : "danger"}`}>{m.eloDelta === undefined ? "—" : signed(m.eloDelta)}</td></tr>)}</tbody></table></div>;
}
