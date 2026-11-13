// SPDX-License-Identifier: AGPL-3.0-only
// Copyright OpenFront and Contributors. FlashFront: offline drill clock, ported from the R2 LocalServer spike.
import type { StampedIntent, Turn } from "../../../../vendor/openfront/packages/engine-api/src/Schemas";
import type { ClientMessage, ServerMessage } from "../../../../vendor/openfront/client/packages/shared/src/WireSchemas";
import type { EventBus } from "../../../../vendor/openfront/client/packages/shared/src/EventBus";
import type { LobbyConfig } from "../../../../vendor/openfront/client/src/client/ClientGameRunner";
import type { TrainingSession } from "./session";
export type { StampedIntent };

export class TrainingServer {
  mode: "play" | "demo" | "replay";
  paused = false;
  onPlayerIntent?: (intent: StampedIntent, turn: number) => "forward" | "hold";
  private turns: Turn[] = [];
  private intents: StampedIntent[] = [];
  private held = new Set<StampedIntent>();
  private executed = 0;
  private lastTurnAt = -Infinity;
  private timer?: ReturnType<typeof setInterval>;
  private connect: () => void = () => {};
  private send: (message: ServerMessage) => void = () => {};
  private session: TrainingSession;
  private ended = false;

  constructor(private lobbyConfig: LobbyConfig & { training?: TrainingSession }, _isReplay: boolean, _eventBus: EventBus) {
    if (!lobbyConfig.training) throw new Error("Training session was not supplied by the bridge");
    this.session = lobbyConfig.training;
    this.mode = this.session.mode;
    this.session.server = this;
  }
  updateCallback(connect: () => void, message: (message: ServerMessage) => void): void { this.connect = connect; this.send = message; }
  start(): void {
    if (this.ended) return;
    this.connect();
    this.sendStart();
    this.timer ??= setInterval(() => {
      if (this.mode === "replay" || this.paused || this.turns.length > this.executed || Date.now() < this.lastTurnAt + 100) return;
      this.lastTurnAt = Date.now();
      const n = this.turns.length;
      // Task 2 serializes script turns relative to startTick.
      const scripts = this.mode === "demo" ? [...this.session.data.opponents, ...this.session.data.coach] : this.session.data.opponents;
      const scripted = scripts.filter(s => s.turn === n).map(s => ({ ...s.intent }) as StampedIntent);
      const turn: Turn = { turnNumber: n, intents: [...scripted, ...(this.mode === "play" ? this.intents : [])] };
      this.intents = [];
      this.turns.push(turn);
      this.send({ type: "turn", turn });
    }, 5);
  }
  private sendStart(): void {
    const info = this.lobbyConfig.gameStartInfo!;
    this.send({ type: "start", gameStartInfo: info, turns: [...this.turns], lobbyCreatedAt: info.lobbyCreatedAt, myClientID: this.session.data.ownClientId });
  }
  onMessage(message: ClientMessage): void {
    if (this.ended) return;
    if (message.type === "rejoin") { this.sendStart(); return; }
    if (message.type !== "intent" || this.mode !== "play") return;
    const intent = { ...message.intent, clientID: this.session.data.ownClientId } as StampedIntent;
    if (intent.type === "toggle_pause") { this.paused = intent.paused; return; }
    if (this.onPlayerIntent?.(intent, this.turn()) === "hold") this.held.add(intent);
    else this.intents.push(intent);
  }
  release(intent: StampedIntent): void {
    if (this.held.delete(intent) && !this.ended && this.mode === "play") this.intents.push(intent);
  }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  turn(): number { return this.turns.length; }
  turnComplete(): void { this.executed = Math.min(this.executed + 1, this.turns.length); }
  endGame(): void { this.ended = true; clearInterval(this.timer); this.timer = undefined; this.intents = []; this.held.clear(); }
}
export { TrainingServer as LocalServer };

