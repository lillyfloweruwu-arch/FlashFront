// Feedback for an exact-moment retry (sub-plan F Task 5), derived only from C's review of the simulated
// branch. Missing evidence stays "unavailable"; it never becomes a success because nothing was rated.
import type { RecordedMatch } from "../recorder";
import type { MistakeType } from "../review/moments";
import type { ReviewRecord } from "../review/record";
import { gameReview, type GameReview } from "../review/review";
import type { CoachRole } from "../nudge-lines";
import { coachLine, roleLabel } from "./coach-lines";

export type RetryVerdict = "improved" | "needsPractice" | "unavailable";
const ROLE: Record<MistakeType, CoachRole> = { sendSize: "Attack", postsBeforePush: "Defense", allyDecision: "Head" };
const UNAVAILABLE: Record<MistakeType, string> = {
  sendSize: "No send in this retry had a full minute of evidence, so it isn't rated.",
  postsBeforePush: "No attack reached you in this retry, so post timing can't be judged.",
  allyDecision: "An ally decision needs two minutes of play to judge, and a retry shows at most one, so it isn't rated.",
};

export function retryFeedback(trace: { match: RecordedMatch; record: ReviewRecord }, reserveFloorPct: number, mistake: MistakeType): { review: GameReview; verdict: RetryVerdict; line: string } {
  const review = gameReview(trace.record, trace.match, { reserveFloorPct });
  const from = trace.match.samples[0]?.tick ?? 0;
  let verdict: RetryVerdict = "unavailable";
  if (mistake === "sendSize") {
    const rated = review.pushes.filter((p) => p.startTick >= from && p.label);
    if (rated.some((p) => p.label === "costly" || p.label === "blunder")) verdict = "needsPractice";
    else if (rated.some((p) => p.label === "good" || p.label === "great")) verdict = "improved";
  } else if (mistake === "postsBeforePush") {
    const waves = review.waves.filter((w) => w.startTick >= from && w.rated);
    if (waves.some((w) => w.post !== "onTime")) verdict = "needsPractice";
    else if (waves.length > 0) verdict = "improved";
  }
  // C rates an ally decision on what follows for 120 s; a 30–60 s retry can never show that, so it stays unavailable.
  const role = ROLE[mistake];
  const worst = review.pushes.find((p) => p.startTick >= from && p.label && p.blamedLandLostPct !== undefined);
  const text = verdict === "unavailable" ? UNAVAILABLE[mistake]
    : coachLine(role, mistake, { sentPct: worst?.sendShare !== undefined ? worst.sendShare * 100 : undefined, reservePct: worst?.fractionAfter !== undefined ? worst.fractionAfter * 100 : undefined, landLostPct: worst?.blamedLandLostPct }).text;
  return { review, verdict, line: `${roleLabel(role)}: ${text}` };
}
