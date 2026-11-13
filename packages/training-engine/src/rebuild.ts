// Exact board rebuild from a public record, and playable branches from it (sub-plan E Task 3).
import type { BoardFrame, BoardHandle, BoardSource, EngineResult, ScheduledAction, TrainingTrace } from "./contracts";
import { CAPTURE_EVERY_TICKS, SnapshotHistory } from "./history";
import { RECORD_COMMITS } from "./protocol";
import type { MapBytes, RunInput } from "./protocol";
import { buildTrace } from "./trace";
import type { Observation, RawRecord } from "./trace";
import { clientOfPlayer, expandTurns, frameOf, intentFor, isKnownMap, newRunner, ownStats, parseStart, parseTurn, playerOfClient, restoreRunner } from "./upstream";
import type { GameStartInfo, Runner, StampedIntent, Turn } from "./upstream";

export const TICKS_PER_SECOND = 10;
/** A training attempt never runs longer than this past its start. */
export const MAX_ATTEMPT_TICKS = 60 * TICKS_PER_SECOND;
/** Turns simulated between yields, so cancel and live-match checks get through. */
export const BATCH = 100;
const SAMPLE_EVERY = 10;
const SYSTEM_INTENTS = new Set(["mark_disconnected", "toggle_pause"]);

export interface Control { cancelled(): boolean; yieldNow(): Promise<void> }
type Fail = { status: "unavailable"; reason: "invalidRecord" | "unsupportedVersion" | "missingMap" | "desync" | "cancelled" | "historyLimit" };
const fail = (reason: Fail["reason"]): Fail => ({ status: "unavailable", reason });

export class BoardSession {
  private nextTurn: number;
  private executed: Turn[] = [];
  private observed: Observation[] = [];
  private engineError: string | null = null;
  readonly history = new SnapshotHistory();
  private terrainCache = { version: -1, terrain: null as Uint8Array | null };
  private constructor(
    readonly handle: BoardHandle,
    private runner: Runner,
    private readonly start: GameStartInfo,
    private readonly raw: RawRecord,
    private readonly turns: Turn[],
    private readonly map: MapBytes,
    private readonly ownClientId: string,
    private readonly baseline: Observation[],
  ) { this.nextTurn = handle.startTick; }

  private readonly onError = (m: string) => { this.engineError = m; };

  static async rebuild(sessionId: string, source: BoardSource, map: MapBytes, control: Control): Promise<EngineResult<BoardSession>> {
    const prepared = source.kind === "prepared" ? source.board : null;
    const raw = (prepared ? prepared.record : source.kind === "record" ? source.record : null) as Partial<RawRecord> | null;
    const ownClientId = prepared ? prepared.ownClientId : source.kind === "record" ? source.ownClientId : "";
    const startTick = prepared ? prepared.startTick : source.kind === "record" ? source.startTick : -1;
    if (!raw || typeof raw !== "object" || typeof raw.gitCommit !== "string" || !Array.isArray(raw.turns) || !raw.info) return fail("invalidRecord");
    if (!RECORD_COMMITS.includes(raw.gitCommit) || (prepared && prepared.engineCommit !== raw.gitCommit)) return fail("unsupportedVersion");
    const start = parseStart(raw.info);
    const numTurns = raw.info.num_turns;
    if (!start || !Number.isInteger(numTurns) || !Number.isInteger(startTick) || startTick < 0 || startTick > numTurns) return fail("invalidRecord");
    if (!start.players.some((p) => p.clientID === ownClientId)) return fail("invalidRecord");
    if (start.config.gameMap !== map.mapId || start.config.gameMapSize !== map.mapSize || !isKnownMap(map.mapId, map.mapSize)) return fail("missingMap");
    if (prepared && (prepared.mapId !== map.mapId || prepared.mapSize !== map.mapSize)) return fail("invalidRecord");
    const parsed: Turn[] = [];
    for (const t of raw.turns) {
      const turn = parseTurn(t);
      if (!turn) return fail("invalidRecord");
      parsed.push(turn);
    }
    let turns: Turn[];
    try { turns = expandTurns(parsed, numTurns); } catch { return fail("invalidRecord"); }
    const recorded = new Map(turns.filter((t) => t.hash != null).map((t) => [t.turnNumber, t.hash!]));

    const hashes = new Map<number, number>();
    let engineError: string | null = null;
    const onError = (m: string) => { engineError = m; };
    const runner = await newRunner(start, map, (tick, hash) => hashes.set(tick, hash), onError);
    const baseline: Observation[] = [];
    const ownKey = playerOfClient(runner, ownClientId);
    for (let i = 0; i < startTick; i++) {
      if (i % BATCH === 0) { await control.yieldNow(); if (control.cancelled()) return fail("cancelled"); }
      runner.addTurn(turns[i]!);
      if (!runner.executeNextTick() || engineError) return fail("desync");
      if (ownKey && i + 1 >= startTick - MAX_ATTEMPT_TICKS && (i + 1) % SAMPLE_EVERY === 0) baseline.push(observe(runner, ownKey, i + 1));
    }
    for (const [tick, hash] of recorded) if ((tick < startTick || hashes.has(tick)) && hashes.get(tick) !== hash) return fail("desync");

    // Check the board against the next archived hash on a throwaway branch, then restore the start.
    const snapshot = runner.snapshot(raw.gitCommit);
    const nextHash = [...recorded.keys()].filter((t) => !hashes.has(t)).sort((a, b) => a - b)[0];
    if (nextHash !== undefined) {
      for (let i = startTick; i < turns.length && !hashes.has(nextHash); i++) {
        if ((i - startTick) % BATCH === 0) { await control.yieldNow(); if (control.cancelled()) return fail("cancelled"); }
        runner.addTurn(turns[i]!);
        if (!runner.executeNextTick() || engineError) return fail("desync");
      }
      if (hashes.get(nextHash) !== recorded.get(nextHash)) return fail("desync");
    }
    const own = ownKey;
    if (!own) return fail("invalidRecord");
    const handle: BoardHandle = {
      sessionId, startTick, endTick: Math.min(numTurns, startTick + MAX_ATTEMPT_TICKS), ticksPerSecond: TICKS_PER_SECOND,
      ownPlayer: own, mapId: map.mapId, mapSize: map.mapSize,
    };
    const session = new BoardSession(handle, runner, start, raw as RawRecord, turns, map, ownClientId, baseline);
    session.runner = await restoreRunner(start, snapshot, map, () => {}, session.onError);
    session.observed = [observe(session.runner, own, startTick)];
    if (session.history.begin({ sessionId, tick: startTick, bytes: snapshot }, session.frame())) return fail("historyLimit");
    return { status: "ready", value: session };
  }

  /** Engine ticks run; the start board is `startTick`. */
  get tick(): number { return this.nextTurn; }

  frame(): BoardFrame {
    return { ...frameOf(this.runner, this.terrainCache), tick: this.nextTurn };
  }

  checkpoint(): Uint8Array {
    return this.runner.snapshot(this.raw.gitCommit);
  }

  async restore(tick: number, bytes: Uint8Array): Promise<void> {
    this.runner = await restoreRunner(this.start, bytes, this.map, () => {}, this.onError);
    this.engineError = null;
    this.nextTurn = tick;
    this.executed = this.executed.slice(0, Math.max(0, tick - this.handle.startTick));
    this.observed = this.observed.filter((o) => o.tick <= tick);
    this.history.truncate(tick);
  }

  /** Recorded intents for one turn of the branch, with own (and, for scripts, every player's) removed. */
  private recordedIntents(turn: number, opponents: RunInput["opponents"]): StampedIntent[] {
    const intents = this.turns[turn]?.intents ?? [];
    if (turn < this.handle.startTick) return [...intents];
    return intents.filter((i) => SYSTEM_INTENTS.has(i.type) || (opponents === "recorded" && i.clientID !== this.ownClientId));
  }

  private scheduled(actions: readonly ScheduledAction[], turn: number, own: boolean): StampedIntent[] {
    const out: StampedIntent[] = [];
    for (const s of actions) {
      if (s.tick !== turn || s.action.kind === "wait") continue;
      if (own !== (s.actor === this.handle.ownPlayer)) continue; // own list acts only for own player; scripts never for it
      const clientID = own ? this.ownClientId : clientOfPlayer(this.runner, s.actor);
      const intent = intentFor(this.runner, s.action);
      if (clientID && intent) out.push({ ...intent, clientID } as StampedIntent);
    }
    return out;
  }

  async run(input: RunInput, control: Control): Promise<EngineResult<TrainingTrace>> {
    const until = Math.min(input.untilTick, this.handle.endTick);
    if (until < this.nextTurn) return fail("invalidRecord");
    const scripts = input.opponents === "recorded" ? [] : input.opponents;
    for (let turn = this.nextTurn; turn < until; turn++) {
      if ((turn - this.handle.startTick) % BATCH === 0) { await control.yieldNow(); if (control.cancelled()) return fail("cancelled"); }
      const intents = [...this.recordedIntents(turn, input.opponents), ...this.scheduled(input.own, turn, true), ...this.scheduled(scripts, turn, false)];
      const t: Turn = { turnNumber: turn, intents };
      this.executed.push(t);
      this.runner.addTurn(t);
      if (!this.runner.executeNextTick() || this.engineError) return fail("desync");
      this.nextTurn = turn + 1;
      if (this.nextTurn % SAMPLE_EVERY === 0) this.observed.push(observe(this.runner, this.handle.ownPlayer, this.nextTurn));
      if ((this.nextTurn - this.handle.startTick) % CAPTURE_EVERY_TICKS === 0 && this.history.capture(this.frame())) return fail("historyLimit");
    }
    const branch = [...this.turns.slice(0, this.handle.startTick), ...this.executed];
    return { status: "ready", value: buildTrace(this.raw, this.ownClientId, branch, [...this.baseline, ...this.observed], this.handle.startTick, this.nextTurn) };
  }
}

function observe(runner: Runner, key: string, tick: number): Observation {
  const s = ownStats(runner, key);
  return { tick, troops: s.troops, maxTroops: s.maxTroops, gold: s.gold, tiles: s.tiles, landTiles: s.landTiles, alliances: s.alliances, incoming: s.incoming, outgoing: s.outgoing, alive: s.alive };
}
