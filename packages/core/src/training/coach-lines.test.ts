import { expect, it } from "vitest";
import { COACH_LINES, RATIONALES, coachLine, roleLabel } from "./coach-lines";
import { NUDGE_LINES, NUDGE_RATIONALE, type NudgeKind } from "../nudge-lines";

const roles = ["Head", "Attack", "Defense", "Economy"] as const;
const mistakes = ["allyDecision", "postsBeforePush", "sendSize"] as const;

it("every role has at least three distinct lines per mistake, each with a known rationale", () => {
  for (const role of roles) for (const mistake of mistakes) {
    const lines = COACH_LINES.filter((l) => l.role === role && l.mistake === mistake);
    expect(lines.length, `${role}/${mistake}`).toBeGreaterThanOrEqual(3);
    expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length);
    for (const l of lines) expect(RATIONALES[l.rationaleId], l.id).toBeTruthy();
  }
  expect(new Set(COACH_LINES.map((l) => l.id)).size).toBe(COACH_LINES.length);
});

it("never leaves an unresolved token, undefined or NaN, with or without numbers", () => {
  for (const role of roles) for (const mistake of mistakes) for (const context of [{}, { time: "4:10", sentPct: 62, reservePct: 20, landLostPct: 18 }]) {
    let previous: string | undefined;
    for (let i = 0; i < 6; i++) {
      const line = coachLine(role, mistake, context, previous);
      expect(line.text).not.toMatch(/[{}]|undefined|NaN/);
      previous = line.id;
    }
  }
});

it("a new call with the previous id returns a different variant", () => {
  for (const role of roles) for (const mistake of mistakes) {
    const first = coachLine(role, mistake, {});
    expect(coachLine(role, mistake, {}, first.id).id).not.toBe(first.id);
  }
});

it("the Attack send-size line carries the observed numbers", () => {
  for (let i = 0, previous: string | undefined; i < 3; i++) {
    const line = coachLine("Attack", "sendSize", { sentPct: 62, reservePct: 20, landLostPct: 18 }, previous);
    expect(line.text).toContain("62%"); expect(line.text).toContain("20%"); expect(line.text).toContain("18%");
    previous = line.id;
  }
});

it("missing numbers drop the numeric clause instead of inventing one", () => {
  for (let i = 0, previous: string | undefined; i < 3; i++) {
    const line = coachLine("Attack", "sendSize", {}, previous);
    expect(line.text).not.toMatch(/\d+%/);
    previous = line.id;
  }
});

it("role labels are exactly the four coaches", () => {
  expect(roles.map(roleLabel)).toEqual(["Head coach", "Attack coach", "Defense coach", "Economy coach"]);
});

it("every in-match nudge kind points at a reviewed rationale", () => {
  for (const kind of Object.keys(NUDGE_LINES) as NudgeKind[]) expect(RATIONALES[NUDGE_RATIONALE[kind]], kind).toBeTruthy();
});
