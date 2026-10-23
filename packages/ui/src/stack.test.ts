import { expect, it } from "vitest";
import { stackColumns } from "./hud/layout";

it("stacks visible panels top-down per side column with a 12px gap, nothing in the middle", () => {
  const pos = stackColumns({ gauge: 200, attack: 180, alliances: 110, build: 220, trade: 100, events: 150 }, 1920, 1080);
  expect(pos.gauge).toEqual([16, 284]);
  expect(pos.attack).toEqual([16, 284 + 200 + 12]);
  expect(pos.build).toEqual([1632, 190]);
  expect(pos.trade).toEqual([1632, 190 + 220 + 12]);
  expect(pos.alliances).toEqual([1632, 190 + 220 + 12 + 100 + 12]);
  expect(pos.events).toEqual([1632, 190 + 220 + 12 + 100 + 12 + 110 + 12]);
  for (const [x] of Object.values(pos)) expect(x === 16 || x === 1632).toBe(true);
});
it("skips hidden panels (no gaps) and scales to the viewport", () => {
  const pos = stackColumns({ attack: 100, build: 50 }, 960, 540);
  expect(pos.attack).toEqual([8, 142]);
  expect(pos.build).toEqual([816, 95]);
  expect(pos.gauge).toBeUndefined();
});
