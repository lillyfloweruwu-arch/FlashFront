import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DrillStore } from "../../../main/drills";
it("a week of daily picks survives restarts and never repeats", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "ff-flow-")), "training-progress.json");
  const start = new Date(2026, 10, 1, 9).getTime();
  const seen: string[] = [];
  for (let d = 0; d < 7; d++) {
    const store = new DrillStore(path, () => start + d * 24 * 3600_000);
    const pick = (await store.today())!;
    expect((await new DrillStore(path, () => start + d * 24 * 3600_000 + 60_000).today())?.drillId).toBe(pick.drillId);
    seen.push(pick.drillId);
  }
  expect(new Set(seen).size).toBe(7);
});


