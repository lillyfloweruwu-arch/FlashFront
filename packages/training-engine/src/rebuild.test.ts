import { expect, it } from "vitest";
import type { BoardFrame, BoardSource } from "./contracts";
import { onionMap } from "./fixtures/maps";
import { SYNTH } from "./fixtures/ids";
import synthetic from "./fixtures/synthetic-record.json";
import compact from "./fixtures/synthetic-record-compact.json";
import { BoardSession } from "./rebuild";
import { expandTurns, frameOf, newRunner, parseStart } from "./upstream";
import type { Turn } from "./upstream";

const control = { cancelled: () => false, yieldNow: async () => {} };
const source = (startTick: number, record: unknown = synthetic): BoardSource => ({ kind: "record", record, ownClientId: SYNTH.me, startTick });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
async function board(startTick: number, record: unknown = synthetic, map = onionMap()) {
  const r = await BoardSession.rebuild("s1", source(startTick, record), map, control);
  if (r.status !== "ready") throw new Error(`rebuild failed: ${r.reason}`);
  return r.value;
}
/** The board after `ticks` turns, straight through the engine with no FlashFront logic in between. */
async function reference(ticks: number, record = synthetic, map = onionMap()): Promise<BoardFrame> {
  const runner = await newRunner(parseStart(record.info)!, map, () => {}, (m) => { throw new Error(m); });
  const turns = expandTurns(record.turns as Turn[], record.info.num_turns);
  for (let i = 0; i < ticks; i++) { runner.addTurn(turns[i]!); runner.executeNextTick(); }
  return frameOf(runner, { version: -1, terrain: null });
}
const comparable = (f: BoardFrame) => ({ ...f, tick: undefined, owners: Array.from(f.owners), terrain: f.terrain.length });

it.each([0, 100, 300])("a board rebuilt at tick %i matches the engine's own run: owners, troops, units and alliances", async (tick) => {
  const session = await board(tick);
  expect(session.handle).toMatchObject({ startTick: tick, ticksPerSecond: 10, ownPlayer: expect.stringMatching(/^p\d+$/), mapId: "Onion", mapSize: "Normal" });
  const frame = session.frame();
  expect(frame.tick).toBe(tick);
  expect(comparable(frame)).toEqual(comparable(await reference(tick)));
  if (tick === 300) expect(frame.owners.some((o) => o !== 0)).toBe(true);
});

it("rebuilding twice gives the identical board", async () => {
  expect(comparable((await board(300)).frame())).toEqual(comparable((await board(300)).frame()));
});

it("Normal and Compact games read their own map files", async () => {
  const normal = (await board(100)).frame(), small = (await board(100, compact, onionMap("Compact"))).frame();
  expect(small.width * small.height).toBeLessThan(normal.width * normal.height);
  expect(await BoardSession.rebuild("s", source(100, compact), onionMap("Normal"), control)).toEqual({ status: "unavailable", reason: "missingMap" });
});

it("a changed archived hash is a desync, another build is unsupported, and missing inputs are invalid", async () => {
  const tampered = clone(synthetic);
  tampered.turns.find((t) => t.turnNumber === 150)!.hash = 12345;
  expect(await BoardSession.rebuild("s", source(300, tampered), onionMap(), control)).toEqual({ status: "unavailable", reason: "desync" });
  // The hash just after the start is checked on a throwaway branch before the board is exposed.
  const after = clone(synthetic);
  after.turns.find((t) => t.turnNumber === 300)!.hash = 12345;
  expect(await BoardSession.rebuild("s", source(300, after), onionMap(), control)).toEqual({ status: "unavailable", reason: "desync" });
  expect(await BoardSession.rebuild("s", source(300, { ...clone(synthetic), gitCommit: "817c12927c4ec34ec68c74c780a74a14fb776d09" }), onionMap(), control)).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
  for (const broken of [{ ...clone(synthetic), turns: undefined }, { ...clone(synthetic), info: { ...synthetic.info, config: undefined } }, { ...clone(synthetic), info: { ...synthetic.info, gameID: undefined } }])
    expect(await BoardSession.rebuild("s", source(300, broken), onionMap(), control)).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await BoardSession.rebuild("s", { kind: "record", record: synthetic, ownClientId: "Stranger", startTick: 300 }, onionMap(), control)).toEqual({ status: "unavailable", reason: "invalidRecord" });
});

it("a branch at 300 drops own recorded moves, keeps opponents' and runs a supplied move once", async () => {
  const session = await board(300);
  const me = session.handle.ownPlayer;
  const r = await session.run({ untilTick: 360, own: [{ tick: 302, actor: me, action: { kind: "attack", target: null, troops: 777 } }], opponents: "recorded" }, control);
  if (r.status !== "ready") throw new Error(r.reason);
  const after = r.value.record.intents.filter((i) => i.tick >= 300);
  const meId = SYNTH.me, rivalId = SYNTH.rival;
  expect(after.filter((i) => i.by === meId)).toEqual([expect.objectContaining({ kind: "attack", tick: 302, troops: 777 })]);
  expect(after.filter((i) => i.by === rivalId).map((i) => i.tick)).toEqual(expect.arrayContaining([301, 320]));
  expect(r.value.match.samples[0]).toMatchObject({ tick: 300, t: 0 });
  expect(r.value.match.samples.at(-1)!.tick).toBe(360);
  expect(r.value.match.me.clientId).toBe(SYNTH.me);
});

it("scripted opponents replace the recorded ones", async () => {
  const session = await board(300);
  const r = await session.run({ untilTick: 340, own: [], opponents: [] }, control);
  if (r.status !== "ready") throw new Error(r.reason);
  expect(r.value.record.intents.filter((i) => i.tick >= 300 && i.kind !== "spawn")).toEqual([]);
});

it("a restored start checkpoint replays to the same board as the first run", async () => {
  const session = await board(300);
  const start = session.checkpoint();
  await session.run({ untilTick: 330, own: [], opponents: "recorded" }, control);
  const first = session.frame();
  await session.restore(300, start);
  expect(session.frame().tick).toBe(300);
  await session.run({ untilTick: 330, own: [], opponents: "recorded" }, control);
  expect(comparable(session.frame())).toEqual(comparable(first));
});

it("cancellation stops a rebuild at the next batch", async () => {
  let checks = 0;
  const r = await BoardSession.rebuild("s", source(800), onionMap(), { cancelled: () => ++checks > 2, yieldNow: async () => {} });
  expect(r).toEqual({ status: "unavailable", reason: "cancelled" });
  expect(checks).toBe(3);
});

it("a retry replaying the player's own recorded moves reproduces the original; a different move changes it with the same opponent inputs", async () => {
  const turns = expandTurns(synthetic.turns as Turn[], synthetic.info.num_turns);
  const session = await board(300);
  const rival = `p${session.frame().players.find((p) => p.id !== session.handle.ownPlayer)!.id.slice(1)}`;
  const original = turns.slice(300, 420).flatMap((t) => t.intents.filter((i) => i.clientID === SYNTH.me).map((i) => ({
    tick: t.turnNumber, actor: session.handle.ownPlayer,
    action: i.type === "attack" ? { kind: "attack" as const, target: null, troops: (i as { troops: number }).troops } : { kind: "allianceRequest" as const, target: rival },
  })));
  const start = session.checkpoint();
  const same = await session.run({ untilTick: 420, own: original, opponents: "recorded" }, control);
  expect(comparable(session.frame())).toEqual(comparable(await reference(420)));
  await session.restore(300, start);
  const changed = await session.run({ untilTick: 420, own: [{ tick: 300, actor: session.handle.ownPlayer, action: { kind: "attack", target: null, troops: 50_000 } }], opponents: "recorded" }, control);
  expect(comparable(session.frame())).not.toEqual(comparable(await reference(420)));
  if (same.status !== "ready" || changed.status !== "ready") throw new Error("run failed");
  const rivalMoves = (t: typeof same.value) => t.record.intents.filter((i) => i.by === SYNTH.rival && i.tick >= 300);
  expect(rivalMoves(changed.value)).toEqual(rivalMoves(same.value));
});
