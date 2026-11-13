import { formatGold, type TradeStatus, type SelfState } from "@flashfront/core";

const NO_INCOME_DETAIL = "Ports send trade ships automatically; factories send trains.";
/** Income first ("1.22M · last 60s"); the ship/train breakdown only when asked for (Learning preset, edit mode). */
export function TradePanel({ status, breakdown = true, self }: { status: TradeStatus; breakdown?: boolean; self?: SelfState | null }) {
  const zero = status.noIncome || status.last60 === 0;
  const change = status.last60 === undefined || status.prev60 === undefined ? undefined : status.last60 - status.prev60;
  return <div className="stack trade-monitor">
    {status.last60 === undefined ? <p className="muted">Income counters unavailable.</p> : zero ? <p className="muted" title={NO_INCOME_DETAIL}>{status.noIncome ? "No trade income yet" : "No trade income in the last 60s"}<span className="sr-only">. {NO_INCOME_DETAIL}</span></p> : <>
      <p className="trade-headline"><strong>{formatGold(status.last60)}</strong><small>· last 60s</small></p>
      {status.share !== undefined && <p className="muted">{Math.floor(status.share * 100)}% of match gold</p>}
    </>}
    {self && <p className="muted">{self.buildings.find(b => b.type === "Port")?.count ?? "Unavailable"} ports · Active routes: Unavailable</p>}
    {breakdown && <div className="trade-breakdown">
      <div className="spread"><span>Trade ships</span><span>{status.ship60 === undefined ? "—" : formatGold(status.ship60)}</span></div>
      <div className="spread"><span>Trains</span><span>{status.train60 === undefined ? "—" : formatGold(status.train60)}</span></div>
      <div className="spread"><span>vs previous 60s</span><span>{change === undefined ? "—" : `${change > 0 ? "+" : change < 0 ? "-" : ""}${formatGold(Math.abs(change))}`}</span></div>
    </div>}
  </div>;
}
