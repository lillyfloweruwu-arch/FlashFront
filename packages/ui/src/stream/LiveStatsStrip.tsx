import { formatGold, formatPct, formatTroops } from "@flashfront/core";
import type { StreamSnapshot } from "./StreamRoot";
import { AnimatedNumber, integer, Wordmark } from "../shared";
import { FlashFrontMark } from "../icons";
import { StreamWidget } from "./StreamWidget";
export function LiveStatsStrip({ snapshot }: { snapshot: StreamSnapshot }) {
  if (!snapshot.self) return <StreamWidget title="Live position" icon="growth" value="Spectating"><p className="muted">Own numbers are not shown while spectating.</p></StreamWidget>;
  const stats = [{ key: "land", label: "Land", value: snapshot.self.tilesOwnedPct, format: formatPct }, { key: "troops", label: "Troops", value: snapshot.self.troops, format: formatTroops }, { key: "gold", label: "Gold", value: snapshot.self.gold, format: formatGold }, { key: "rank", label: "Place", value: snapshot.self.rank, format: (n: number) => `#${integer(n)}` }] as const;
  return <section className="panel stream-widget live-stats" aria-label="Live position"><FlashFrontMark size={28} /><div className="stream-stat-grid">{stats.map(s => <div key={s.key}><span className="label">{s.label}</span>{s.value === null ? <span className="muted">Hidden</span> : <strong><AnimatedNumber value={s.value} format={s.format} /></strong>}</div>)}</div><Wordmark /></section>;
}
