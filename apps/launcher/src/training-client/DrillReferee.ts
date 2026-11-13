import { judgeDrill, type DrillEvidence } from "../../../../packages/core/src/training/judge";
import type { DrillClientData } from "../../../../packages/training-engine/src/drill-client-data";
import type { TrainingServer, StampedIntent } from "./TrainingServer";
import { evidenceFor, type IntentContext } from "./evidence";

export type RefereeEvent =
  | { kind: "wrong"; evidence: DrillEvidence; held: StampedIntent | null }
  | { kind: "correct"; evidence: DrillEvidence };

export class DrillReferee {
  private decided = false;
  private held: StampedIntent | null = null;

  constructor(
    private readonly data: DrillClientData,
    private readonly server: TrainingServer,
    ctx: () => IntentContext,
    private readonly onEvent: (event: RefereeEvent) => void,
  ) {
    server.onPlayerIntent = intent => {
      if (this.decided) return "forward";
      const context = ctx();
      if (context.tick < data.window.openTick || context.tick > data.window.deadlineTick) return "forward";
      const evidence = evidenceFor(intent, data.check, context);
      if (evidence === null) return "forward";
      this.decided = true;
      if (judgeDrill(data.check, evidence) === "correct") {
        this.onEvent({ kind: "correct", evidence });
        return "forward";
      }
      this.held = intent;
      server.pause();
      this.onEvent({ kind: "wrong", evidence, held: intent });
      return "hold";
    };
  }

  onTurn(tick: number): void {
    if (this.decided || tick <= this.data.window.deadlineTick) return;
    this.decided = true;
    this.server.pause();
    this.onEvent({ kind: "wrong", evidence: { observedUntilTick: tick }, held: null });
  }

  keepPlaying(): void {
    this.decided = true;
    if (this.held !== null) this.server.release(this.held);
    this.held = null;
    this.server.resume();
  }

  /** Called after restoring the starting snapshot, not as an undo of a running turn. */
  reset(): void {
    this.decided = false;
    this.held = null;
  }
}
