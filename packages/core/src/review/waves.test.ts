import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseGameRecord, type RecordIntent } from "./record";
import { attack, match, rec, samples } from "./testHelpers";
import { incomingWaves } from "./waves";

const post = (tick: number, by = "OWNCLI00"): RecordIntent => ({ kind: "build", tick, by, unit: "Defense Post" });
const third = { clientId: "THIRDCLI", playerId: "human003", name: "Player 3" };

it("merges human attack intents at me with recorded incoming events into waves", () => {
  const r = rec([attack(1000, "own00000", 30_000, "OTHERCLI"), attack(1050, "own00000", 20_000, "THIRDCLI")]);
  r.players.push(third);
  const w = incomingWaves(r, match(samples(), { events: [{ kind: "incoming", t: 103, troops: 40_000 }, { kind: "incoming", t: 140, troops: 9000 }] }));
  expect(w.map(x => [x.startTick, x.source, x.attackers])).toEqual([[1000, "both", ["OTHERCLI", "THIRDCLI"]], [1400, "recording", []]]);
  expect(w[0]!.t).toBe(100);
});
it("ignores my own attacks and attacks at other players", () => {
  expect(incomingWaves(rec([attack(1000, "own00000", 5, "OWNCLI00"), attack(1000, "human002", 5, "OTHERCLI")]), match())).toEqual([]);
});
it("rates post timing from own Defense Post builds", () => {
  const at = (intents: RecordIntent[], events = match().events) =>
    incomingWaves(rec([attack(1500, "own00000", 5000, "OTHERCLI"), ...intents]), match(samples(), { events }))[0]!.post;
  expect(at([post(1200)])).toBe("onTime");
  expect(at([post(1600)])).toBe("late");
  expect(at([post(800), post(1900), post(1200, "OTHERCLI")])).toBe("none");
  expect(at([], [{ kind: "build", t: 140, unit: "defensePosts", levels: 1 }])).toBe("onTime");
  expect(at([], [{ kind: "build", t: 140, unit: "cities", levels: 1 }])).toBe("none");
});
it("measures land lost in the 60 s after the wave starts from own samples", () => {
  const m = match(samples(0, 3000, tick => ({ tiles: tick < 1100 ? 1000 : 850 })));
  expect(incomingWaves(rec([attack(1000, "own00000", 5000, "OTHERCLI")]), m)[0]).toMatchObject({ rated: true, landLostPct: 15 });
  expect(incomingWaves(rec([attack(1000, "own00000", 5000, "OTHERCLI")]), match(samples(1200, 3000)))[0]).toMatchObject({ rated: false });
});
it("falls back to recording events when ids are unverified", () => {
  const r = rec([attack(1000, "own00000", 5000, "OTHERCLI")]); r.idsVerified = false;
  const w = incomingWaves(r, match(samples(), { events: [{ kind: "incoming", t: 101, troops: 5000 }] }));
  expect(w.map(x => [x.source, x.attackers])).toEqual([["recording", []]]);
});
it("finds waves in the captured game", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const r = parseGameRecord(JSON.parse(readFileSync(new URL("team-record.json", dir), "utf8")))!;
  const w = incomingWaves(r, JSON.parse(readFileSync(new URL("team-recording.json", dir), "utf8")));
  expect(w.length).toBeGreaterThan(0);
  expect(w.every((x, k) => k === 0 || x.startTick > w[k - 1]!.startTick)).toBe(true);
});
