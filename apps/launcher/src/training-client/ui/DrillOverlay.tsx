import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { PreparedDrill } from "@flashfront/core";
import type { DrillClientData } from "../../../../../packages/training-engine/src/drill-client-data";
import type { ClientBridge } from "../bridge";
import type { DrillReferee, RefereeEvent } from "../DrillReferee";
import type { TrainingBridgeApi } from "../../shared";
import { CoachCard } from "./CoachCard";
import { DrillBar } from "./DrillBar";
import { YouMarker } from "./YouMarker";
import { DrillMenu } from "./DrillMenu";
import { ResultCard } from "./ResultCard";
import "@flashfront/ui/theme.css";
import "@flashfront/ui/fonts.css";
import "../../renderer/src/pages.css";
import "./overlay.css";

export type DrillPhase = "playing" | "coach" | "rewinding" | "demo" | "result" | "menu";
export interface DrillOverlayHandle { onRefereeEvent(event: RefereeEvent): void; reset(): void; setPhase(phase: DrillPhase): void }
export interface DrillOverlayProps {
  bridge: ClientBridge; referee: DrillReferee; api: TrainingBridgeApi; drill: PreparedDrill; data?: DrillClientData;
  lite?: boolean; reducedMotion?: boolean; ref?: Ref<DrillOverlayHandle>;
  onRewind?(): void; onTryAgain?(): void; onKeepPlaying?(): void; onNextDrill?(): void;
}
export function DrillOverlay({ bridge, referee, api, drill, data, lite, reducedMotion, ref, onRewind, onTryAgain, onKeepPlaying, onNextDrill }: DrillOverlayProps) {
  const [phase, setPhase] = useState<DrillPhase>("playing");
  const [event, setEvent] = useState<RefereeEvent>();
  const [tick, setTick] = useState<number>();
  const retried = useRef(false);
  const [verdict, setVerdict] = useState<"Great" | "Good">("Great");
  const reset = () => { retried.current = true; setEvent(undefined); setPhase("playing"); };
  useImperativeHandle(ref, () => ({
    onRefereeEvent(next) {
      setEvent(next);
      if (next.kind === "wrong") setPhase("coach");
      else { setVerdict(retried.current ? "Good" : "Great"); bridge.server().pause(); setPhase("result"); }
    }, reset, setPhase,
  }));
  useEffect(() => { const update = () => setTick(bridge.game()?.ticks()); update(); const timer = setInterval(update, 100); return () => clearInterval(timer); }, [bridge]);
  const resume = () => { bridge.server().resume(); setPhase("playing"); };
  const retry = () => { retried.current = true; reset(); onTryAgain?.(); };
  const rewind = () => { retried.current = true; setEvent(undefined); setPhase("rewinding"); onRewind?.(); };
  const keepPlaying = () => { retried.current = true; reset(); referee.keepPlaying(); onKeepPlaying?.(); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || phase === "coach" || phase === "result") return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (phase === "menu") resume();
      else if (phase === "playing") { bridge.server().pause(); setPhase("menu"); }
    };
    window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
  }, [phase, bridge]);
  const finish = () => { api.report({ kind: "passed", verdict }); };
  const coachIntent = data?.coach.find(step => step.intent.type === "attack")?.intent;
  const coachSendTroops = typeof coachIntent?.troops === "number" ? coachIntent.troops : undefined;
  return <div className="ff-drill-overlay" data-phase={phase} data-lite={lite || reducedMotion ? "" : undefined}>
    <DrillBar drill={drill} tick={tick} deadlineTick={data?.window.deadlineTick} /><YouMarker bridge={bridge} />
    {(phase === "coach" || phase === "menu" || phase === "result") && <div className="ff-training-scrim">
      {phase === "coach" && event?.kind === "wrong" && <CoachCard drill={drill} evidence={event.evidence} hasCoach={data ? data.coach.length > 0 : true} coachSendTroops={coachSendTroops} lite={lite} reducedMotion={reducedMotion} onRewind={rewind} onTryAgain={retry} onKeepPlaying={keepPlaying} />}
      {phase === "menu" && <DrillMenu onResume={resume} onRestart={retry} onLeave={() => api.report({ kind: "left" })} />}
      {phase === "result" && <ResultCard verdict={verdict} onNext={onNextDrill ? () => { api.report({ kind: "passed", verdict }); onNextDrill(); } : undefined} onBack={finish} />}
    </div>}
  </div>;
}
