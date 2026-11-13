import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { allyRequests, openingCheck } from "./allies";
import { parseGameRecord, type RecordIntent } from "./record";
import { attack, match, rec, samples } from "./testHelpers";
import { incomingWaves, type IncomingWave } from "./waves";

const ask = (tick: number, by: string, to: string): RecordIntent => ({ kind: "allianceRequest", tick, by, to });
const reject = (tick: number, by: string, requestor: string): RecordIntent => ({ kind: "allianceReject", tick, by, requestor });
const port = (tick: number): RecordIntent => ({ kind: "build", tick, by: "OWNCLI00", unit: "Port" });

it("incoming request answered by a request back is accepted", () => {
  const a = allyRequests(rec([ask(1000, "OTHERCLI", "own00000"), ask(1100, "OWNCLI00", "human002")]), match(), []);
  expect(a).toEqual([{ direction: "incoming", tick: 1000, t: 100, other: { clientId: "OTHERCLI", playerId: "human002", kind: "human", name: "Player 2" }, outcome: "accepted" }]);
});
it("pairs ordered requests and rejections within the same sparse turn", () => {
  expect(allyRequests(rec([ask(1000, "OTHERCLI", "own00000"), ask(1000, "OWNCLI00", "human002")]), match(), [])
    .map(a => a.outcome)).toEqual(["accepted"]);
  expect(allyRequests(rec([ask(1000, "OTHERCLI", "own00000"), reject(1000, "OWNCLI00", "human002")]), match(), [])
    .map(a => a.outcome)).toEqual(["rejected"]);
});
it("incoming answered by allianceReject is rejected; silence for 20 s is ignored", () => {
  expect(allyRequests(rec([ask(1000, "OTHERCLI", "own00000"), reject(1050, "OWNCLI00", "human002")]), match(), [])[0]!.outcome).toBe("rejected");
  expect(allyRequests(rec([ask(1000, "OTHERCLI", "own00000"), ask(1201, "OWNCLI00", "human002")]), match(), []).map(x => [x.direction, x.outcome]))
    .toEqual([["incoming", "ignored"], ["outgoing", "ignored"]]);
});
it("an outgoing request to a human answered in time is accepted, not a second incoming request", () => {
  const a = allyRequests(rec([ask(1000, "OWNCLI00", "human002"), ask(1150, "OTHERCLI", "own00000")]), match(), []);
  expect(a.map(x => [x.direction, x.outcome])).toEqual([["outgoing", "accepted"]]);
});
it("an ignored requester who attacks within 120 s is linked to the wave", () => {
  const r = rec([ask(1000, "OTHERCLI", "own00000"), attack(1900, "own00000", 50_000, "OTHERCLI")]);
  const waves: IncomingWave[] = [{ startTick: 1850, t: 185, attackers: ["OTHERCLI"], source: "both", post: "none", rated: true, landLostPct: 12 }];
  expect(allyRequests(r, match(), waves)[0]).toMatchObject({ outcome: "ignored", attackedMeAfterSec: 90, landLostPct: 12 });
  const late = rec([ask(1000, "OTHERCLI", "own00000"), attack(2300, "own00000", 50_000, "OTHERCLI")]);
  expect(allyRequests(late, match(), waves)[0]!.attackedMeAfterSec).toBeUndefined();
});
it("outgoing request to a nation has unknown outcome", () => {
  const a = allyRequests(rec([ask(1000, "OWNCLI00", "nation01")]), match(), []);
  expect(a).toEqual([{ direction: "outgoing", tick: 1000, t: 100, other: { playerId: "nation01", kind: "ai" }, outcome: "unknown" }]);
});
it("never pairs my own requests to myself or reads other players' requests to each other", () => {
  expect(allyRequests(rec([ask(1000, "OWNCLI00", "own00000"), ask(1000, "OTHERCLI", "nation01")]), match(), [])).toEqual([]);
});
it("no ally analysis when ids are unverified", () => {
  const r = rec([ask(1000, "OTHERCLI", "own00000")]); r.idsVerified = false;
  expect(allyRequests(r, match(), [])).toEqual([]);
});
it("opening: first own Port build and first accepted alliance in game seconds", () => {
  const r = rec([port(2200), port(2600), ask(1000, "OTHERCLI", "own00000"), ask(1100, "OWNCLI00", "human002")]);
  expect(openingCheck(r, match())).toEqual({ applicable: true, portSec: 220, allySec: 110 });
  expect(openingCheck(rec(), match(samples(0, 3000, tick => ({ allianceCount: tick >= 1500 ? 1 : 0 }))))).toEqual({ applicable: true, allySec: 150 });
  expect(openingCheck(rec(), match(samples(), { events: [{ kind: "build", t: 90, unit: "portLevels", levels: 1 }] }))).toEqual({ applicable: true, portSec: 90 });
  const off = rec([port(2200)]); off.alliancesEnabled = false;
  expect(openingCheck(off, match()).applicable).toBe(false);
  expect(openingCheck(r, match(samples(), { rankedType: "1v1" })).applicable).toBe(false);
  expect(openingCheck(r, match(samples(350, 3000))).applicable).toBe(false);
});
it("reads the captured game's ally requests without naming my own client", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const r = parseGameRecord(JSON.parse(readFileSync(new URL("team-record.json", dir), "utf8")))!;
  const m = JSON.parse(readFileSync(new URL("team-recording.json", dir), "utf8"));
  const a = allyRequests(r, m, incomingWaves(r, m));
  expect(a.length).toBeGreaterThan(0);
  expect(a.every(x => x.other.clientId !== m.me.clientId)).toBe(true);
});

it("does not call a request ignored when the game ends before its answer window", () => {
  const r = rec([ask(9900, "OTHERCLI", "own00000")]);
  expect(allyRequests(r, match(), [])[0]!.outcome).toBe("unknown");
});

it("does not judge an opening when the recording ends before five minutes", () => {
  expect(openingCheck(rec(), match(samples(0, 2000))).applicable).toBe(false);
});
