import { expect, it } from "vitest";
import { personalBests, reviewMode, recordedLandPct } from "./bests";
import { MatchRecorder } from "./recorder";

function fixture() {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null);
  const m = r.finish()!; delete m.endedAtSec; return m;
}
it("keeps personal bests separate for FFA, teams and ranked, including rankedType", () => {
  const m = fixture();
  const matches = [
    { ...m, mode: "FFA", durationSec: 600, summary: { ...m.summary, bestRank: 4, peakLandPct: 12 }, samples: [{ t: 600, tick: 6000, tradeGoldTotal: 400 }] },
    { ...m, mode: "Teams", durationSec: 900, summary: { ...m.summary, bestRank: 2, peakLandPct: 30 }, samples: [{ t: 900, tick: 9000, tradeGoldTotal: 800 }] },
    { ...m, mode: "FFA", rankedType: "1v1", durationSec: 300, summary: { ...m.summary, bestRank: 1, peakLandPct: 60 }, samples: [{ t: 300, tick: 3000, tradeGoldTotal: 200 }] },
  ] as unknown as Parameters<typeof personalBests>[0];
  expect(personalBests(matches)).toEqual({
    FFA: { bestRank: 4, maxLandPct: 12, longestSec: 600, maxTradeGold: 400 },
    Teams: { bestRank: 2, maxLandPct: 30, longestSec: 900, maxTradeGold: 800 },
    Ranked: { bestRank: 1, maxLandPct: 60, longestSec: 300, maxTradeGold: 200 },
  });
  expect(reviewMode({ mode: "Team" })).toBe("Teams");
});
it("does not invent land percentages or trade income in legacy recordings", () => {
  const m = fixture(); m.mode = "FFA"; m.durationSec = 100; m.outcome = "eliminated"; m.endedAtSec = 40;
  expect(personalBests([m]).FFA).toEqual({ longestSec: 40 });
  expect(personalBests([])).toEqual({ FFA: {}, Teams: {}, Ranked: {} });
  expect(recordedLandPct(m)).toBeUndefined();
  expect(recordedLandPct({ ...m, summary: { ...m.summary, peakLandPct: 105 } })).toBeUndefined();
});
