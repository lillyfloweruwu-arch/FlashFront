import { expect, it } from "vitest";
import { validateDrill, validateCatalog } from "./drills";

const base = {
  id: "posts-01", version: 1, mistake: "postsBeforePush", role: "Defense", title: "Cover the choke", durationSec: 120,
  boardId: "posts-01", check: { kind: "post", allowedTiles: [10, 11], beforeTick: 500 }, rationaleId: "posts-before-contact",
  coachLineId: "defense-posts-1", tags: ["underAttack"],
};

it("accepts a well-formed drill and returns it typed", () => {
  expect(validateDrill(base)).toEqual(base);
  expect(validateDrill({ ...base, id: "ally-03", mistake: "allyDecision", role: "Head", check: { kind: "ally", decision: "accept", target: "Neighbour A", deadlineTick: 350 } }).check.kind).toBe("ally");
  expect(validateDrill({ ...base, id: "sends-01", mistake: "sendSize", role: "Attack", check: { kind: "send", minSendPct: 0, maxSendPct: 0, minReservePct: 25 } }).check).toEqual({ kind: "send", minSendPct: 0, maxSendPct: 0, minReservePct: 25 });
});

it("rejects unknown mistake, role and version", () => {
  expect(() => validateDrill({ ...base, mistake: "boats" })).toThrow(/mistake/);
  expect(() => validateDrill({ ...base, role: "Navy" })).toThrow(/role/);
  expect(() => validateDrill({ ...base, version: 2 })).toThrow(/version/);
  expect(() => validateDrill({ ...base, durationSec: 60 })).toThrow(/durationSec/);
  expect(() => validateDrill(null)).toThrow();
});

it("rejects negative or fractional ticks and empty or invalid post tiles", () => {
  expect(() => validateDrill({ ...base, check: { kind: "post", allowedTiles: [10], beforeTick: -1 } })).toThrow(/tick/);
  expect(() => validateDrill({ ...base, check: { kind: "post", allowedTiles: [10], beforeTick: 2.5 } })).toThrow(/tick/);
  expect(() => validateDrill({ ...base, check: { kind: "post", allowedTiles: [], beforeTick: 5 } })).toThrow(/tiles/);
  expect(() => validateDrill({ ...base, check: { kind: "post", allowedTiles: [1.5], beforeTick: 5 } })).toThrow(/tiles/);
  expect(() => validateDrill({ ...base, mistake: "allyDecision", check: { kind: "ally", decision: "accept", target: "A", deadlineTick: 3.2 } })).toThrow(/tick/);
});

it("rejects send bounds outside 0–100 or inverted, and checks that do not fit the mistake", () => {
  const send = (minSendPct: number, maxSendPct: number, minReservePct = 40) => ({ ...base, mistake: "sendSize", check: { kind: "send", minSendPct, maxSendPct, minReservePct } });
  expect(() => validateDrill(send(-5, 20))).toThrow(/send/);
  expect(() => validateDrill(send(10, 120))).toThrow(/send/);
  expect(() => validateDrill(send(30, 20))).toThrow(/send/);
  expect(() => validateDrill(send(10, 20, 101))).toThrow(/reserve/);
  expect(() => validateDrill({ ...base, mistake: "sendSize" })).toThrow(/check/);
});

it("rejects duplicate ids in a catalogue", () => {
  expect(() => validateCatalog([base, { ...base }])).toThrow(/duplicate/);
  expect(validateCatalog([base, { ...base, id: "posts-02", boardId: "posts-02" }])).toHaveLength(2);
});
