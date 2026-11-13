/** Synthetic review fixtures for tests: no real players, role labels only. */
import { MatchRecorder, mapToSnapshot, type GameReview, type RawExtract, type RecordedMatch } from "@flashfront/core";

export function syntheticMatch(): RecordedMatch {
  const recorder = new MatchRecorder();
  const raw: RawExtract = { inGame: true, visible: true, tick: 0, gameId: "synthetic", game: { map: "World" }, me: { troops: 800000, maxTroops: 1000000 } };
  recorder.consume(raw, mapToSnapshot(raw));
  const match = recorder.finish()!;
  return { ...match, durationSec: 600, events: [...match.events,
    { kind: "nudge", t: 200, nudgeKind: "exposed", outcome: "ignored" },
    { kind: "nudge", t: 250, nudgeKind: "noPosts", outcome: "cleared" }] };
}
const push = (id: string, t: number, label?: GameReview["pushes"][number]["label"]): GameReview["pushes"][number] =>
  ({ id, startTick: t * 10, endTick: t * 10 + 50, t, target: null, targetKind: "wilderness", boat: false, sends: 1, sent: 1000, rated: label !== undefined, label });
export function syntheticReview(overrides: Partial<GameReview> = {}): GameReview {
  return {
    gameId: "synthetic",
    accuracy: { value: 71, base: 70, rated: 6, goodOrGreat: 4, neutral: 1, opening: 0, defense: 1 },
    counts: { great: 1, good: 3, neutral: 1, costly: 1, blunder: 0 },
    pushes: [push("p1", 30, "great"), push("p2", 60, "good"), push("p3", 90, "good"), push("p4", 120, "good"), push("p5", 150, "neutral"), push("p6", 370, "costly"), push("p7", 420)],
    waves: [], allies: [], opening: { applicable: false },
    keyMoments: [{ tick: 4900, t: 370, kind: "push", mistake: "sendSize", label: "costly", landLostPct: 18, text: "6:10 push left too little home." }],
    mistakes: { sendSize: 1, postsBeforePush: 0, allyDecision: 0 },
    coverage: { ratedPushes: 6, totalPushes: 7, idsVerified: true },
    ...overrides,
  };
}
