import { DRILL_CATALOG } from "@flashfront/core";
import { expect, it } from "vitest";
import { loadPreparedDrill } from "./drill-assets";

it("every catalogue drill loads its checked board and scripts", async () => {
  for (const d of DRILL_CATALOG) {
    const loaded = await loadPreparedDrill(d.id);
    expect(loaded.drill).toBe(d);
    expect(loaded.board.id).toBe(d.boardId);
    expect(loaded.board.mapSize).toBe("Compact");
    expect(loaded.coach.length).toBeGreaterThan(0);
    expect(loaded.cast.labels.You).toMatch(/^p\d+$/);
  }
});

it("an unknown drill or a changed asset is refused", async () => {
  await expect(loadPreparedDrill("ally-99")).rejects.toThrow(/Unknown drill/);
  const board = async () => "{}", script = async () => "{}";
  await expect(loadPreparedDrill("ally-01", { boards: { "x/ally-01.json": board }, scripts: { "x/ally-01.json": script } })).rejects.toThrow(/do not match/);
});
