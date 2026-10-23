import { LineChart } from "./LineChart";
export function Sparkline({ values, label }: { values: { t: number; value: number }[]; label: string }) {
  return <LineChart points={values.map(v => ({ x: v.t, y: v.value }))} label={label} compact height={36} />;
}
