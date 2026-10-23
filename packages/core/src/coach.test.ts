import { expect, it } from "vitest";
import { coachMatch } from "./coach";
import { MatchRecorder } from "./recorder";
import { mapToSnapshot } from "./mapToSnapshot";
import type { RawExtract } from "./raw";
it("coaches the 05:34 48%, 06:44 81%, 07:34 16% + incoming playtest arc", () => {
  const r = new MatchRecorder();
  for (const [seconds, fraction, outgoing, incoming] of [[0, 0.48, 0, 0], [334, 0.48, 0, 0], [404, 0.81, 0, 0], [454, 0.16, 1, 130_000], [459, 0.16, 1, 130_000]]) {
    const raw: RawExtract = { inGame: true, visible: true, tick: seconds! * 10, gameId: "fixture1",
      me: { troops: fraction! * 1_000_000, maxTroops: 1_000_000, gold: "200000", cityLevels: 0, attackRatio: 0.8, outgoingCount: outgoing, incoming: incoming ? [{ from: "Never stored", troops: incoming }] : [] } };
    r.consume(raw, mapToSnapshot(raw));
  }
  const m = r.finish()!; const notes = coachMatch(m);
  expect(notes).toHaveLength(5);
  expect(notes[0]).toMatchObject({ severity: "warning", t: 454 });
  expect(notes[0]!.text).toContain("Incoming was observed within 30 seconds of the push at 7:34");
  expect(notes.find(n => n.text.includes("over 70%"))!.text).toContain("0:50");
  expect(notes.some(n => n.text.includes("City was affordable"))).toBe(true);
  expect(notes.some(n => n.severity === "good" && n.text.includes("sweet spot"))).toBe(true);
});
it("returns at least three honest notes even for a recording without samples", () => {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: false }, null);
  const notes = coachMatch(r.finish()!); expect(notes.length).toBeGreaterThanOrEqual(3);
  expect(notes.some(n => n.text.includes("sweet spot"))).toBe(false);
});
it("links observed zones and pushes to recording time without inventing a timestamp for totals", () => {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null); const m = r.finish()!;
  m.summary.exposedPushes = 1; m.summary.timeInZone.wasting = 30; m.summary.timeInZone.sweet = 20; m.summary.idleGoldSeconds = 10;
  m.events = [{ kind: "push", t: 42, sent: 100, ratio: 0.8, fractionBefore: 0.8, fractionAfter: 0.1, zoneAfter: "exposed" }];
  m.samples = [{ t: 10, zone: "wasting" }, { t: 30, zone: "sweet" }] as typeof m.samples;
  const notes = coachMatch(m);
  expect(notes.find(n => n.text.includes("under 25%"))?.t).toBe(42);
  expect(notes.find(n => n.text.includes("over 70%"))?.t).toBe(10);
  expect(notes.find(n => n.text.includes("sweet spot"))?.t).toBe(30);
  expect(notes.find(n => n.text.includes("Gold sat"))?.t).toBeUndefined();
  expect(notes.map(n => n.text).join(" ")).not.toMatch(/keep more|attack or build|rebuild your|always|must|winners do/i);
});
