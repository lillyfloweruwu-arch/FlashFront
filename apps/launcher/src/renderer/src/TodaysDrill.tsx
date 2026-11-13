import { useEffect, useState } from "react";
import { Button } from "@flashfront/ui";
import { DRILL_CATALOG, type MistakeType } from "@flashfront/core";
import type { LauncherApi, TodaysDrillInfo } from "../../shared";

const LABEL: Record<MistakeType, string> = { allyDecision: "ally decisions", postsBeforePush: "posts before a push", sendSize: "send size" };
const maps = import.meta.glob<string>("../../../resources/training/drills/boards/*.json", { import: "mapId" });

/** Reads the saved pick and lightweight catalogue, without loading the training engine. */
export function TodaysDrill({ api }: { api: Pick<LauncherApi, "getTodaysDrill" | "showTraining"> & Partial<Pick<LauncherApi, "onTrainingEnded">> }) {
  const [drill, setDrill] = useState<TodaysDrillInfo>();
  const [map, setMap] = useState<string>();
  useEffect(() => {
    let live = true;
    const refresh = () => { void Promise.resolve(api.getTodaysDrill?.()).then((d) => { if (live) setDrill(d); }).catch(() => {}); };
    refresh();
    const unsubscribe = api.onTrainingEnded?.((_request, outcome) => { if (outcome.kind === "passed") refresh(); });
    return () => { live = false; unsubscribe?.(); };
  }, [api]);
  const metadata = DRILL_CATALOG.find(d => d.id === drill?.drillId);
  useEffect(() => {
    let active = true;
    setMap(undefined);
    const load = metadata && maps[`../../../resources/training/drills/boards/${metadata.boardId}.json`];
    if (load) void load().then(value => { if (active) setMap(value); }).catch(() => {});
    return () => { active = false; };
  }, [metadata]);
  const check = metadata?.check;
  const setup = check?.kind === "post" ? "Place a defense post on the marked border before the push."
    : check?.kind === "send" ? `Send ${check.minSendPct}–${check.maxSendPct}% while keeping at least ${check.minReservePct}% in reserve.`
    : check?.kind === "ally" ? `${check.decision[0]!.toUpperCase()}${check.decision.slice(1)} the nearby alliance offer before time runs out.`
    : "Open the drill to practice your next decision.";
  return <section className="todays-drill play-card ff-glass" aria-label="Today's drill">
    <header className="play-card-heading"><h2>Today's drill</h2>{drill && <span className="drill-reason">{drill.reason ?? "Practice a decision"}</span>}</header>
    {drill ? <>
      <h3>{drill.title}</h3><p>{setup}</p>
      <p className="drill-meta">{metadata ? `${metadata.role} coach` : "Coach unavailable"} · {LABEL[drill.mistake]} · {drill.durationSec / 60} min · {map ?? "Map unavailable"}</p>
      <div className="play-card-actions"><Button className="ff-btn-secondary" onClick={() => void api.showTraining({ kind: "prepared", drillId: drill.drillId })}>Start drill</Button>
        {/* Completion dates are not exposed by the launcher API; empty dots mean unknown, not missed. */}
        <div className="drill-week" aria-label={drill.week ? `Drills completed on ${drill.week.filter(Boolean).length} of the last 7 days` : "Completion history unavailable"}><span className="muted">{drill.week ? "Last 7 days" : "Week unavailable"}</span><span className="drill-week-dots" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} className={drill.week?.[i] ? "is-complete" : undefined} />)}</span></div>
      </div>
    </> : <p>Visit Training to find your next drill.</p>}
  </section>;
}

