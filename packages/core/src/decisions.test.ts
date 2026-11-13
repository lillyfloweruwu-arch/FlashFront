import { expect, it } from "vitest";
import { MockDataSource } from "./mock/MockDataSource";
import { DecisionTracker, decisionCandidates, decisionSample, nextDecision, type DecisionHistory } from "./decisions";
const snapshot = (t = 100) => {
  const s = new MockDataSource().getSnapshot(); s.phase = "playing"; s.elapsedSec = t; s.tick = t * 10;
  Object.assign(s.self!, { troops: 800000, maxTroops: 1000000, tilesOwned: 100, gold: 1e9, incomingAttacks: [], alliances: [] });
  return s;
};
const history = (): DecisionHistory => ({ samples: [], shown: {} });
it("orders danger, survival, exposed, idle, growth, renew and no ally with safe copy", () => {
  const s = snapshot(); const h = history();
  for (let t = 65; t < 100; t++) h.samples.push(decisionSample({ ...s, elapsedSec: t })!);
  const pick = () => nextDecision(s, h, 100, {});
  expect(pick()?.kind).toBe("idleGold");
  s.self!.gold = 0; expect(pick()?.kind).toBe("growth");
  s.self!.troops = 200000; expect(pick()?.kind).toBe("exposed");
  s.self!.tilesOwned = 95; expect(pick()?.kind).toBe("losingGround");
  s.self!.incomingAttacks = [{ from: "Incoming attack", troops: 160000 }]; expect(pick()?.kind).toBe("danger");
  const texts = [pick()!.text];
  for (const troops of [200000, 400000, 800000]) { s.self!.troops = troops; s.self!.incomingAttacks = []; texts.push(pick()?.text ?? ""); }
  // The decision card now repeats the own alliance's impending expiry.
  s.self!.troops = 400000; s.self!.alliances = [{ with: "Alliance", expiresAtTick: 1280 }];
  expect(pick()?.kind).toBe("renew"); texts.push(pick()!.text);
  s.self!.alliances = []; expect(pick()?.kind).toBe("noAlly"); texts.push(pick()!.text);
  expect(texts.join(" ")).not.toMatch(/always|must|spend|winners|should|betray/i);
  expect(texts.join(" ")).not.toContain("Renew?");
});
it("clears immediately, keeps an active card visible, and applies 90-second per-kind cooldowns", () => {
  const tracker = new DecisionTracker(); const s = snapshot(); s.self!.gold = 0; s.self!.troops = 400000;
  expect(tracker.observe(s, 100)?.kind).toBe("noAlly");
  expect(tracker.observe(s, 101)?.kind).toBe("noAlly");
  s.self!.alliances = [{ with: "Ally" }]; expect(tracker.observe(s, 102)).toBeUndefined();
  s.self!.alliances = []; expect(tracker.observe(s, 189)).toBeUndefined();
  expect(tracker.observe(s, 190)?.kind).toBe("noAlly");
  tracker.snooze(190); expect(tracker.observe(s, 309)).toBeUndefined();
  expect(tracker.observe(s, 310)?.kind).toBe("noAlly");
  s.self!.incomingAttacks = [{ from: "Incoming attack", troops: 400000 }];
  expect(tracker.observe(s, 311)?.kind).toBe("danger"); tracker.snooze(311);
  expect(tracker.observe(s, 312)?.kind).not.toBe("danger");
  expect(tracker.observe(s, 431)?.kind).toBe("danger");
  s.self!.incomingAttacks = []; expect(tracker.observe(s, 432)?.kind).not.toBe("danger");
  s.self!.incomingAttacks = [{ from: "Incoming attack", troops: 400000 }];
  expect(tracker.observe(s, 433)?.kind).toBe("danger");
  s.phase = "spawn"; expect(tracker.observe(s, 434)).toBeUndefined();
});
it("requires sustained observations and limits survival and push warnings to their windows", () => {
  const s = snapshot(100); const h = history();
  expect(nextDecision(s, h, 100, {})?.kind).toBe("noAlly");
  h.samples = [decisionSample({ ...s, elapsedSec: 60 })!];
  expect(nextDecision(s, h, 100, {})?.kind).toBe("noAlly");
  h.samples = [decisionSample({ ...s, elapsedSec: 90 })!, decisionSample({ ...s, elapsedSec: 99 })!];
  s.self!.troops = 200000; s.self!.tilesOwned = 95;
  expect(nextDecision(s, h, 100, {})?.kind).toBe("losingGround");
  s.elapsedSec = 180; s.tick = 1800;
  expect(nextDecision(s, h, 180, {})?.kind).toBe("noAlly");
});
it("resets cooldowns and observations on a new match or tick reset", () => {
  const tracker = new DecisionTracker(); const s = snapshot();
  tracker.observe(s, 100); tracker.snooze(100);
  s.gameId = "new"; expect(tracker.observe(s, 101)?.kind).toBe("noAlly");
  tracker.snooze(101); s.tick--;
  expect(tracker.observe(s, 102)?.kind).toBe("noAlly");
});
it("lets the growth gauge own routine growth state without changing other priorities", () => {
  const s = snapshot(); s.self!.gold = 0; const h = history();
  for (let t = 65; t < 100; t++) h.samples.push(decisionSample({ ...s, elapsedSec: t })!);
  expect(nextDecision(s, h, 100, {})?.kind).toBe("growth");
  expect(nextDecision(s, h, 100, {})?.text).toBe("Growth slowing at 80% of max.");
  expect(nextDecision(s, h, 100, {}, undefined, ["growth"])?.kind).toBe("noAlly");
  s.self!.troops = 200000; expect(nextDecision(s, h, 100, {}, undefined, ["growth"])?.kind).toBe("exposed");
  const tracker = new DecisionTracker(); const t = snapshot(); t.self!.gold = 0;
  for (let i = 60; i <= 100; i++) { t.elapsedSec = i; t.tick = i * 10; tracker.observe(t, i, undefined, ["growth"]); }
  expect(tracker.observe(t, 100, undefined, ["growth"])?.kind).toBe("noAlly");
});
it("reports whether a card is snoozed", () => {
  const tracker = new DecisionTracker(); const s = snapshot(); s.self!.gold = 0; s.self!.troops = 400000;
  expect(tracker.isSnoozed(100)).toBe(false);
  tracker.observe(s, 100); tracker.snooze(100);
  expect(tracker.isSnoozed(150)).toBe(true); expect(tracker.isSnoozed(221)).toBe(false);
});

it("candidates lists every active decision at once without display filtering", () => {
  const s = snapshot(); const h = history(); s.self!.gold = 0; s.self!.troops = 400000;
  h.samples = [decisionSample({ ...s, elapsedSec: 99 })!];
  s.self!.troops = 200000; s.self!.incomingAttacks = [{ from: "Incoming attack", troops: 160000 }];
  // Existing noAlly predicate suppresses it during danger; no outgoing increase means no recovery.
  expect(decisionCandidates(s, h).map(d => d.kind)).toEqual(["danger", "exposed"]);
  const tracker = new DecisionTracker(); tracker.observe(s, 100);
  expect(tracker.candidates.map(d => d.kind)).toContain("danger");
  tracker.snooze(100); tracker.observe(s, 101, 35, ["danger"]);
  expect(tracker.candidates.map(d => d.kind)).toContain("danger");
  expect(decisionCandidates({ ...s, observer: "replay" }, h)).toEqual([]);
});
