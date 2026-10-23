import { Icon } from "../icons";
import { useState } from "react";
import { useChartWidth } from "./useChartWidth";
export interface ChartPoint { x: number; y: number; label?: string; }
export interface LineChartProps { points: ChartPoint[]; label: string; formatY?: (value: number) => string; height?: number; area?: boolean; compact?: boolean; tone?: "primary" | "gain";
  yDomain?: [number, number]; bands?: { from: number; to: number; label: string; color: string }[];
  markers?: { x: number; label: string; color?: string }[];
}
export function LineChart({ points, label, formatY = n => Math.round(n).toString(), height = 220, area = false, compact = false, tone = "primary", yDomain, bands = [], markers = [] }: LineChartProps) {
  const { ref, width } = useChartWidth(); const [active, setActive] = useState<number | null>(null);
  const data = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const pad = compact ? 2 : 38; const usable = Math.max(1, width - pad * 2);
  const minX = Math.min(...data.map(p => p.x), 0); const maxX = Math.max(...data.map(p => p.x), 1);
  const minY = yDomain?.[0] ?? (area || compact ? 0 : Math.floor(Math.min(...data.map(p => p.y), 100000) / 100) * 100);
  const maxY = yDomain?.[1] ?? Math.max(minY + 1, ...data.map(p => p.y)) * 1.05;
  const y = (v: number) => height - pad - (v - minY) / (maxY - minY) * (height - pad * 2);
  const xy = data.map(p => ({ x: pad + (p.x - minX) / (maxX - minX) * usable, y: height - pad - (p.y - minY) / (maxY - minY) * (height - pad * 2) }));
  const path = xy.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const selected = active === null ? undefined : data[active]; const coordinate = active === null ? undefined : xy[active];
  const choose = (clientX: number, left: number) => {
    const x = clientX - left;
    let nearest = 0;
    xy.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(xy[nearest]!.x - x)) nearest = i; });
    setActive(nearest);
  };
  return <div ref={ref} className={`chart ${tone}`}>
    {data.length ? <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={compact ? undefined : 0} onPointerMove={e => choose(e.clientX, e.currentTarget.getBoundingClientRect().left)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(data.length - 1)} onBlur={() => setActive(null)} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setActive(i => Math.max(0, Math.min(data.length - 1, (i ?? 0) + (e.key === "ArrowLeft" ? -1 : 1)))); } }}>
      <title>{label}</title>
      {bands.map(b => <g key={b.label}><title>{b.label}</title><rect x={pad} y={y(b.to)} width={usable} height={y(b.from) - y(b.to)} fill={b.color} opacity={0.13} /></g>)}
      {!compact && [0, 0.5, 1].map(t => <g key={t}><line className="chart-grid" x1={pad} x2={width - pad} y1={height - pad - t * (height - pad * 2)} y2={height - pad - t * (height - pad * 2)} /><text className="chart-label" x={0} y={height - pad - t * (height - pad * 2) + 4}>{formatY(minY + (maxY - minY) * t)}</text></g>)}
      {area && xy.length > 0 && <path className="chart-area" d={`${path} L${xy.at(-1)!.x},${height - pad} L${xy[0]!.x},${height - pad} Z`} />}
      <path className="chart-line" d={path} />
      {markers.map((m, i) => <g key={i} tabIndex={0} role="img" aria-label={m.label}><title>{m.label}</title><line x1={pad + (m.x - minX) / (maxX - minX) * usable} x2={pad + (m.x - minX) / (maxX - minX) * usable} y1={pad} y2={height - pad} stroke={m.color ?? "var(--text)"} strokeDasharray="3 4" /><g transform={`translate(${pad + (m.x - minX) / (maxX - minX) * usable - 8},${pad - 22})`} style={{ color: m.color ?? "var(--text)" }}><Icon name={m.label.startsWith("Push") ? "attack" : "warning"} /></g></g>)}
      {!compact && <><text className="chart-label" x={pad} y={height - 6}>{data[0]?.label ?? data[0]?.x}</text><text className="chart-label" textAnchor="end" x={width - pad} y={height - 6}>{data.at(-1)?.label ?? data.at(-1)?.x}</text></>}
      {coordinate && <circle className="chart-dot" cx={coordinate.x} cy={coordinate.y} r={4} />}
    </svg> : <p className="muted">No chart data yet.</p>}
    {!compact && selected && coordinate && <div role="tooltip" className="chart-tooltip" style={{ left: Math.max(0, Math.min(width - 150, coordinate.x - 70)), top: 4 }}>{selected.label ?? selected.x}<strong>{formatY(selected.y)}</strong></div>}
  </div>;
}
