import { Fragment, useRef, useState } from "react";
import { buildPin, formatDuration, formatGold, nextBuild, secondsToAfford, type BuildingType, type GameSnapshot, type SelfState } from "@flashfront/core";
import { BuildIdleTracker } from "./build-idle";
import { AnimatedNumber, buildingLabel, integer } from "../shared";

const ECONOMY: readonly BuildingType[] = ["City", "Port", "Factory"];
const eta = (seconds: number) => seconds === 0 ? "affordable now" : Number.isFinite(seconds) ? `affordable in ${formatDuration(Math.ceil(seconds))}` : "no income";
/**
 * Leads with the suggested or pinned building. In the live HUD (`compact`) at most two economy
 * alternatives follow and the full, pinnable list appears only in edit mode; standalone previews
 * (launcher, Training) keep the disclosure.
 */
export function BuildPlanner({ self, elapsedSec, gameId, map = "Unknown", phase = "playing", editing = false, observedIdle, compact = false, alternatives = true }: { self: SelfState | null; elapsedSec: number; gameId: string; map?: string; phase?: GameSnapshot["phase"]; editing?: boolean; observedIdle?: number; compact?: boolean; alternatives?: boolean }) {
  const [, redraw] = useState(0);
  const pinned = buildPin.get(gameId, elapsedSec);
  const pin = (type: BuildingType) => {
    if (!editing) return;
    if (pinned === type) buildPin.clear(); else buildPin.set(gameId, elapsedSec, type);
    redraw(n => n + 1);
  };
  const tracker = useRef(new BuildIdleTracker());
  const idleSeconds = pinned ? 0 : observedIdle ?? tracker.current.observe(self, gameId, elapsedSec);
  if (!self) return <p className="muted">Buildings unavailable while spectating.</p>;
  const cheapest = self.buildings.filter(b => b.nextCost <= self.gold).sort((a, b) => a.nextCost - b.nextCost)[0]?.type;
  const next = nextBuild(self, map, pinned);
  const idle = idleSeconds >= 30;
  const idleNote = <small className="idle-gold-note warning"><span className="sr-only">Affordable for {formatDuration(idleSeconds)} · +25K max troops</span><span aria-hidden="true">City idle {formatDuration(idleSeconds)} · +25K max</span></small>;
  // Name in the 20px title face, the facts after it in body type: "City · affordable in 0:15 · +25K max".
  const [name, detail] = next
    ? pinned ? [`Saving for ${buildingLabel(next.type)}`, ` · ${Math.floor((next.progress ?? 0) * 100)}% · ${eta(next.seconds)}`] : [buildingLabel(next.type), ` · ${eta(next.seconds)}${next.reason ? ` · ${next.reason}` : ""}`]
    : pinned ? [`Saving for ${buildingLabel(pinned)}`, " · estimate paused"] : ["No affordable option", ""];
  const others = self.buildings.filter(b => ECONOMY.includes(b.type) && b.type !== next?.type)
    .map(b => ({ ...b, seconds: secondsToAfford(self.gold, self.goldPerSec, b.nextCost) }))
    .sort((a, b) => a.seconds - b.seconds || a.nextCost - b.nextCost).slice(0, 2);
  const showList = !compact || editing;
  return <div className="stack build-planner">
    <p className="next-build">{!pinned && <span className="sr-only">Next: </span>}<strong className="next-build-name">{name}</strong>{detail && <span className="next-build-detail"><span className="sr-only"> · </span>{detail.replace(/^ · /, "")}</span>}</p>
    {compact && !editing && alternatives && others.length > 0 && <div className="build-alts" aria-label="Alternatives">{others.map(b =>
      <div key={b.type} className={`build-row build-alt ${b.type === cheapest ? "affordable" : ""}`}>
        <span className="build-name">{buildingLabel(b.type)}</span>
        <strong className="build-cost">{formatGold(b.nextCost)}</strong>
        <small className={`build-eta ${b.seconds === 0 ? "gain" : "muted"}`}>{b.seconds === 0 ? "now" : Number.isFinite(b.seconds) ? `in ${formatDuration(Math.ceil(b.seconds))}` : "No income"}</small>
      </div>)}</div>}
    {compact && !editing && idle && idleNote}
    {showList && <details key={`${gameId}-${editing}-${phase === "playing" && elapsedSec < 180}`} open={editing || !(phase === "playing" && elapsedSec < 180)}><summary>All buildings</summary><div className="build-list">{self.buildings.map(b => {
      const seconds = secondsToAfford(self.gold, self.goldPerSec, b.nextCost);
      return <Fragment key={b.type}><div className={`build-row ${b.type === cheapest ? "affordable" : ""} ${b.type === "City" && idle ? "idle-gold" : ""}`}
        role={editing ? "button" : undefined} tabIndex={editing ? 0 : undefined} aria-pressed={editing ? pinned === b.type : undefined}
        aria-label={editing ? `${pinned === b.type ? "Unpin" : "Pin"} ${buildingLabel(b.type)}` : undefined}
        style={pinned === b.type ? { outline: "1px solid var(--ff-edge)", background: "var(--accent-soft)" } : undefined}
        onClick={() => pin(b.type)} onKeyDown={event => { if (editing && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); pin(b.type); } }}>
        <span className="build-name" title={buildingLabel(b.type)}>{buildingLabel(b.type)}</span>
        <small className="build-owned muted"><span className="sr-only">Owned </span><AnimatedNumber value={b.count} format={integer} /></small>
        <strong className="build-cost"><AnimatedNumber value={b.nextCost} format={formatGold} /></strong>
        <small className={`build-eta ${seconds === 0 ? "gain" : "muted"}`}>{seconds === 0 ? "now" : Number.isFinite(seconds) ? <>in <AnimatedNumber value={Math.ceil(seconds)} format={formatDuration} /></> : "No income"}</small>
      </div>{b.type === "City" && idle && idleNote}</Fragment>;
    })}</div><small className="muted">{editing ? "Select a row to pin or unpin. " : ""}Port and Factory share one price ladder.</small></details>}
  </div>;
}
