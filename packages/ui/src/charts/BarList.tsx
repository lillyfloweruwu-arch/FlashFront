import { useChartWidth } from "./useChartWidth";
export function BarList({ values, label }: { values: { label: string; value: number }[]; label: string }) {
  const { ref, width } = useChartWidth(); const max = Math.max(1, ...values.map(v => v.value));
  return <div className="chart" ref={ref}><svg width="100%" height={values.length * 40} viewBox={`0 0 ${width} ${values.length * 40}`} role="img" aria-label={label}><title>{label}</title>{values.map((v, i) => <g key={v.label}><text className="chart-label" x={0} y={i * 40 + 13}>{v.label}</text><rect className="bar-track" x={0} y={i * 40 + 22} width={width - 30} height={5} rx={2} /><rect className="bar-fill" x={0} y={i * 40 + 22} width={Math.max(0, v.value / max * (width - 30))} height={5} rx={2} /><text className="chart-value" textAnchor="end" x={width} y={i * 40 + 27}>{v.value}</text></g>)}</svg></div>;
}
