import { useRef } from "react";
import { attackPreview, formatTroopRate, percentOfMax, stableZone, zoneStatus, type GameSnapshot, type SelfState, type TroopZone } from "@flashfront/core";

/** Troop growth owns routine growth state (0.2.1): facts only, never commands, in the shared zone words. */
const percent = (fraction: number) => `${percentOfMax(fraction)}%`;
const clamp = (fraction: number) => Math.max(0, Math.min(1, fraction));
type Anchor = "start" | "end" | "center";
/**
 * "now" reads to the right of its marker and "after" (always at or below now) to the left, so the
 * two labels diverge; near the track ends they flip inward, and when they would still touch they
 * merge into one label at the shared spot.
 */
function markerLabels(now: number, after: number): { text: string; left: number; anchor: Anchor }[] {
  const nowAnchor: Anchor = now > 0.88 ? "end" : "start";
  const afterAnchor: Anchor = after < 0.12 ? "start" : "end";
  const nowSpan = nowAnchor === "start" ? [now, now + 0.1] : [now - 0.1, now];
  const afterSpan = afterAnchor === "end" ? [after - 0.14, after] : [after, after + 0.14];
  const touching = nowSpan[0]! < afterSpan[1]! + 0.02 && afterSpan[0]! < nowSpan[1]! + 0.02;
  if (touching) return [{ text: now - after < 0.005 ? "now" : "after · now", left: (now + after) / 2, anchor: "center" }];
  return [{ text: "after", left: after, anchor: afterAnchor }, { text: "now", left: now, anchor: nowAnchor }];
}
export function GrowthGauge({ self, phase }: { self: SelfState | null; phase?: GameSnapshot["phase"] }) {
  const lastZone = useRef<TroopZone | undefined>(undefined);
  if (!self) return <p className="muted">Growth unavailable while spectating.</p>;
  const preview = attackPreview(self.troops, self.maxTroops, self.attackRatio);
  const fraction = self.maxTroops > 0 ? self.troops / self.maxTroops : 0;
  const zone = stableZone(lastZone.current, fraction, preview.sweet);
  lastZone.current = zone;
  const spawning = phase === "spawn";
  const lowEnd = Math.max(0.25, preview.sweet - 0.08);
  const sweetEnd = Math.max(lowEnd, Math.min(0.7, preview.sweet + 0.08));
  const bands = [{ zone: "exposed", width: 0.25 }, { zone: "low", width: lowEnd - 0.25 }, { zone: "sweet", width: sweetEnd - lowEnd }, { zone: "high", width: 0.7 - sweetEnd }, { zone: "wasting", width: 0.3 }];
  const now = clamp(fraction), after = clamp(preview.remainingFraction);
  return <div className="growth-gauge stack" data-zone={spawning ? "spawn" : zone}>
    <p className="growth-headline"><strong>{percent(fraction)}</strong><small>of max · sweet spot {percent(preview.sweet)}</small></p>
    <div className="growth-meter">
      <div className="growth-track" role="meter" aria-label="Troops as percent of maximum" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentOfMax(now)}>
        {bands.map(b => <span key={b.zone} className={`growth-band zone-${b.zone}`} style={{ width: `${b.width * 100}%` }} />)}
        <span className="growth-marker ghost-marker" style={{ left: `${after * 100}%` }} />
        <span className="growth-marker current-marker" style={{ left: `${now * 100}%` }} />
      </div>
      <div className="gauge-marker-labels" aria-hidden="true">{markerLabels(now, after).map(label =>
        <span key={label.text} className={`gauge-marker-label anchor-${label.anchor}`} style={{ left: `${label.left * 100}%` }}>{label.text}</span>)}</div>
    </div>
    <p className="growth-rate">{formatTroopRate(preview.growthNowPerSec)} now · {formatTroopRate(preview.growthAtSweetPerSec)} at sweet spot</p>
    <p className={`zone-status zone-chip ${spawning ? "muted" : `text-${zone}`}`}>{spawning ? "Spawn phase: troops grow once you land." : zoneStatus(zone)}</p>
  </div>;
}
