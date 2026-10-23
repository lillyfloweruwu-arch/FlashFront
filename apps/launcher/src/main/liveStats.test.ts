import { expect, it } from "vitest";
import { MatchRecorder } from "@flashfront/core";
import { LiveStats } from "./liveStats";
it("shows the last result for exactly 60 seconds and counts only known session outcomes", () => {
  let now = 0; const live = new LiveStats(() => now); const r = new MatchRecorder();
  r.consume({ inGame: true, visible: true }, null); const m = r.finish()!;
  live.finish(m); expect(live.frame().session).toEqual({ wins: 0, losses: 0 });
  live.finish({ ...m, outcome: "win" }); live.finish({ ...m, outcome: "loss" });
  now = 59_999; expect(live.frame().result).toBeDefined();
  now = 60_000; expect(live.frame()).toEqual({ result: undefined, session: { wins: 1, losses: 1 } });
  expect(new LiveStats().session).toEqual({ wins: 0, losses: 0 });
});
