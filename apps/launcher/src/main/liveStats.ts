import type { RecordedMatch, RecordedResult } from "@flashfront/core";
/** Session-only counters; incomplete recordings never become invented losses. */
export class LiveStats {
  private last?: RecordedResult;
  private ended = -Infinity;
  readonly session = { wins: 0, losses: 0 };
  constructor(private readonly now: () => number = Date.now) {}
  finish(match: RecordedMatch) {
    this.last = { recordedBy: match.recordedBy, map: match.map, mode: match.mode, durationSec: match.durationSec, summary: match.summary, outcome: match.outcome }; this.ended = this.now();
    if (match.outcome === "won" || match.outcome === "win") this.session.wins++;
    if (match.outcome === "eliminated" || match.outcome === "loss") this.session.losses++;
  }
  frame() { return { result: this.now() - this.ended < 60_000 ? this.last : undefined, session: { ...this.session } }; }
}
