import { formatDuration, formatPct, type GameSnapshot } from "@flashfront/core";
import { AnimatedNumber, Meter } from "../shared";
export function MatchClock({ snapshot }: { snapshot: GameSnapshot }) {
  const leader = [...snapshot.players].filter(p => p.isAlive).sort((a, b) => b.tilesOwnedPct - a.tilesOwnedPct)[0];
  return <div className="stack"><div className="spread"><div><strong>{snapshot.map}</strong><small className="muted">{snapshot.mode} · {snapshot.phase}</small></div><strong className="clock"><AnimatedNumber value={snapshot.elapsedSec} format={formatDuration} /></strong></div><div><div className="spread label"><span>{leader?.name ?? "No leader"}</span><span>{formatPct(leader?.tilesOwnedPct ?? 0)} / {formatPct(snapshot.winTargetPct)}</span></div><Meter value={leader?.tilesOwnedPct ?? 0} max={snapshot.winTargetPct} label="Leader progress toward win target" /></div></div>;
}
