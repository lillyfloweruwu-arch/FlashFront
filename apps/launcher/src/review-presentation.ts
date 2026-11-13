import { coachLine, roleLabel, type CoachRole, type GameReview, type KeyMoment, type MistakeType, type PushLabel } from "@flashfront/core";
import type { TrainingRequest } from "./shared";

export function retryRequest(file: string, moment: KeyMoment): TrainingRequest | undefined {
  if (!moment.mistake) {
    return undefined;
  }
  return {
    kind: "retry",
    file,
    tick: moment.tick,
    mistake: moment.mistake,
  };
}

/** The key moment that cost the most land; `retryable` limits it to moments Training can replay. */
export function worstMoment(review: GameReview, retryable = false): KeyMoment | undefined {
  const moments = retryable ? review.keyMoments.filter(m => m.mistake) : review.keyMoments;
  return moments.reduce<KeyMoment | undefined>((max, m) => (!max || m.landLostPct > max.landLostPct ? m : max), undefined);
}

export function reviewHeadline(review: GameReview): string {
  if (!review.keyMoments || review.keyMoments.length === 0) {
    return "No clear costly moment in these observations.";
  }

  const largest = worstMoment(review)!;

  const totalSeconds = Math.max(0, Math.floor(largest.t));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return `Head coach: at ${formattedTime}, land fell ${largest.landLostPct}%`;
}


export const LABEL_NAMES: Record<PushLabel, string> = { great: "Great", good: "Good", neutral: "Neutral", costly: "Costly", blunder: "Blunder" };

const ROLE_FOR: Record<MistakeType, CoachRole> = { sendSize: "Attack", postsBeforePush: "Defense", allyDecision: "Head" };
const clock = (t: number) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
let lastCoachLineId: string | undefined;

/** The role coach's line for the costliest retryable moment: observed time and land first, then advice.
 * Each display picks the next variant; without a retryable moment there is no line (the headline stays). */
export function reviewCoachLine(review: GameReview, previousId: string | undefined = lastCoachLineId): { id: string; text: string } | undefined {
  const moment = worstMoment(review, true);
  if (!moment?.mistake) return undefined;
  const role = ROLE_FOR[moment.mistake];
  const line = coachLine(role, moment.mistake, { landLostPct: moment.landLostPct }, previousId);
  lastCoachLineId = line.id;
  return { id: line.id, text: `At ${clock(moment.t)}, land fell ${moment.landLostPct}%. ${roleLabel(role)}: ${line.text}` };
}
