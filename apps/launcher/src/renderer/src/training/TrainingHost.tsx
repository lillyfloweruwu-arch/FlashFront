import { useCallback, useEffect, useRef, useState } from "react";
import type { EngineFailure } from "@flashfront/training-engine/contracts";
import type { LauncherApi, TrainingRequest } from "../../../shared";
import { TrainingHub } from "./TrainingHub";
import "../pages.css";

export const FAILURE_TEXT: Record<EngineFailure | "bootFailed", string> = {
  inMatch: "Training stops during a live match. Open Training again after the match.",
  missingRecord: "This game's public record isn't available yet. OpenFront publishes it a few minutes after the game ends.",
  unsupportedVersion: "This game was played on a newer OpenFront. Its board returns in the next FlashFront update.",
  missingMap: "This game's map isn't in this install.",
  invalidRecord: "This game's record can't be rebuilt.",
  desync: "The rebuilt board didn't match the recorded game, so it isn't shown.",
  cancelled: "Loading was cancelled.",
  historyLimit: "This attempt is too long to rewind. Restart from the beginning instead.",
  bootFailed: "Training couldn't start.",
};
type Api = Pick<LauncherApi, "startTraining" | "onTrainingEnded" | "getTodaysDrill" | "getDrillProgress" | "openTrainingLog">;
const same = (a: TrainingRequest, b: TrainingRequest) => JSON.stringify(a) === JSON.stringify(b);

/** The launcher owns only the hub; the engine belongs to the dedicated Training window. */
export default function TrainingHost({ request, api, inMatch }: { request?: TrainingRequest; api: Api; inMatch: boolean }) {
  const [opened, setOpened] = useState(false);
  const [failure, setFailure] = useState<EngineFailure | "bootFailed">();
  const [refresh, setRefresh] = useState(0);
  const active = useRef<TrainingRequest | undefined>(undefined);
  const consumed = useRef<TrainingRequest | undefined>(undefined);
  const mounted = useRef(true);
  const launchGeneration = useRef(0);
  const launch = useCallback(async (wanted: TrainingRequest) => {
    if (inMatch) { setFailure("inMatch"); return; }
    active.current = wanted;
    const generation = ++launchGeneration.current;
    setFailure(undefined);
    setOpened(true);
    try { await api.startTraining(wanted); }
    catch { if (mounted.current && launchGeneration.current === generation) { setOpened(false); setFailure("bootFailed"); } }
  }, [api, inMatch]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = api.onTrainingEnded((ended, outcome) => {
      if (!active.current || !same(active.current, ended)) return;
      ++launchGeneration.current;
      setOpened(false);
      setFailure(outcome.kind === "error" ? outcome.reason : undefined);
      if (ended.kind === "prepared") setRefresh(n => n + 1);
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, [api]);
  useEffect(() => {
    if (!request || consumed.current === request) return;
    consumed.current = request;
    void launch(request);
  }, [request, launch]);
  useEffect(() => { if (inMatch && opened) { ++launchGeneration.current; setOpened(false); setFailure("inMatch"); } }, [inMatch, opened]);
  return <TrainingHub api={{ ...api, startTraining: launch }} refresh={refresh} disabled={opened || inMatch}>
    {opened && <p role="status">Training is open in its own window.</p>}
    {failure && <p role="alert">{FAILURE_TEXT[failure]}{" "}
      {failure === "missingMap" ? <span>Reinstall maps.</span>
        : <button className="ff-btn-secondary" disabled={inMatch || !active.current} onClick={() => { if (active.current) void launch(active.current); }}>Try again</button>}{" "}
      <button className="ff-btn-secondary" onClick={() => { void api.openTrainingLog().catch(() => {}); }}>Open log</button>
    </p>}
    <p className="training-credit">Board engine © OpenFront and Contributors (AGPL-3.0). Maps © OpenFront, CC BY-SA 4.0. FlashFront is unofficial.</p>
  </TrainingHub>;
}

