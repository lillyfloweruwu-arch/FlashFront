import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { DRILL_CATALOG, type PreparedDrill } from "@flashfront/core";
import type { TrainingBridgeApi, TrainingLoad } from "../shared";
import type { ClientBridge } from "./bridge";
import { DrillReferee, type RefereeEvent } from "./DrillReferee";
import { DrillFlow, type FlowStep } from "./DrillFlow";
import { RewindBuffer } from "./RewindBuffer";
import { DrillOverlay, type DrillOverlayHandle } from "./ui/DrillOverlay";
import { ScrubBar, playRewind } from "./ui/ScrubBar";
import { CoachPlayingBar } from "./ui/CoachPlayingBar";

/** The only owner of drill timers, UI and restart orchestration. */
export function mountTraining(bridge: ClientBridge, load: Extract<TrainingLoad, { status: "ready" }>, api: TrainingBridgeApi): () => void {
  const { data } = load;
  const metadata = DRILL_CATALOG.find(d => d.id === data.drillId);
  const fallback = DRILL_CATALOG.find(d => d.check.kind === data.check.kind)!;
  const drill: PreparedDrill = metadata ?? { ...fallback, id: data.drillId, title: "Retry this moment", check: data.check };
  const host = document.createElement("div");
  host.id = "ff-overlay"; host.style.zIndex = "10000"; document.body.append(host);
  const root = createRoot(host);
  const overlay = createRef<DrillOverlayHandle>();
  const rewind = document.createElement("canvas");
  rewind.hidden = true; rewind.width = innerWidth; rewind.height = innerHeight;
  Object.assign(rewind.style, { position: "fixed", inset: "0", width: "100%", height: "100%", zIndex: "9998", pointerEvents: "none" });
  document.body.append(rewind);
  const buffer = load.lite || load.reducedMotion ? null : new RewindBuffer();
  let referee: DrillReferee;
  let disposed = false;
  let failed = false;
  let phase: FlowStep = "playing";
  let pendingCorrect: { event: RefereeEvent; tick: number } | undefined;
  const fail = (error: unknown) => { console.error("Training runtime failed", error); if (!disposed) api.report({ kind: "error", reason: "bootFailed" }); };
  const bindReferee = () => {
    referee = new DrillReferee(data, bridge.server(), () => {
      const game = bridge.game();
      return { tick: game?.ticks() ?? data.startTick, ownTroops: game?.myPlayer()?.troops() ?? 0,
        idOf: id => { const player = game?.players().find(p => p.clientID() === id || p.id() === id); return player ? `p${player.smallID()}` : id; } };
    }, event => {
      if (event.kind === "correct") {
        // Let the forwarded intent execute before freezing the successful board.
        pendingCorrect = { event, tick: bridge.game()?.ticks() ?? data.startTick };
        flow.result();
      } else overlay.current?.onRefereeEvent(event);
    });
  };
  const flow = new DrillFlow({ bridge, data, referee: () => referee, buffer,
    playRewind: (frames, ms, signal) => playRewind(rewind, frames, ms, signal),
    onRestart: () => { failed = false; pendingCorrect = undefined; bindReferee(); overlay.current?.reset(); render(); },
  });
  const tryAgain = () => { void flow.tryAgain().catch(fail); };
  const render = () => root.render(<>
    <DrillOverlay ref={overlay} bridge={bridge} referee={referee} api={api} drill={drill} data={data} lite={load.lite} reducedMotion={load.reducedMotion}
      onTryAgain={tryAgain} onRewind={() => { void flow.rewindAndDemo().catch(fail); }} onKeepPlaying={() => { failed = true; }} />
    {(phase === "rewinding" || phase === "demo") && <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", zIndex: 10001, pointerEvents: "none" }}>{phase === "rewinding" ? <ScrubBar /> : <CoachPlayingBar />}</div>}
  </>);
  bindReferee(); render();
  const unsubscribe = flow.subscribe(step => {
    phase = step;
    if (step === "retry") overlay.current?.reset();
    else if (step === "demo" || step === "rewinding") overlay.current?.setPhase(step);
    render();
  });
  const timer = setInterval(() => {
    if (disposed) return;
    const tick = bridge.game()?.ticks();
    if (tick === undefined) return;
    if (pendingCorrect && tick > pendingCorrect.tick) {
      overlay.current?.onRefereeEvent(pendingCorrect.event); pendingCorrect = undefined;
    }
    flow.onTurn(tick);
    if (phase === "playing" || phase === "retry") {
      referee.onTurn(tick);
      const canvas = bridge.canvas();
      if (canvas && !bridge.server().paused) buffer?.capture(tick, canvas);
      if (failed && tick > data.window.deadlineTick + 300) api.report({ kind: "failed" });
    }
  }, 50);
  const key = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "r" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    event.preventDefault(); event.stopImmediatePropagation(); tryAgain();
  };
  window.addEventListener("keydown", key, true);
  return () => { disposed = true; clearInterval(timer); window.removeEventListener("keydown", key, true); unsubscribe(); flow.dispose(); root.unmount(); host.remove(); rewind.remove(); bridge.stop(); };
}
