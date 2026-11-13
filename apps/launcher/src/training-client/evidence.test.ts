import { expect, it } from "vitest";
import type { DrillCheck } from "../../../../packages/core/src/training/drills";
import type { StampedIntent } from "./TrainingServer";
import { evidenceFor, type IntentContext } from "./evidence";

const ctx: IntentContext = { tick: 120, ownTroops: 10_000, idOf: id => id === "other" ? "p2" : id };
const ally: DrillCheck = { kind: "ally", decision: "accept", target: "p2", deadlineTick: 200 };
const send: DrillCheck = { kind: "send", minSendPct: 20, maxSendPct: 40, minReservePct: 60 };
const post: DrillCheck = { kind: "post", allowedTiles: [42], beforeTick: 200 };
const stamp = (intent: object) => ({ ...intent, clientID: "own" }) as StampedIntent;

it("maps reciprocal alliance requests to accepts and normalizes the target", () => {
  expect(evidenceFor(stamp({ type: "allianceRequest", recipient: "other" }), ally, ctx))
    .toEqual({ decision: "accept", target: "p2", decisionTick: 120 });
});
it("maps requests and rejections using upstream wire types", () => {
  expect(evidenceFor(stamp({ type: "allianceRequest", recipient: "other" }), { ...ally, decision: "request" }, ctx))
    .toEqual({ decision: "request", target: "p2", decisionTick: 120 });
  expect(evidenceFor(stamp({ type: "allianceReject", requestor: "other" }), ally, ctx))
    .toEqual({ decision: "decline", target: "p2", decisionTick: 120 });
});
it("calculates sent and reserve percentages from troops owned at intent time", () => {
  expect(evidenceFor(stamp({ type: "attack", troops: 3000, targetID: "other" }), send, ctx))
    .toEqual({ sentPct: 30, reservePct: 70 });
});
it("records defense post tile and tick", () => {
  expect(evidenceFor(stamp({ type: "build_unit", unit: "Defense Post", tile: 42 }), post, ctx))
    .toEqual({ postTile: 42, postTick: 120 });
});
it("ignores other decision classes", () => {
  expect(evidenceFor(stamp({ type: "attack", troops: 3000, targetID: null }), ally, ctx)).toBeNull();
  expect(evidenceFor(stamp({ type: "build_unit", unit: "City", tile: 42 }), post, ctx)).toBeNull();
});
it("does not invent percentages for unknown or zero own troops or a default-size send", () => {
  const attack = stamp({ type: "attack", troops: 3000, targetID: null });
  for (const ownTroops of [0, NaN, Infinity]) expect(evidenceFor(attack, send, { ...ctx, ownTroops })).toEqual({});
  expect(evidenceFor(stamp({ type: "attack", troops: null, targetID: null }), send, ctx)).toEqual({});
});
