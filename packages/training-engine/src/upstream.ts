// The only module that touches the vendored OpenFront engine. Everything else sees FlashFront types.
import { createGameRunner, createGameRunnerFromSnapshot, GameRunner } from "@openfront/engine/GameRunner";
import { GameStartInfoSchema, TurnSchema } from "@openfront/engine-api/Schemas";
import type { GameStartInfo, StampedIntent, Turn } from "@openfront/engine-api/Schemas";
import { GameMapSize, GameMapType, GameType, PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import type { MapFiles } from "@openfront/engine-api/game/MapFiles";
import type { BoardFrame, TrainingAction } from "./contracts";
import type { MapBytes } from "./protocol";

export type { GameStartInfo, StampedIntent, Turn };
export type Runner = GameRunner;
export const parseTurn = (turn: unknown): Turn | null => { const r = TurnSchema.safeParse(turn); return r.success ? r.data : null; };

/** Upstream's wireGameStartInfo: non-singleplayer games blank clan tags (and friends when anonymized). */
export function parseStart(info: unknown): GameStartInfo | null {
  const parsed = GameStartInfoSchema.safeParse(info);
  if (!parsed.success) return null;
  const start = parsed.data;
  const c = start.config;
  if (c.gameType === GameType.Singleplayer) return start;
  const blankTags = (c.disableClanTags ?? false) || (c.anonymizeNames ?? false);
  const blankFriends = c.anonymizeNames ?? false;
  return { ...start, players: start.players.map((p) => ({ ...p, clanTag: blankTags ? null : p.clanTag, friends: blankFriends ? undefined : p.friends })) };
}

/** Archived records omit empty turns; the engine needs one turn per tick up to `numTurns`. */
export function expandTurns(turns: readonly Turn[], numTurns: number): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    if (!Number.isInteger(t.turnNumber) || t.turnNumber < out.length) throw new Error("turns out of order");
    while (out.length < t.turnNumber) out.push({ turnNumber: out.length, intents: [] });
    out.push(t);
  }
  while (out.length < numTurns) out.push({ turnNumber: out.length, intents: [] });
  return out;
}

export function isKnownMap(mapId: string, mapSize: string): boolean {
  return (Object.values(GameMapType) as string[]).includes(mapId) && (Object.values(GameMapSize) as string[]).includes(mapSize);
}

function mapFiles(map: MapBytes): MapFiles {
  const files = { map: map.mapId, mapSize: map.mapSize, manifest: map.manifest, mapBin: map.mapBin, map4xBin: map.map4xBin, map16xBin: map.map16xBin };
  return structuredClone(files) as unknown as MapFiles; // the engine takes the buffers over
}

type HashSink = (tick: number, hash: number) => void;
function callback(onHash: HashSink, onError: (message: string) => void) {
  return (gu: { errMsg?: string; updates?: Record<number, unknown[]> }) => {
    if (gu.errMsg !== undefined) { onError(gu.errMsg); return; }
    for (const h of (gu.updates?.[GameUpdateType.Hash] ?? []) as { tick: number; hash: number }[]) onHash(h.tick, h.hash);
  };
}

export function newRunner(start: GameStartInfo, map: MapBytes, onHash: HashSink, onError: (m: string) => void): Promise<Runner> {
  return createGameRunner(start, undefined, mapFiles(map), callback(onHash, onError) as never);
}
export function restoreRunner(start: GameStartInfo, snapshot: Uint8Array, map: MapBytes, onHash: HashSink, onError: (m: string) => void): Promise<Runner> {
  return createGameRunnerFromSnapshot(start, snapshot, undefined, mapFiles(map), callback(onHash, onError) as never);
}

export const playerKey = (smallId: number) => `p${smallId}`;
const smallIdOf = (key: string) => Number(key.slice(1));

/** Session-local id of the player a client controls, or null. */
export function playerOfClient(runner: Runner, clientId: string): string | null {
  const p = runner.game.playerByClientID(clientId);
  return p ? playerKey(p.smallID()) : null;
}
/** Client id behind a session-local player id; null for nations, bots and unknown ids. */
export function clientOfPlayer(runner: Runner, key: string): string | null {
  const p = runner.game.playerBySmallID(smallIdOf(key));
  return p.isPlayer() && p.type() === PlayerType.Human ? p.clientID() : null;
}

/** The upstream intent for an action, or null when the target does not exist on this board. */
export function intentFor(runner: Runner, action: TrainingAction): Omit<StampedIntent, "clientID"> | null {
  const target = (key: string) => {
    const p = runner.game.playerBySmallID(smallIdOf(key));
    return p.isPlayer() ? p.id() : null;
  };
  switch (action.kind) {
    case "wait": return null;
    case "attack": {
      const id = action.target === null ? null : target(action.target);
      if (action.target !== null && id === null) return null;
      return { type: "attack", targetID: id, troops: action.troops } as never;
    }
    case "allianceRequest": case "allianceAccept": {
      const id = target(action.target);
      return id === null ? null : ({ type: "allianceRequest", recipient: id } as never);
    }
    case "allianceDecline": {
      const id = target(action.target);
      return id === null ? null : ({ type: "allianceReject", requestor: id } as never);
    }
    case "buildPost":
      return action.tile < runner.game.width() * runner.game.height() ? ({ type: "build_unit", unit: UnitType.DefensePost, tile: action.tile } as never) : null;
  }
}

export interface OwnStats { troops: number; maxTroops: number; gold: number; tiles: number; alive: boolean; alliances: number; landTiles: number; incoming: number; outgoing: number }
export function ownStats(runner: Runner, key: string): OwnStats {
  const p = runner.game.playerBySmallID(smallIdOf(key));
  if (!p.isPlayer()) return { troops: 0, maxTroops: 0, gold: 0, tiles: 0, alive: false, alliances: 0, landTiles: runner.game.map().numLandTiles(), incoming: 0, outgoing: 0 };
  return { troops: p.troops(), maxTroops: runner.game.config().maxTroops(p), gold: Number(p.gold()), tiles: p.numTilesOwned(), alive: p.isAlive(), alliances: p.alliances().length, landTiles: runner.game.map().numLandTiles(),
    incoming: p.incomingAttacks().reduce((sum, a) => sum + a.troops(), 0), outgoing: p.outgoingAttacks().length };
}

/** A full render frame. Terrain is cached by the map's water version. */
export function frameOf(runner: Runner, cache: { version: number; terrain: Uint8Array | null }): BoardFrame {
  const game = runner.game, map = game.map();
  const width = game.width(), height = game.height(), n = width * height;
  if (!cache.terrain || cache.version !== map.waterVersion()) {
    const terrain = new Uint8Array(n);
    for (let t = 0; t < n; t++) terrain[t] = map.terrainByte(t);
    cache.terrain = terrain;
    cache.version = map.waterVersion();
  }
  const state = map.tileStateBuffer(), owners = new Uint16Array(n);
  for (let t = 0; t < n; t++) owners[t] = state[t]! & 0xfff;
  const requests: { from: string; to: string }[] = [], alliances: { a: string; b: string; expiresTick: number }[] = [];
  const seen = new Set<string>();
  for (const p of game.players()) {
    for (const r of p.outgoingAllianceRequests()) requests.push({ from: playerKey(r.requestor().smallID()), to: playerKey(r.recipient().smallID()) });
    for (const a of p.alliances()) {
      const x = playerKey(a.requestor().smallID()), y = playerKey(a.recipient().smallID());
      if (seen.has(`${x}|${y}`)) continue;
      seen.add(`${x}|${y}`);
      alliances.push({ a: x, b: y, expiresTick: a.expiresAt() });
    }
  }
  return {
    tick: game.ticks(), width, height, terrain: cache.terrain, owners, requests, alliances,
    units: game.units().map((u) => ({ id: `u${u.id()}`, tile: u.tile(), owner: u.owner().smallID(), kind: String(u.type()), troops: u.troops() })),
    players: game.players().map((p) => ({ id: playerKey(p.smallID()), troops: p.troops(), gold: Number(p.gold()), tiles: p.numTilesOwned() })),
  };
}
