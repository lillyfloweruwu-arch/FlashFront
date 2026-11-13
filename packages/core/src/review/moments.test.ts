import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { accuracy } from "./accuracy";
import { allyRequests, openingCheck, type AllyRequest } from "./allies";
import { labelPushes, type LabelledPush, type PushLabel } from "./labels";
import { findMoments, keyMoments, mistakeCosts } from "./moments";
import { extractPushes } from "./pushes";
import { parseGameRecord } from "./record";
import { incomingWaves, type IncomingWave } from "./waves";

const push = (label: PushLabel | undefined, landLostPct: number, extra: Partial<LabelledPush> = {}): LabelledPush => ({
  id: "p", startTick: 2520, endTick: 2520, t: 252, target: null, targetKind: "wilderness", boat: false, sends: 1, sent: 1,
  rated: label !== undefined, label, landLostPct, fractionBefore: 0.62, fractionAfter: 0.18,
  reason: label === "blunder" ? "lowReserveLostLand" : label === "costly" ? "lostLand" : label ? "gained" : undefined, ...extra,
});
const wave = (landLostPct: number, post: IncomingWave["post"] = "none", t = 340): IncomingWave =>
  ({ startTick: t * 10, t, attackers: [], source: "recording", post, rated: true, landLostPct });
const ignored = (landLostPct: number): AllyRequest => ({ direction: "incoming", tick: 3620, t: 362, outcome: "ignored",
  other: { clientId: "OTHERCLI", playerId: "human002", kind: "human", name: "Player 2" }, attackedMeAfterSec: 90, landLostPct });
const na = { applicable: false };

it("orders worst first by land lost, then by label severity, at most 5", () => {
  const m = keyMoments([push("costly", 3), push("costly", 18), push("blunder", 0), push("costly", 0), push("costly", 7), push("costly", 2)], [], [], na);
  expect(m.map(x => [x.landLostPct, x.label])).toEqual([[18, "costly"], [7, "costly"], [3, "costly"], [2, "costly"], [0, "blunder"]]);
});
it("Good, Great, Neutral and unrated pushes never become moments", () => {
  expect(keyMoments([push("good", 0), push("great", 0), push("neutral", 0), push(undefined, 40)], [], [], na)).toEqual([]);
});
it("shows the observed drawdown but uses weighted loss for send-size drill costs", () => {
  const moments = keyMoments([push("blunder", 0, { reason: "largeLoss", landDrawdownPct: 50, blamedLandLostPct: 25 })], [], [], na);
  expect(moments[0]).toMatchObject({ landLostPct: 50, blamedLandLostPct: 25, mistake: "sendSize" });
  expect(moments[0]!.text).toContain("your land fell 50%");
  expect(mistakeCosts(moments).sendSize).toBe(25);
});
it("Costly pushes that are not about send size get no mistake type", () => {
  const [m] = keyMoments([push("costly", 0, { reason: "noLand", landChangePct: 0, fractionAfter: 0.5 })], [], [], na);
  expect(m!.mistake).toBeUndefined();
  expect(m).toMatchObject({ kind: "push", label: "costly", text: "4:12 push: reserves 62% → 50%, and it gained no land." });
  expect(keyMoments([push("costly", 0, { reason: "lowReserve", fractionAfter: 0.3 })], [], [], na)[0]!.mistake).toBe("sendSize");
});
it("texts are plain, observed and name-free", () => {
  const m = keyMoments([push("blunder", 18)], [wave(15), wave(4, "late", 500), wave(6, "onTime", 600)], [ignored(12)], { applicable: true, portSec: 100 });
  expect(m.map(x => x.text)).toEqual([
    "4:12 push: reserves 62% → 18%, then your land fell 18% within a minute.",
    "5:40 attack landed with no defense post built in the minute before. Land fell 15%.",
    "6:02 you left an alliance request unanswered; that player attacked 1:30 later.",
    "10:00 attack landed despite a defense post. Land fell 6%.",
    "8:20 attack landed before your defense post was built. Land fell 4%.",
  ]);
  expect(findMoments([], [], [{ ...ignored(0), outcome: "rejected" }], { applicable: true, portSec: 100, allySec: 400 }).map(x => x.text)).toEqual([
    "5:00 no alliance by five minutes in.",
    "6:02 you turned down an alliance request; that player attacked 1:30 later.",
  ]);
  for (const x of m) expect(x.text).not.toMatch(/Player \d|OTHERCLI|human002|\b(?=[a-z]*\d)[0-9a-z]{8}\b/);
});
it("only links ally moments when the requester attacked, and only for rejected or ignored requests", () => {
  const { attackedMeAfterSec: _, ...quiet } = ignored(0);
  expect(findMoments([], [], [quiet, { ...ignored(5), outcome: "accepted" }], na)).toEqual([]);
});
it("mistakeCosts sums land per type over every moment, not only the top 5", () => {
  const all = findMoments([push("blunder", 18), ...Array(6).fill(push("costly", 20))], [wave(15), wave(3, "onTime")], [ignored(12)], { applicable: true });
  expect(all.length).toBeGreaterThan(5);
  expect(mistakeCosts(all)).toEqual({ allyDecision: 12, postsBeforePush: 15, sendSize: 18 });
  expect(mistakeCosts([])).toEqual({ allyDecision: 0, postsBeforePush: 0, sendSize: 0 });
});
it("builds moments for the captured game", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  const r = parseGameRecord(JSON.parse(readFileSync(new URL("team-record.json", dir), "utf8")))!;
  const m = JSON.parse(readFileSync(new URL("team-recording.json", dir), "utf8"));
  const pushes = labelPushes(extractPushes(r, m), 35), waves = incomingWaves(r, m), opening = openingCheck(r, m);
  const moments = keyMoments(pushes, waves, allyRequests(r, m, waves), opening);
  expect(moments.length).toBeLessThanOrEqual(5);
  expect(moments.every((x, k) => k === 0 || x.landLostPct <= moments[k - 1]!.landLostPct)).toBe(true);
  expect(accuracy(pushes, waves, opening).rated).toBeGreaterThanOrEqual(3);
});
