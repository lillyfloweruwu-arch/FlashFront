import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { derivePlayerIds } from "@flashfront/core";
import type { DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import type { DrillCheck } from "../../../../packages/core/src/training/drills";
import { TrainingServer, type StampedIntent } from "./TrainingServer";
import { DrillReferee, type RefereeEvent } from "./DrillReferee";

const ally: DrillCheck = { kind: "ally", decision: "accept", target: "p2", deadlineTick: 200 };
const send: DrillCheck = { kind: "send", minSendPct: 20, maxSendPct: 40, minReservePct: 60 };
const stamp = (intent: object) => ({ ...intent, clientID: "own" }) as StampedIntent;
const accept = stamp({ type: "allianceRequest", recipient: "other" });
const decline = stamp({ type: "allianceReject", requestor: "other" });
let server: TrainingServer;
let referee: DrillReferee;
let events: RefereeEvent[];
let tick: number;
let ownTroops: number;
let turns: { intents: StampedIntent[] }[];
function setup(check: DrillCheck = ally) {
  const data: DrillClientData = { drillId: "ally-02", engineCommit: "test", snapshotFormat: "test", startTick: 50,
    ownClientId: "own", gameStartInfo: { lobbyCreatedAt: 1 }, opponents: [], coach: [], check,
    window: { openTick: 100, deadlineTick: 200 } };
  server = new TrainingServer({ gameStartInfo: data.gameStartInfo, training: { data, mode: "play" } } as any, false, {} as any);
  server.updateCallback(() => {}, message => {
    if (message.type === "turn") { turns.push(message.turn); server.turnComplete(); }
  });
  referee = new DrillReferee(data, server, () => ({ tick, ownTroops, idOf: id => id === "other" ? "p2" : id }), e => events.push(e));
}
const judge = (intent: StampedIntent) => server.onPlayerIntent!(intent, server.turn());
beforeEach(() => { vi.useFakeTimers(); events = []; turns = []; tick = 120; ownTroops = 10_000; });
afterEach(() => { server.endGame(); vi.useRealTimers(); });

it("before window is free, including same-class wrong intents", () => {
  setup(); tick = 99;
  expect(judge(stamp({ type: "attack", troops: 9000, targetID: null }))).toBe("forward");
  expect(judge(decline)).toBe("forward");
  expect(events).toEqual([]);
  tick = 100; expect(judge(decline)).toBe("hold");
});
it("wrong is held and pauses", () => {
  setup(); expect(judge(decline)).toBe("hold");
  expect(server.paused).toBe(true);
  expect(events).toEqual([{ kind: "wrong", evidence: { decision: "decline", target: "p2", decisionTick: 120 }, held: decline }]);
});
it("correct forwards at the inclusive deadline", () => {
  setup(); tick = 200; expect(judge(accept)).toBe("forward");
  expect(events).toEqual([{ kind: "correct", evidence: { decision: "accept", target: "p2", decisionTick: 200 } }]);
  referee.onTurn(201); expect(events).toHaveLength(1); expect(server.paused).toBe(false);
});
it("first send counts and uses fresh troop counts", () => {
  setup(send); ownTroops = 20_000;
  expect(judge(stamp({ type: "attack", troops: 6000, targetID: null }))).toBe("forward");
  expect(judge(stamp({ type: "attack", troops: 19_000, targetID: null }))).toBe("forward");
  expect(events).toEqual([{ kind: "correct", evidence: { sentPct: 30, reservePct: 70 } }]);
  expect(server.paused).toBe(false);
});
it("unrelated and late intents are free and do not suppress the deadline", () => {
  setup(); expect(judge(stamp({ type: "attack", troops: 9000, targetID: null }))).toBe("forward");
  tick = 201; expect(judge(accept)).toBe("forward"); expect(events).toEqual([]);
  referee.onTurn(201); expect(events[0]?.kind).toBe("wrong");
});
it.each([ally, send, { kind: "post", allowedTiles: [42], beforeTick: 201 } as DrillCheck])("deadline without a decision: $kind", check => {
  setup(check); referee.onTurn(200); expect(events).toEqual([]);
  referee.onTurn(201); referee.onTurn(202);
  expect(events).toEqual([{ kind: "wrong", evidence: { observedUntilTick: 201 }, held: null }]);
  expect(server.paused).toBe(true);
});
it("keep playing releases the held intent into the next turn and stops judging", () => {
  setup(); server.start(); server.onMessage({ type: "intent", intent: decline });
  vi.advanceTimersByTime(110); expect(turns).toEqual([]);
  referee.keepPlaying(); referee.keepPlaying();
  vi.advanceTimersByTime(10); expect(turns[0].intents).toEqual([decline]);
  server.onMessage({ type: "intent", intent: decline }); vi.advanceTimersByTime(100);
  expect(turns[1].intents).toEqual([decline]);
  referee.onTurn(201); expect(events).toHaveLength(1);
});
it("reset enables judging a fresh attempt", () => {
  setup(); expect(judge(decline)).toBe("hold"); referee.keepPlaying(); referee.reset();
  expect(judge(accept)).toBe("forward"); expect(events.map(e => e.kind)).toEqual(["wrong", "correct"]);
});
it("accepts the actual ally-02 client's coached target with runtime session ids", () => {
  const data: DrillClientData = JSON.parse(readFileSync(new URL("../../resources/training/drills/client/ally-02.json", import.meta.url), "utf8"));
  const start = data.gameStartInfo as { gameID: string; players: { clientID: string }[] };
  const ids = derivePlayerIds(start.gameID, start.players.length);
  setup();
  new DrillReferee(data, server, () => ({ tick: data.startTick + data.coach[0].turn, ownTroops: 10_000,
    idOf: id => `p${ids.indexOf(id) + 1}` }), e => events.push(e));
  expect(judge(data.coach[0].intent as StampedIntent)).toBe("forward");
  expect(events[0]?.kind).toBe("correct");
});
