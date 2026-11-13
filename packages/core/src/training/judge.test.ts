import { expect, it } from "vitest";
import { judgeDrill } from "./judge";

const post = { kind: "post" as const, allowedTiles: [10, 11], beforeTick: 200 };
const send = { kind: "send" as const, minSendPct: 15, maxSendPct: 25, minReservePct: 40 };
const wait = { kind: "send" as const, minSendPct: 0, maxSendPct: 0, minReservePct: 25 };
const ally = { kind: "ally" as const, decision: "accept" as const, target: "p2", deadlineTick: 350 };

it("a post counts only on an allowed tile strictly before the hit", () => {
  expect(judgeDrill(post, { postTile: 10, postTick: 199 })).toBe("correct");
  expect(judgeDrill(post, { postTile: 10, postTick: 200 })).toBe("wrong");
  expect(judgeDrill(post, { postTile: 12, postTick: 150 })).toBe("wrong");
});

it("a send must sit inside the range, both ends included, with enough reserve", () => {
  expect(judgeDrill(send, { sentPct: 15, reservePct: 40 })).toBe("correct");
  expect(judgeDrill(send, { sentPct: 25, reservePct: 60 })).toBe("correct");
  expect(judgeDrill(send, { sentPct: 25, reservePct: 39.9 })).toBe("wrong");
  expect(judgeDrill(send, { sentPct: 25.1, reservePct: 60 })).toBe("wrong");
  expect(judgeDrill(send, { sentPct: 60, reservePct: 30 })).toBe("wrong");
  expect(judgeDrill(wait, { sentPct: 0, reservePct: 30 })).toBe("correct");
  expect(judgeDrill(wait, { sentPct: 20, reservePct: 30 })).toBe("wrong");
});

it("an ally decision must match decision, target and deadline", () => {
  expect(judgeDrill(ally, { decision: "accept", target: "p2", decisionTick: 350 })).toBe("correct");
  expect(judgeDrill(ally, { decision: "accept", target: "p2", decisionTick: 351 })).toBe("wrong");
  expect(judgeDrill(ally, { decision: "decline", target: "p2", decisionTick: 300 })).toBe("wrong");
  expect(judgeDrill(ally, { decision: "accept", target: "p3", decisionTick: 300 })).toBe("wrong");
});

it("missing evidence is unavailable, never a guess", () => {
  expect(judgeDrill(post, {})).toBe("unavailable");
  expect(judgeDrill(send, { sentPct: 20 })).toBe("unavailable");
  expect(judgeDrill(send, { sentPct: Number.NaN, reservePct: 50 })).toBe("unavailable");
  expect(judgeDrill(ally, { decision: "accept", target: "p2" })).toBe("unavailable");
});

it("no decision at all on an ally drill is wrong once the deadline has passed, unavailable before", () => {
  expect(judgeDrill(ally, { observedUntilTick: 400 })).toBe("wrong");
  expect(judgeDrill(ally, { observedUntilTick: 300 })).toBe("unavailable");
  expect(judgeDrill(post, { observedUntilTick: 250 })).toBe("wrong");
});
