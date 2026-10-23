import { formatPct } from "@flashfront/core";
import type { StreamSnapshot } from "./StreamRoot";
import { AnimatedNumber } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function TopLeaderboard({ snapshot }: { snapshot: StreamSnapshot }) {
  const players = [...snapshot.players].filter(p => p.isAlive).sort((a, b) => b.tilesOwnedPct - a.tilesOwnedPct).slice(0, 5);
  return <StreamWidget title="Territory leaders" icon="sort" value="Land"><ol className="leaderboard">{players.map((p, i) => <li key={p.id} className={p.id === snapshot.self?.id ? "is-self" : ""}><span className="muted number">{i + 1}</span><i className="swatch" style={{ background: p.color }} /><span>{p.name}{p.id === snapshot.self?.id && <small className="muted">You</small>}</span><strong><AnimatedNumber value={p.tilesOwnedPct} format={formatPct} /></strong></li>)}</ol></StreamWidget>;
}
