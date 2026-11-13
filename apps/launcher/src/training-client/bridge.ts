import type { ClientSessionData, ReviewClientData } from "../review-types";
import { EventBus } from "../../../../vendor/openfront/client/packages/shared/src/EventBus";
import { toWireGameStartInfo } from "../../../../vendor/openfront/client/packages/shared/src/SharedUtil";
import { Cell, GameType } from "../../../../vendor/openfront/packages/engine-api/src/game/GameTypes";
import { joinLobby, type LobbyConfig, type JoinLobbyResult } from "../../../../vendor/openfront/client/src/client/ClientGameRunner";
import type { GameView } from "../../../../vendor/openfront/client/src/client/view";
import type { BuildMenu } from "../../../../vendor/openfront/client/src/client/hud/layers/BuildMenu";
import { validateDrillClient, type DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import type { TrainingServer } from "./TrainingServer";
import { registerSession, removeSession, type TrainingSession } from "./session";
import { disposeRendererListeners } from "./renderer-lifecycle";

export interface ClientBridge {
  start(data: DrillClientData, snapshot: Uint8Array, mode: "play" | "demo"): Promise<void>;
  startReplay(data: ReviewClientData, snapshot: Uint8Array): Promise<void>;
  restart(mode: "play" | "demo"): Promise<number>;
  stop(): void;
  server(): TrainingServer;
  game(): GameView | undefined;
  worldToScreen(x: number, y: number): { x: number; y: number } | undefined;
  canvas(): HTMLCanvasElement | undefined;
}

export function createClientBridge(): ClientBridge {
  let saved: { data: ClientSessionData; snapshot: Uint8Array } | undefined;
  let session: TrainingSession | undefined;
  let handle: JoinLobbyResult | undefined;
  let gameID: string | undefined;
  let generation = 0;
  let cancelWait: (() => void) | undefined;
  let live = false;
  const panelGame = () => (document.querySelector("control-panel") as (Element & { game?: GameView }) | null)?.game;
  const stop = () => {
    generation++;
    live = false;
    cancelWait?.();
    cancelWait = undefined;
    session?.server?.endGame();
    handle?.stop(true);
    disposeRendererListeners();
    handle = undefined;
    session = undefined;
    if (gameID) removeSession(gameID);
    gameID = undefined;
  };
  const launch = async (mode: "play" | "demo" | "replay") => {
    if (!saved) throw new Error("Load a drill before restarting");
    let old = panelGame();
    stop();
    const token = generation;
    const { data, snapshot } = saved;
    const original = data.gameStartInfo as NonNullable<LobbyConfig["gameStartInfo"]>;
    const info = { ...original, config: { ...original.config, gameType: GameType.Singleplayer } };
    session = { data, snapshot, mode };
    gameID = info.gameID;
    registerSession(gameID, session);
    // A fresh EventBus prevents listeners retained by an upstream runner from crossing restarts.
    const lobby = (): LobbyConfig & { training: TrainingSession } => ({
      gameID: info.gameID, cosmetics: {}, turnstileToken: null, playerName: "You",
      playerClanTag: null, playerRole: null, gameStartInfo: toWireGameStartInfo(info), training: session!,
    });
    try {
      const current = joinLobby(new EventBus(), lobby());
      handle = current;
      // Upstream join resolves before runner creation. WorkerClient.start is the actual runner
      // handoff; defer teardown until its synchronous start method has finished installing listeners.
      session.onRunnerStarted = () => { void Promise.resolve().then(() => { if (generation !== token) current.stop(true); }); };
      await new Promise<void>((resolve, reject) => {
        const started = performance.now();
        const finish = (error?: Error) => {
          clearInterval(timer);
          cancelWait = undefined;
          // The runner-start callback shares this closure. Do not retain the previous
          // GameView (and its full map buffers) through a chain of completed restarts.
          old = undefined;
          if (error) reject(error); else { live = true; resolve(); }
        };
        cancelWait = () => finish(new Error("Training start cancelled"));
        const timer = setInterval(() => {
          const game = panelGame();
          if (game && game !== old && game.ticks() >= data.startTick) finish();
          else if (performance.now() - started > 30_000) finish(new Error("Training client did not become live"));
        }, 5);
      });
    } catch (error) {
      if (generation === token) stop();
      throw error;
    }
  };
  return {
    async start(data, snapshot, mode) {
      const validated = validateDrillClient(data);
      if (!snapshot.byteLength) throw new Error("Training snapshot is empty");
      saved = { data: structuredClone(validated), snapshot: snapshot.slice() };
      await launch(mode);
    },
    async startReplay(data, snapshot) {
      if (!Number.isSafeInteger(data.startTick) || data.startTick < 0 || data.startTick > data.endTick || !snapshot.byteLength) throw new Error("Invalid review snapshot");
      saved = { data: structuredClone(data), snapshot: snapshot.slice() };
      await launch("replay");
    },
    async restart(mode) { const start = performance.now(); await launch(mode); return performance.now() - start; },
    stop,
    server() { if (!session?.server) throw new Error("Training server is not running"); return session.server; },
    game() { return live ? panelGame() : undefined; },
    worldToScreen(x, y) {
      if (!live) return undefined;
      const menu = document.querySelector<BuildMenu>("build-menu");
      return menu?.transformHandler?.worldToScreenCoordinates(new Cell(x, y));
    },
    canvas() { return live ? document.querySelector<HTMLCanvasElement>("#webgl-debug-canvas") ?? undefined : undefined; },
  };
}

