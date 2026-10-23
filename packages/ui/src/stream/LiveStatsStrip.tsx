import { useEffect, useState } from "react";
import { formatGold, formatPct, formatTroops } from "@flashfront/core";
import type { StreamSnapshot } from "./StreamRoot";
import { Sparkline } from "../charts/Sparkline";
import { AnimatedNumber, integer } from "../shared";
import { StreamWidget } from "./StreamWidget";
interface Sample { t: number; troops: number | null; gold: number | null; land: number; rank: number; }
export function LiveStatsStrip({ snapshot }: { snapshot: StreamSnapshot }) {
  const [history, setHistory] = useState<Sample[]>([]);
  const hidden = snapshot.self?.troops === null || snapshot.self?.gold === null;
  useEffect(() => setHistory([]), [snapshot.gameId, hidden]);
  useEffect(() => {
    if (!snapshot.self) return;
    const { troops, gold, tilesOwnedPct: land, rank } = snapshot.self;
    setHistory(h => [...h.filter(p => p.t >= snapshot.elapsedSec - 120 && p.t < snapshot.elapsedSec), { t: snapshot.elapsedSec, troops, gold, land, rank }]);
  }, [snapshot]);
  if (!snapshot.self) return <StreamWidget title="Live position" icon="growth" value="Spectating"><p className="muted">Own numbers are not shown while spectating.</p></StreamWidget>;
  const stats = [{ key: "troops", label: "Troops", value: snapshot.self.troops, format: formatTroops }, { key: "gold", label: "Gold", value: snapshot.self.gold, format: formatGold }, { key: "land", label: "Land", value: snapshot.self.tilesOwnedPct, format: formatPct }, { key: "rank", label: "Rank", value: snapshot.self.rank, format: (n: number) => `#${integer(n)}` }] as const;
  return <StreamWidget className="live-stats" title="Live position" icon="growth" value="Last 2 min"><div className="stream-stat-grid">{stats.map(s => <div key={s.key}><span className="label">{s.label}</span>{s.value === null ? <span className="muted">Hidden</span> : <><strong><AnimatedNumber value={s.value} format={s.format} /></strong><Sparkline values={history.flatMap(p => { const value = p[s.key]; return value === null ? [] : [{ t: p.t, value }]; })} label={`${s.label} over the last 2 minutes`} /></>}</div>)}</div></StreamWidget>;
}
