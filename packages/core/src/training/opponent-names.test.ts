import { expect, it } from "vitest";
import { OPPONENT_NAMES, opponentNames } from "./opponent-names";

it("provides at least 24 distinct invented names, excluding You", () => {
  expect(OPPONENT_NAMES.length).toBeGreaterThanOrEqual(24);
  const names = opponentNames("ally-02", OPPONENT_NAMES.length);
  expect(new Set(names).size).toBe(OPPONENT_NAMES.length);
  expect(names).not.toContain("You");
  for (const name of names) expect(name).toMatch(/^[A-Z][a-z]+$/);
});
it("returns the requested count deterministically", () => {
  expect(opponentNames("ally-02", 3)).toHaveLength(3);
  expect(opponentNames("ally-02", 3)).toEqual(opponentNames("ally-02", 3));
  expect(opponentNames("ally-02", 0)).toEqual([]);
});
it.each([-1, 1.5, NaN, Infinity, 1000])("rejects invalid count %s", (count) => {
  expect(() => opponentNames("ally-02", count)).toThrow();
});
