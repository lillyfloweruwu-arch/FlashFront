import { useEffect, useState, type ReactNode } from "react";
import { DRILL_CATALOG, type PreparedDrill, type MistakeType } from "@flashfront/core";
import type { LauncherApi, TodaysDrillInfo } from "../../../shared";
import "./training-hub.css";

const TRACKS: Record<MistakeType, string> = { allyDecision: "Ally decisions", postsBeforePush: "Posts before a push", sendSize: "Send size" };
const maps = import.meta.glob<string>("../../../../resources/training/drills/boards/*.json", { import: "mapId" });
const art = import.meta.glob("../../../../resources/minimaps/*.png", { query: "?url", import: "default" });
export type DrillProgress = Readonly<Record<string, "passed" | "tryAgain">>;

export function TrainingHub({ api, onStart, drills = DRILL_CATALOG, progress, weakest, children, refresh = 0, disabled = false }: {
  api: Partial<Pick<LauncherApi, "getTodaysDrill" | "getDrillProgress" | "startTraining">>;
  onStart?: (id: string) => void; refresh?: number; disabled?: boolean;
  drills?: readonly PreparedDrill[];
  progress?: DrillProgress;
  weakest?: MistakeType;
  children?: ReactNode;
}) {
  const [savedProgress, setSavedProgress] = useState<DrillProgress>();
  const results = progress ?? savedProgress;
  const start = (id: string) => { if (onStart) onStart(id); else void api.startTraining?.({ kind: "prepared", drillId: id }); };
  const [today, setToday] = useState<TodaysDrillInfo>();
  const [boardMaps, setBoardMaps] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setToday(undefined);
    void Promise.resolve(api.getDrillProgress?.()).then(p => { if (active) setSavedProgress(p); }).catch(() => {});
    void Promise.resolve(api.getTodaysDrill?.()).then(d => { if (active) setToday(d); }).catch(() => {});
    return () => { active = false; };
  }, [api.getTodaysDrill, api.getDrillProgress, refresh]);
  useEffect(() => {
    let active = true;
    void Promise.all(drills.map(async d => {
      const load = maps[`../../../../resources/training/drills/boards/${d.boardId}.json`];
      return [d.id, await load?.().catch(() => undefined)] as const;
    })).then(entries => { if (active) setBoardMaps(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry[1]))); });
    return () => { active = false; };
  }, [drills]);
  return <section className="training-host training-hub" aria-label="Training">
    <header className="training-hub-header">
      <div><h1 className="ff-page-title">Training</h1><p className="muted">Short drills on the mistakes that cost you the most.</p></div>
      <button className="ff-btn-primary" disabled={!today || disabled} onClick={() => { if (today) start(today.drillId); }}>Start today's drill</button>
    </header>
    {!today && <p className="muted">Today's drill unavailable. Choose a drill below.</p>}
    <div className="training-tracks">
      {[...new Set(drills.map(d => d.mistake))].map(track => {
        const group = drills.filter(d => d.mistake === track);
        const passed = group.filter(d => results?.[d.id] === "passed").length;
        const map = boardMaps[group[0]!.id];
        const folder = map?.toLowerCase().replace(/[^a-z0-9]/g, "");
        const hasArt = folder && art[`../../../../resources/minimaps/${folder}.png`];
        return <article key={track} className="training-track" data-track={track} aria-label={TRACKS[track]}>
          {hasArt && <div className="training-track-art" style={{ backgroundImage: `url(minimaps/${folder}.png)` }} />}
          <div className="training-track-content">
            <div className="training-track-badges"><span className="training-badge training-coach">{group[0]!.role} coach</span>{(weakest ?? today?.weakest) === track && <span className="training-badge training-weakest">Costs you the most</span>}</div>
            <h2>{TRACKS[track]}</h2>
            <p className="muted">{results ? `${passed} of ${group.length} passed` : "Not started"}</p>
            <div className="training-pips" aria-hidden="true">{group.map(d => <i key={d.id} className={results?.[d.id] === "passed" ? "is-passed" : undefined} />)}</div>
          </div>
        </article>;
      })}
    </div>
    <div className="drill-list training-drill-list ff-glass" aria-label="Prepared drills">
      {drills.map(d => {
        const result = results?.[d.id];
        return <button key={d.id} className="training-drill-row" data-track={d.mistake} disabled={disabled} onClick={() => start(d.id)}>
          <span className="training-status-dot" aria-hidden="true" /><strong className="training-drill-title">{d.title}</strong>
          <span className="muted">{boardMaps[d.id] ?? "Map unavailable"}</span><span className="muted">{d.durationSec / 60} min</span>
          {results && <span className="training-badge" data-result={result}>{result === "passed" ? "Passed" : result === "tryAgain" ? "Try again" : "New"}</span>}
        </button>;
      })}
      {!drills.length && <p className="muted">No prepared drills available.</p>}
    </div>
    {children}
  </section>;
}



