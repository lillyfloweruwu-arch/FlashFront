import { formatGold, formatPct, formatRate, formatTroopRate, type SelfState, type GameSnapshot } from "@flashfront/core";
import { AnimatedNumber, Meter, integer } from "../shared";
export function SelfStatsBar({ self, snapshot }: { self: SelfState | null; snapshot?: GameSnapshot }) {
  if (!self) return <p className="muted">Spectating · no self statistics</p>;
  const ahead = snapshot?.players.filter(p => p.isAlive && p.id !== self.id && p.tilesOwnedPct > self.tilesOwnedPct).sort((a, b) => a.tilesOwnedPct - b.tilesOwnedPct);
  return <div className="stack">{snapshot && <><p className="position-headline"><strong>#{self.rank}</strong><span>of {snapshot.players.length} · {formatPct(self.tilesOwnedPct)} land</span></p><div className="position-gaps"><span>Next player: {ahead?.[0] ? `${formatPct(ahead[0].tilesOwnedPct - self.tilesOwnedPct)} land ahead` : self.rank === 1 ? "You lead" : "Unavailable"}</span><span>Leader: {ahead?.length ? `${formatPct(ahead[ahead.length - 1]!.tilesOwnedPct - self.tilesOwnedPct)} land ahead` : self.rank === 1 ? "You lead" : "Unavailable"}</span></div></>}<div className="self-stats">
    <div className="troop-stat"><span className="label">Troops</span><div><strong><AnimatedNumber value={self.troops} /></strong><span className="muted"> / <AnimatedNumber value={self.maxTroops} /></span><small className="gain"><AnimatedNumber value={self.troopGrowthPerSec} format={formatTroopRate} /></small></div><Meter value={self.troops} max={self.maxTroops} label="Troop capacity" /></div>
    <div><span className="label">Gold</span><strong><AnimatedNumber value={self.gold} format={formatGold} /></strong><small className="gain"><AnimatedNumber value={self.goldPerSec} format={formatRate} /></small></div>
    <div><span className="label">Land</span><strong><AnimatedNumber value={self.tilesOwnedPct} format={formatPct} /></strong></div>
    <div><span className="label">Rank</span><strong>#<AnimatedNumber value={self.rank} format={integer} /></strong></div>
  </div></div>;
}
