import { useRef } from "react";
import { atGrowthCap, formatDuration, PRACTICE_GOALS, type GameSnapshot, type GoalProgress } from "@flashfront/core";

/** Game seconds spent at or over 70% of max this match, from the player's own numbers. */
function useTimeOver70(snapshot?: GameSnapshot): number | undefined {
  const state = useRef({ game: "", t: -1, over: 0 });
  if (!snapshot?.self || !(snapshot.self.maxTroops > 0)) return undefined;
  const s = state.current; const t = snapshot.elapsedSec;
  if (s.game !== snapshot.gameId || t < s.t) { state.current = { game: snapshot.gameId, t, over: 0 }; return 0; }
  if (t > s.t && s.t >= 0 && t - s.t <= 5 && snapshot.phase === "playing" && atGrowthCap(snapshot.self.troops / snapshot.self.maxTroops)) s.over += t - s.t;
  s.t = t;
  return s.over;
}
/** A goal is done when nothing left in the match can change it. */
export const goalComplete = (goal?: GoalProgress) => goal?.status === "hit" || (goal?.id === "port180" && goal.status === "miss");
/** Progress, never a mid-match verdict: "70% cap: 2:38 over", "Port by 3:00 · 1:12 left". */
function progress(goal: GoalProgress, elapsedSec: number | undefined, over: number | undefined): { text: string; tone: string } {
  if (goal.status === "unknown") return { text: "Not enough observations", tone: "muted" };
  if (goal.id === "under70") {
    if (goal.status === "hit") return { text: "Under 70% all match", tone: "gain" };
    if (goal.status === "miss" || (over ?? 0) > 0) return { text: over === undefined ? "70% cap: went over" : `70% cap: ${formatDuration(over)} over`, tone: "warning" };
    return { text: "Under 70% so far", tone: "muted" };
  }
  if (goal.id === "port180") {
    if (goal.status === "hit") return { text: "Port built", tone: "gain" };
    if (goal.status === "miss") return { text: "No port by 3:00", tone: "warning" };
    return { text: elapsedSec === undefined ? "Port by 3:00" : `Port by 3:00 · ${formatDuration(Math.max(0, 180 - elapsedSec))} left`, tone: "muted" };
  }
  if (goal.status === "hit") return { text: "35% kept after every push", tone: "gain" };
  if (goal.status === "miss") return { text: "A push left under 35%", tone: "warning" };
  return { text: "No push under 35% so far", tone: "muted" };
}
export function GoalPanel({ goal, snapshot }: { goal?: GoalProgress; snapshot?: GameSnapshot }) {
  const over = useTimeOver70(snapshot);
  if (!goal) return <p className="muted">Pick one practice goal in Matches for your next match.</p>;
  const line = progress(goal, snapshot?.elapsedSec, over);
  return <div className="goal-strip"><strong>{PRACTICE_GOALS[goal.id]}</strong><small className={line.tone}>{line.text}</small></div>;
}
