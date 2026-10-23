import { useRef } from "react";
import { allianceTone, formatDuration, type GameSnapshot } from "@flashfront/core";
import { AnimatedNumber, Meter } from "../shared";
export function AlliancePanel({ snapshot }: { snapshot: GameSnapshot }) {
  const observed = useRef(new Map<string, number>());
  const game = useRef(snapshot.gameId);
  const formed = useRef(new Map<string, number>());
  const lastTick = useRef(snapshot.tick);
  if (game.current !== snapshot.gameId || snapshot.tick < lastTick.current) { observed.current.clear(); formed.current.clear(); game.current = snapshot.gameId; }
  lastTick.current = snapshot.tick;
  for (const key of formed.current.keys()) if (!snapshot.self?.alliances.some(a => a.with === key)) formed.current.delete(key);
  if (!snapshot.self?.alliances.length) return <p className="muted empty-note">{snapshot.elapsedSec >= 120 ? "No active alliance." : "Your next pact will appear here."} Requests appear here with their timer.</p>;
  return <div className="stack">{[...snapshot.self.alliances].sort((a, b) => (a.expiresAtTick ?? Infinity) - (b.expiresAtTick ?? Infinity)).map(a => {
    const player = snapshot.players.find(p => p.id === a.with);
    const seconds = a.expiresAtTick === undefined ? undefined : Math.max(0, (a.expiresAtTick - snapshot.tick) / snapshot.ticksPerSecond);
    const key = `${snapshot.gameId}-${a.with}-${a.expiresAtTick}`;
    if (seconds !== undefined && !observed.current.has(key)) observed.current.set(key, seconds);
    if (!formed.current.has(a.with)) formed.current.set(a.with, a.formedAtTick ?? snapshot.tick);
    const tone = seconds === undefined ? "muted" : seconds < 30 && allianceTone(seconds) !== "danger" ? "warning" : allianceTone(seconds);
    return <div key={key}><div className="spread"><span><i className="swatch" style={{ background: player?.color }} />{player?.name ?? a.with}</span><span className={tone}>{seconds === undefined ? "Expiry unknown" : <>{a.renewRequested ? "renew asked · " : seconds < 30 && "renew · "}<AnimatedNumber value={seconds} format={formatDuration} /></>}</span></div>{seconds === undefined ? <p className="muted">formed {formatDuration(Math.max(0, (snapshot.tick - (a.formedAtTick ?? formed.current.get(a.with)!)) / snapshot.ticksPerSecond))} ago · alliances last 5:00 by default</p> : <><Meter value={seconds} max={observed.current.get(key)} tone={tone} label={`${player?.name ?? a.with} alliance time remaining`} />{seconds < 30 && <p className="muted">Both sides must accept. Renewing resets to 5:00 from now.</p>}</>}</div>;
  })}</div>;
}
