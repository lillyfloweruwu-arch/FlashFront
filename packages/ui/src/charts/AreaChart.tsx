import { LineChart, type LineChartProps } from "./LineChart";
export function AreaChart(props: Omit<LineChartProps, "area">) { return <LineChart {...props} area />; }
