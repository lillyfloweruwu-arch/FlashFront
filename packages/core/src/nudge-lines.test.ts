import { expect, it } from "vitest";
import { NUDGE_LINES, nudgeLine, type NudgeKind } from "./nudge-lines";
const values = { incoming: "160K", troops: "200K", percent: 18, floor: 35 };
it("every nudge line speaks as a role, never as a person", () => {
  for (const kind of Object.keys(NUDGE_LINES) as NudgeKind[]) for (let i = 0; i < 20; i++) {
    const line = nudgeLine(kind, `g${i}`, values);
    expect(line).toMatch(/^(Head|Attack|Defense|Economy) coach: /);
    expect(line).not.toMatch(/\bI\b|\bI'm\b|\bmy\b|[{}]/);
    expect(line.length).toBeLessThanOrEqual(110);
  }
});
it("picks a stable variant per seed and fills own-number placeholders", () => {
  expect(nudgeLine("noAlly", "g1:noAlly", values)).toBe(nudgeLine("noAlly", "g1:noAlly", values));
  expect(new Set(Array.from({ length: 20 }, (_, i) => nudgeLine("noAlly", `g${i}`, values))).size).toBe(2);
  expect(nudgeLine("danger", "x", { ...values, pick: 0 })).toBe("Defense coach: Big attack: 160K coming at your 200K. Keep your troops home.");
});
it("keeps the spec's build-planner line verbatim", () => {
  expect(nudgeLine("portIdle", "x", values)).toBe("Economy coach: Port now, you've had the gold for 30 s.");
});
