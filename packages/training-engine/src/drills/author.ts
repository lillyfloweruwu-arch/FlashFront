// Authors the 21 prepared drill boards on the pinned engine (sub-plan F Task 2). Every board is a
// synthetic game: invented players ("You", "Neighbour A", ...), real Compact maps, deterministic turns.
// Nothing here is copied from a real player's game. Regenerate with:
//   pnpm --dir packages/training-engine exec vitest run --config vitest.generate.config.ts src/drills/author.gen.ts
import type { DrillCheck } from "@flashfront/core";
import type { BoardFrame, PreparedBoard, ScheduledAction, TrainingAction } from "../contracts";
import { ENGINE_COMMIT } from "../protocol";
import { compactMap } from "../fixtures/maps";
import { frameOf, newRunner, ownStats, parseStart } from "../upstream";
import type { Runner, StampedIntent, Turn } from "../upstream";
import type { DrillCast } from "../drill-evidence";

export type MapKey = "europe" | "world" | "blacksea";
const MAP_ID: Record<MapKey, string> = { europe: "Europe", world: "World", blacksea: "Black Sea" };
export const ATTEMPT_TICKS = 600;
export const LABELS = ["You", "Neighbour A", "Neighbour B", "Neighbour C"] as const;
type Label = (typeof LABELS)[number];

/** A pre-start move: absolute tick, who, and the upstream intent built from the live board. */
export interface PreMove { tick: number; by: Label; intent: (r: Runner, ids: Record<Label, string>) => object | null }
/** Post-start move as offset from the start; troops can be a fraction of the actor's troops then. */
type LabelledAction = { kind: "allianceRequest" | "allianceAccept" | "allianceDecline"; target: Label } | { kind: "wait" };
export interface Move { at: number; by: Label; action: LabelledAction | { kind: "attack"; target: Label | null; fraction: number } | { kind: "build"; unit: "City" | "Defense Post"; tile: TileChoice } }
export type TileChoice = "front" | "farFront" | "other" | "shore";
export interface DrillSpec {
  id: string; map: MapKey; players: number; spawns: [number, number][]; startTick: number;
  expandUntil?: number; pre?: PreMove[];
  opponents: Move[]; coach: Move[]; wrong: Move[];
  check: (ctx: AuthorContext) => DrillCheck;
}
export interface AuthorContext { start: number; ownTiles: number[]; front: number[]; farFront: number[]; other: number[]; shore: number[]; troops: number; maxTroops: number }

/** How far (in tiles, Chebyshev) from the threatened stretch a post still covers it in these drills. */
export const POST_REACH = 6;
const CLIENTS: Record<Label, string> = { You: "YouDrill", "Neighbour A": "NbrADril", "Neighbour B": "NbrBDril", "Neighbour C": "NbrCDril" };

function nearestLand(r: Runner, x: number, y: number): number {
  const g = r.game, w = g.width();
  for (let d = 0; d < 80; d++) for (let dx = -d; dx <= d; dx++) for (const dy of [-d, d]) {
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= w || ty >= g.height()) continue;
    const t = ty * w + tx;
    if (g.map().isLand(t) && !g.map().hasOwner(t)) return t;
  }
  throw new Error(`no land near ${x},${y}`);
}

/** Own tiles that touch `enemy` (the front), split by distance along it. */
function fronts(frame: BoardFrame, own: number, enemy: number, other: number): Omit<AuthorContext, "start" | "troops" | "maxTroops"> {
  const w = frame.width, h = frame.height, o = frame.owners;
  const touches = (t: number, who: number) => [t - 1, t + 1, t - w, t + w].some((n) => n >= 0 && n < w * h && o[n] === who);
  const ownTiles: number[] = [], front: number[] = [], otherFront: number[] = [], shore: number[] = [];
  for (let t = 0; t < o.length; t++) {
    if (o[t] !== own) continue;
    ownTiles.push(t);
    if (touches(t, enemy)) front.push(t);
    else if (other && touches(t, other)) otherFront.push(t);
    if ((frame.terrain[t]! & 0x40) !== 0) shore.push(t);
  }
  const cx = front.reduce((s, t) => s + (t % w), 0) / Math.max(1, front.length), cy = front.reduce((s, t) => s + Math.floor(t / w), 0) / Math.max(1, front.length);
  const dist = (t: number) => Math.hypot((t % w) - cx, Math.floor(t / w) - cy);
  const sorted = [...front].sort((a, b) => dist(a) - dist(b));
  const central = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3))).sort((a, b) => a - b);
  const far = sorted.slice(Math.ceil((sorted.length * 2) / 3));
  // The answer is an area, not one tile: any own tile within POST_REACH of the threatened stretch counts, so a
  // click near the front on a scaled-down board is judged on the decision rather than on pixel accuracy.
  const near = (pool: number[], targets: number[]) => pool.filter((t) => targets.some((c) => Math.max(Math.abs((t % w) - (c % w)), Math.abs(Math.floor(t / w) - Math.floor(c / w))) <= POST_REACH));
  const shoreFront = shore.filter((t) => touches(t, enemy));
  const wrongPool = new Set([...far, ...otherFront]);
  const area = near(ownTiles, central).filter((t) => !wrongPool.has(t) || central.includes(t));
  return { ownTiles, front: area, farFront: far.length ? far : sorted.slice(-1), other: otherFront, shore: near(ownTiles, shoreFront.length ? shoreFront : central) };
}

export interface AuthoredDrill { board: PreparedBoard; script: { drillId: string; cast: DrillCast; coach: ScheduledAction[]; wrong: ScheduledAction[]; opponents: ScheduledAction[] }; check: DrillCheck; startFrame: BoardFrame }

export async function authorDrill(spec: DrillSpec): Promise<AuthoredDrill> {
  const labels = LABELS.slice(0, spec.players) as Label[];
  const numTurns = spec.startTick + ATTEMPT_TICKS;
  const info = {
    // Upstream game ids are 8 characters: "drAlly01", "drPost01", "drSend01".
    gameID: `dr${spec.id[0]!.toUpperCase()}${spec.id.slice(1, 4)}${spec.id.slice(-2)}`, lobbyCreatedAt: 1_792_800_000_000,
    config: { gameMap: MAP_ID[spec.map], difficulty: "Medium", donateGold: false, donateTroops: false, gameType: "Public", gameMode: "Free For All",
      gameMapSize: "Compact", publicGameModifiers: {}, nations: "disabled", bots: 0, infiniteGold: false, infiniteTroops: false, instantBuild: false,
      randomSpawn: false, maxPlayers: spec.players, spawnImmunityDuration: 50, disabledUnits: [], trusted: true, overtime: { enabled: true }, disableClanTags: true },
    players: labels.map((l) => ({ clientID: CLIENTS[l], username: l, clanTag: null })), num_turns: numTurns,
  };
  const start = parseStart(info);
  if (!start) throw new Error(`${spec.id}: invalid start`);
  const hashes = new Map<number, number>();
  const runner = await newRunner(start, compactMap(spec.map), (t, h) => hashes.set(t, h), (m) => { throw new Error(`${spec.id}: ${m}`); });
  const spawnTiles = spec.spawns.map(([x, y]) => nearestLand(runner, x, y));
  const ids = {} as Record<Label, string>;
  const turns: Turn[] = [];
  const expandUntil = spec.expandUntil ?? spec.startTick - 60;
  for (let n = 0; n < spec.startTick; n++) {
    const intents: StampedIntent[] = [];
    const say = (by: Label, intent: object | null) => { if (intent) intents.push({ ...intent, clientID: CLIENTS[by] } as StampedIntent); };
    if (n === 2) labels.forEach((l, i) => say(l, { type: "spawn", tile: spawnTiles[i] }));
    if (n > 310 && n < expandUntil && n % 30 === 0) labels.forEach((l) => say(l, { type: "attack", targetID: null, troops: null }));
    for (const m of spec.pre ?? []) if (m.tick === n) say(m.by, m.intent(runner, ids));
    const turn: Turn = { turnNumber: n, intents };
    runner.addTurn(turn);
    if (!runner.executeNextTick()) throw new Error(`${spec.id}: tick ${n} failed`);
    if (n === 3) for (const l of labels) ids[l] = runner.game.playerByClientID(CLIENTS[l])!.id();
    turns.push(turn);
  }
  for (const t of turns) if (hashes.has(t.turnNumber)) t.hash = hashes.get(t.turnNumber)!;
  const record = { version: "v0.0.2", gitCommit: ENGINE_COMMIT, info, turns: turns.filter((t) => t.intents.length > 0 || t.hash != null) };
  const key = (l: Label) => `p${runner.game.playerByClientID(CLIENTS[l])!.smallID()}`;
  const cast: DrillCast = { labels: Object.fromEntries(labels.map((l) => [l, key(l)])), clients: Object.fromEntries(labels.map((l) => [l, CLIENTS[l]])) };
  const frame = frameOf(runner, { version: -1, terrain: null });
  const small = (l: Label) => Number(key(l).slice(1));
  const you = ownStats(runner, key("You"));
  const ctx: AuthorContext = { start: spec.startTick, troops: you.troops, maxTroops: you.maxTroops,
    ...fronts(frame, small("You"), small("Neighbour A"), labels.includes("Neighbour B") ? small("Neighbour B") : 0) };
  const actorTroops = (l: Label) => ownStats(runner, key(l)).troops;
  const toActions = (moves: Move[]): ScheduledAction[] => moves.map((m) => {
    const tick = spec.startTick + m.at, actor = key(m.by), a = m.action;
    if (a.kind === "attack" && "fraction" in a) return { tick, actor, action: { kind: "attack", target: a.target === null ? null : key(a.target), troops: Math.max(1, Math.floor(actorTroops(m.by) * a.fraction)) } };
    if (a.kind === "build") {
      const list = a.tile === "front" ? ctx.front : a.tile === "farFront" ? ctx.farFront : a.tile === "shore" ? ctx.shore : ctx.other;
      if (list.length === 0) throw new Error(`${spec.id}: no ${a.tile} tile`);
      if (a.unit === "Defense Post") return { tick, actor, action: { kind: "buildPost", tile: list[Math.floor(list.length / 2)]! } };
      throw new Error(`${spec.id}: only posts are TrainingActions; build cities in pre-start moves`);
    }
    if ("target" in a && typeof a.target === "string" && (labels as string[]).includes(a.target)) return { tick, actor, action: { ...a, target: key(a.target as Label) } as TrainingAction };
    return { tick, actor, action: a as TrainingAction };
  });
  const board: PreparedBoard = { id: spec.id, engineCommit: ENGINE_COMMIT, mapId: MAP_ID[spec.map], mapSize: "Compact", record, startTick: spec.startTick, ownClientId: CLIENTS.You };
  return { board, script: { drillId: spec.id, cast, coach: toActions(spec.coach), wrong: toActions(spec.wrong), opponents: toActions(spec.opponents) }, check: spec.check(ctx), startFrame: frame };
}

/** Pre-start: build a unit on one of the actor's tiles, touching `near` when given. */
export function preBuild(by: Label, unit: "City" | "Defense Post", near?: Label): PreMove["intent"] {
  return (r) => {
    const g = r.game, me = g.playerByClientID(CLIENTS[by]);
    if (!me) return null;
    const w = g.width(), enemy = near ? g.playerByClientID(CLIENTS[near]) : null;
    const tiles = [...me.tiles()].sort((a, b) => a - b);
    const touching = enemy ? tiles.filter((t) => [t - 1, t + 1, t - w, t + w].some((n) => g.map().ownerID(n) === enemy.smallID())) : [];
    const pool = touching.length ? touching : tiles;
    return { type: "build_unit", unit, tile: pool[Math.floor(pool.length / 2)] };
  };
}

/** Pre-start: the actor attacks `target` (or wilderness) with a fraction of its troops. */
export function preAttack(by: Label, target: Label | null, fraction: number): PreMove["intent"] {
  return (r, ids) => {
    const me = r.game.playerByClientID(CLIENTS[by]);
    return me ? { type: "attack", targetID: target ? ids[target] : null, troops: Math.floor(me.troops() * fraction) } : null;
  };
}
