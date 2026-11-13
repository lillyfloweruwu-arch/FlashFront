import { useRef } from "react";
import { attackPreview, attackSizes, percentOfMax, zoneLabel, formatDuration, formatTroops, maxSendPercent, renderNumber, DEFAULT_RESERVE_FLOOR, PushTracker, type GameSnapshot, type PushResult, type SelfState } from "@flashfront/core";

/** One rounding for every percentage in this module: truncate, like the game's own numbers. */
const pct = (fraction: number) => `${percentOfMax(fraction)}%`;
const selected = (a: number, b: number) => Math.abs(a - b) < 0.001;
/**
 * Leads with the selected send and keeps the remaining troops directly beneath it, then a compact
 * 20/30/50% table. Combat rules and push reasons live in match review
 * and Training, not over the map.
 */
export function AttackPreview({ self, phase, reserveFloor = DEFAULT_RESERVE_FLOOR, snapshot, lastPush, showLastPush = true }: { self: SelfState | null; phase?: GameSnapshot["phase"]; reserveFloor?: number; snapshot?: GameSnapshot; lastPush?: { result?: PushResult }; showLastPush?: boolean }) {
  const tracker = useRef<PushTracker>(null);
  tracker.current ??= new PushTracker();
  const last = lastPush ? lastPush.result : snapshot ? tracker.current.observe(snapshot) : undefined;
  if (!self) return <p className="muted">Attack preview unavailable while spectating.</p>;
  const preview = attackPreview(self.troops, self.maxTroops, self.attackRatio);
  const exposed = preview.zoneAfter === "exposed" && phase !== "spawn";
  const incoming = self.incomingAttacks.reduce((sum, attack) => sum + attack.troops, 0);
  const maxSend = maxSendPercent(self.troops, self.maxTroops, reserveFloor);
  const preserves = preview.remainingFraction * 100 >= reserveFloor;
  const backToSweet = Number.isFinite(preview.secondsBackToSweet) ? formatDuration(Math.ceil(preview.secondsBackToSweet)) : "—";
  return <div className={`attack-preview stack ${exposed ? "attack-exposed" : ""}`} data-zone={preview.zoneAfter}>
    <p className="attack-headline">Send {Math.round(self.attackRatio * 100)}% <small>{formatTroops(preview.sent)} troops</small></p>
    <p className="attack-send"><span className={`send-readout ${preserves ? "gain" : "warning"}`}>Leaves {formatTroops(preview.remaining)} ({pct(preview.remainingFraction)})</span> <span className={`zone-chip text-${preview.zoneAfter}`}>{zoneLabel(preview.zoneAfter)}</span></p>
    <table className="attack-sizes" aria-label="Attack-size comparison">
      <thead><tr><th scope="col">Send</th><th scope="col">Left</th><th scope="col">State</th></tr></thead>
      <tbody>{attackSizes(self.troops, self.maxTroops).map(size => {
        const current = selected(self.attackRatio, size.ratio);
        return <tr key={size.ratio} className={current ? "selected" : undefined} aria-current={current ? "true" : undefined}>
          <td><i className="selection-marker" aria-hidden="true" />{size.ratio * 100}%</td>
          <td>{formatTroops(size.remaining)} · {pct(size.remainingFraction)}</td>
          <td className={`text-${size.zoneAfter}`}>{zoneLabel(size.zoneAfter)}</td>
        </tr>;
      })}</tbody>
    </table>
    <p className="muted">Send up to {maxSend}% · keeps {reserveFloor}%{self.troops < self.maxTroops * reserveFloor / 100 ? " · already below reserve" : ""}</p>
    {exposed && <p className="danger">This push leaves you exposed. Back to sweet spot in {backToSweet}.</p>}
    {showLastPush && last && snapshot && <LastPush result={last} ago={(snapshot.tick - last.endedAtTick) / snapshot.ticksPerSecond} />}
    {self.incomingAttacks.length > 0 && <div className="incoming-list">
      {self.incomingAttacks.map((attack, i) => <p key={`${attack.from}-${i}`}>Incoming {formatTroops(attack.troops)}</p>)}
      <p className={incoming > preview.remaining ? "danger" : "muted"}>{incoming > preview.remaining ? `Incoming exceeds remaining by ${formatTroops(incoming - preview.remaining)}` : `${formatTroops(preview.remaining)} remaining vs ${formatTroops(incoming)} incoming`}</p>
    </div>}
  </div>;
}

const verdicts: Record<PushResult["verdict"], { word: string; tone: string }> = {
  good: { word: "good", tone: "gain" }, costly: { word: "costly", tone: "warning" }, failed: { word: "no land", tone: "danger" },
};
/** The player's last finished push in one line, from their own troops and land only. */
function LastPush({ result, ago }: { result: PushResult; ago: number }) {
  const verdict = verdicts[result.verdict];
  const gained = `${result.tilesGained > 0 ? "+" : result.tilesGained < 0 ? "-" : ""}${renderNumber(Math.abs(result.tilesGained))} tiles`;
  const uncertain = [result.overlapped && "overlapping attacks", result.gaps && "observation gaps"].filter(Boolean).join(", ");
  return <p className="last-push" title={uncertain ? `Estimate: ${uncertain}` : undefined}>
    <span className="label">Last push</span> <span className={verdict.tone}>{verdict.word}</span>
    <span className="muted"> · {gained} net · {formatDuration(Math.floor(ago))} ago{uncertain && " · estimate"}</span>
  </p>;
}
