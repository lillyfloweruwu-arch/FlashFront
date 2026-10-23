import { formatGold, formatPct, formatRate, formatTroopRate, type SelfState } from "@flashfront/core";
import { AnimatedNumber, Meter, integer } from "../shared";
export function SelfStatsBar({ self }: { self: SelfState | null }) {
  if (!self) return <p className="muted">Spectating · no self statistics</p>;
  return <div className="self-stats">
    <div className="troop-stat"><span className="label">Troops</span><div><strong><AnimatedNumber value={self.troops} /></strong><span className="muted"> / <AnimatedNumber value={self.maxTroops} /></span><small className="gain"><AnimatedNumber value={self.troopGrowthPerSec} format={formatTroopRate} /></small></div><Meter value={self.troops} max={self.maxTroops} label="Troop capacity" /></div>
    <div><span className="label">Gold</span><strong><AnimatedNumber value={self.gold} format={formatGold} /></strong><small className="gain"><AnimatedNumber value={self.goldPerSec} format={formatRate} /></small></div>
    <div><span className="label">Land</span><strong><AnimatedNumber value={self.tilesOwnedPct} format={formatPct} /></strong></div>
    <div><span className="label">Rank</span><strong>#<AnimatedNumber value={self.rank} format={integer} /></strong></div>
  </div>;
}
