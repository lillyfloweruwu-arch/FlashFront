import { useRef } from "react";
import { formatDuration, type GameSnapshot } from "@flashfront/core";

export function AlliancePanel({ snapshot }: { snapshot: GameSnapshot }) {
  const game = useRef(snapshot.gameId);
  const formed = useRef(new Map<string, number>());
  const lastTick = useRef(snapshot.tick);
  if (game.current !== snapshot.gameId || snapshot.tick < lastTick.current) {
    formed.current.clear();
    game.current = snapshot.gameId;
  }
  lastTick.current = snapshot.tick;
  for (const key of formed.current.keys()) {
    if (!snapshot.self?.alliances.some(a => a.with === key)) {
      formed.current.delete(key);
    }
  }
  if (!snapshot.self?.alliances.length) {
    return <p className="muted empty-note">{snapshot.elapsedSec >= 120 ? "No active alliance." : "Your next pact will appear here."}</p>;
  }
  return <div className="stack">{[...snapshot.self.alliances].sort((a, b) => (a.expiresAtTick ?? Infinity) - (b.expiresAtTick ?? Infinity)).map(a => {
    const player = snapshot.players.find(p => p.name === a.name);
    if (!formed.current.has(a.with)) formed.current.set(a.with, a.formedAtTick ?? snapshot.tick);
    const age = snapshot.ticksPerSecond <= 0 ? 0 : Math.max(0, (snapshot.tick - (a.formedAtTick ?? formed.current.get(a.with)!)) / snapshot.ticksPerSecond);
    const key = `${snapshot.gameId}-${a.with}`;
    return <div key={key}><div className="spread"><span><i className="swatch" style={{ background: player?.color }} />{a.name ?? "Ally"}</span><span className={a.renewRequested ? "warning" : "muted"}>{a.renewRequested ? "renewal asked" : `formed ${formatDuration(age)} ago`}</span></div></div>;
  })}</div>;
}
