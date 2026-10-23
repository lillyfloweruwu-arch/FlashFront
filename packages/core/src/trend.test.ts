import { expect, it } from "vitest";
import { matchTrend, recordingCoverage } from "./trend";
import { MatchRecorder } from "./recorder";
function fixture(durationSec: number) {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null);
  const m = r.finish()!;
  return { ...m, type: "Public", durationSec, endedAtSec: durationSec, summary: { ...m.summary,
    idleGoldSeconds: durationSec / 4, timeInZone: { ...m.summary.timeInZone, wasting: durationSec / 2 } } };
}
it("normalizes time metrics per minute so longer matches do not inflate them", () => {
  for (const seconds of [60, 600]) expect(matchTrend([fixture(seconds)]).current).toMatchObject({ idleGold: { value: 15 }, over70: { value: 30 } });
  expect(matchTrend([fixture(0)]).current.idleGold).toEqual({ value: undefined, count: 0 });
});
it("filters by mode and map before taking the recent windows", () => {
  const m = fixture(60);
  const matches = [{ ...m, mode: "FFA", map: "World" }, { ...m, mode: "Teams", map: "World" },
    { ...m, mode: "FFA", rankedType: "1v1", map: "World" }, { ...m, mode: "FFA", map: "Europe" }];
  expect(matchTrend(matches, undefined, { mode: "FFA", map: "World" }).current.count).toBe(1);
  expect(matchTrend(matches, undefined, { mode: "Ranked" }).current.count).toBe(1);
  expect(matchTrend([...matches, { ...m, type: "Singleplayer" }]).current.count).toBe(4);
});
it("reports sample coverage without counting long gaps or the unobserved opening", () => {
  const m = fixture(100);
  m.endedAtSec = 200;
  m.samples = [0, 5, 10, 90, 100].map(t => ({ t, tick: (100 + t) * 10 })) as typeof m.samples;
  expect(recordingCoverage(m)).toBe(0.1);
  expect(matchTrend([m]).current.coverage.value).toBe(0.1);
  expect(recordingCoverage({ ...m, samples: [] })).toBeUndefined();
});
