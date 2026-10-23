import type { SelfState } from "@flashfront/core";

/** Observation history belongs to the HUD, so folding a panel does not reset it. */
export class BuildIdleTracker {
  private tracking?: { gameId: string; cost?: number; since: number | null; last: number };
  observe(self: SelfState | null, gameId: string, elapsedSec: number): number {
    const city = self?.buildings.find(b => b.type === "City");
    const affordable = !!self && !!city && self.gold >= city.nextCost;
    const previous = this.tracking;
    if (!previous || previous.gameId !== gameId || previous.cost !== city?.nextCost || elapsedSec < previous.last || affordable !== (previous.since !== null)) {
      this.tracking = { gameId, cost: city?.nextCost, since: affordable ? elapsedSec : null, last: elapsedSec };
    } else previous.last = elapsedSec;
    const since = this.tracking!.since;
    return since === null ? 0 : Math.max(0, elapsedSec - since);
  }
}
