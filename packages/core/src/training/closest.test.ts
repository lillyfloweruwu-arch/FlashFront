import { expect, it } from "vitest";
import { sample } from "../review/testHelpers";
import { closestPreparedDrill, momentTags } from "./closest";
import type { PreparedDrill } from "./drills";

const drill = (id: string, mistake: PreparedDrill["mistake"], tags: string[]): PreparedDrill => ({
  id, version: 1, mistake, role: "Defense", title: id, durationSec: 120, boardId: id, rationaleId: "r", coachLineId: "c", tags,
  check: mistake === "sendSize" ? { kind: "send", minSendPct: 0, maxSendPct: 10, minReservePct: 0 } : mistake === "postsBeforePush" ? { kind: "post", allowedTiles: [1], beforeTick: 1 } : { kind: "ally", decision: "accept", target: "A", deadlineTick: 1 },
});
const catalog = [
  drill("posts-01", "postsBeforePush", []), drill("posts-02", "postsBeforePush", ["underAttack"]), drill("posts-03", "postsBeforePush", ["underAttack", "coast"]),
  drill("posts-04", "postsBeforePush", ["underAttack", "coast"]), drill("sends-01", "sendSize", ["underAttack", "coast", "lowReserve"]),
];

it("picks the same-type drill sharing the most tags, ties by catalogue id", () => {
  expect(closestPreparedDrill("postsBeforePush", ["underAttack", "coast"], catalog)?.id).toBe("posts-03");
  expect(closestPreparedDrill("postsBeforePush", ["underAttack"], catalog)?.id).toBe("posts-02");
});

it("never crosses mistake types, even with more shared tags", () => {
  expect(closestPreparedDrill("postsBeforePush", ["underAttack", "coast", "lowReserve"], catalog)?.mistake).toBe("postsBeforePush");
});

it("without known tags it takes the first same-type drill, and nothing when the type has none", () => {
  expect(closestPreparedDrill("postsBeforePush", [], catalog)?.id).toBe("posts-01");
  expect(closestPreparedDrill("allyDecision", ["opening"], catalog)).toBeUndefined();
});

it("derives only tags the recorded observations support", () => {
  expect(momentTags({ tick: 1000, t: 100 }, [sample(1000, { troops: 200_000, maxTroops: 1_000_000, incoming: 50_000 })]).sort()).toEqual(["lowReserve", "opening", "underAttack"]);
  expect(momentTags({ tick: 9000, t: 900 }, [sample(9000, { troops: 900_000, maxTroops: 1_000_000, incoming: 0 })])).toEqual(["highReserve"]);
  expect(momentTags({ tick: 9000, t: 900 }, [])).toEqual([]);
});
