import { formatPct } from "@flashfront/core";
import type { StreamSnapshot } from "./StreamRoot";
import { AnimatedNumber } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function TopLeaderboard({ snapshot }: { snapshot: StreamSnapshot }) {
  const ranked = [...snapshot.players].filter(p => p.isAlive).sort((a, b) => b.tilesOwnedPct - a.tilesOwnedPct);
  const players = ranked.map((player, index) => ({ player, rank: index + 1 })).filter(({ player, rank }) => rank <= 3 || player.id === snapshot.self?.id);
  return <StreamWidget title="Territory leaders" icon="sort" value="Land"><ol className="leaderboard">{players.map(({ player: p, rank }) => <li key={p.id} value={rank} className={p.id === snapshot.self?.id ? "is-self" : ""}><span className="muted number">{rank}</span><i className="swatch" style={{ background: p.color }} /><span>{p.name}{p.id === snapshot.self?.id && <small className="muted">You</small>}</span><strong><AnimatedNumber value={p.tilesOwnedPct} format={formatPct} /></strong></li>)}</ol></StreamWidget>;
}
