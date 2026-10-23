import { formatDuration, formatPct, type MatchSummary, type RecordedResult } from "@flashfront/core";
import { AnimatedNumber, integer, signed } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function ResultCard({ match }: { match: MatchSummary | RecordedResult }) {
  const local = "recordedBy" in match;
  const won = local ? match.outcome === "won" || match.outcome === "win" : match.won;
  const rank = local ? match.summary.finalRank : match.placement;
  const elo = local ? undefined : match.eloDelta;
  return <StreamWidget className="result-card" title="Match result" icon="matches" value={local ? "Recording complete" : "Match complete"}>
    <div className="spread"><h2 className={won ? "gain" : ""}>{won ? "Victory" : "Battle concluded"}</h2><strong className="placement">{rank !== undefined ? <>#<AnimatedNumber value={rank} format={integer} /></> : "Rank unknown"}{!local && <small className="muted"> / {match.playerCount}</small>}</strong></div>
    <p className="muted">{match.map} · {match.mode}</p>
    <div className="result-grid"><div><span className="label">Duration</span><strong>{formatDuration(match.durationSec)}</strong></div><div><span className="label">Peak land</span><strong>{local ? `${integer(match.summary.peakTiles)} tiles` : formatPct(match.peakTilesPct)}</strong></div>{elo !== undefined && <div><span className="label">ELO</span><strong className={elo >= 0 ? "gain" : "danger"}>{signed(elo)}</strong></div>}</div>
  </StreamWidget>;
}
