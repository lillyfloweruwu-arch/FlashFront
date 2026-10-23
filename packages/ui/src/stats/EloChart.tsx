import type { PlayerProfile } from "@flashfront/core";
import { LineChart } from "../charts/LineChart";
import { Panel, formatMatchDate } from "../shared";
export function EloChart({ history }: { history: PlayerProfile["eloHistory"] }) {
  return <Panel title="Ranked progression"><LineChart points={history.map((p, i) => ({ x: i, y: p.elo, label: formatMatchDate(p.date) }))} label="ELO history; use arrow keys to inspect games" /></Panel>;
}
