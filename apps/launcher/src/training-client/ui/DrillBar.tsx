import type { PreparedDrill } from "@flashfront/core";
export function drillGoal(drill: PreparedDrill): string {
  const check = drill.check;
  if (check.kind === "send") return `Send ${check.minSendPct}–${check.maxSendPct}% and keep at least ${check.minReservePct}% in reserve.`;
  if (check.kind === "post") return "Build a defense post at the approach before the attack.";
  return `${check.decision === "accept" ? "Accept" : check.decision === "decline" ? "Decline" : "Request"} the alliance before time runs out.`;
}
export function DrillBar({ drill, tick, deadlineTick }: { drill: PreparedDrill; tick?: number; deadlineTick?: number }) {
  const seconds = tick !== undefined && deadlineTick !== undefined ? Math.max(0, Math.ceil((deadlineTick - tick) / 10)) : undefined;
  const countdown = seconds === undefined ? "Unavailable" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <header className="ff-drill-bar"><span className="ff-drill-tag">Drill</span><div className="ff-glass ff-drill-description"><h1>{drill.title}</h1><p>{drillGoal(drill)}</p></div><time className="ff-glass ff-drill-clock" aria-label={`Time remaining: ${countdown}`}>{countdown}</time></header>;
}
