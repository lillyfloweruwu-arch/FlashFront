// Finds the prepared drill closest to a reviewed moment (sub-plan F Task 6): same mistake type, most shared
// tags, then catalogue order. Tags come only from what the player's own recording observed.
import type { Sample } from "../recorder";
import type { MistakeType } from "../review/moments";
import type { PreparedDrill } from "./drills";

export function closestPreparedDrill(mistake: MistakeType, tags: readonly string[], catalog: readonly PreparedDrill[]): PreparedDrill | undefined {
  const sameType = catalog.filter((d) => d.mistake === mistake);
  const overlap = (d: PreparedDrill) => d.tags.filter((t) => tags.includes(t)).length;
  return sameType.reduce<PreparedDrill | undefined>((best, d) => (!best || overlap(d) > overlap(best) ? d : best), undefined);
}

const OPENING_SEC = 180;
/** Tags the own samples at the moment support; anything unobserved contributes no tag. */
export function momentTags(moment: { tick: number; t: number }, samples: readonly Sample[]): string[] {
  const tags: string[] = [];
  if (moment.t < OPENING_SEC) tags.push("opening");
  const at = [...samples].reverse().find((s) => s.tick <= moment.tick && moment.tick - s.tick <= 100);
  if (at && at.maxTroops > 0) {
    const fraction = at.troops / at.maxTroops;
    if (fraction < 0.3) tags.push("lowReserve");
    if (fraction > 0.8) tags.push("highReserve");
  }
  if (at && at.incoming > 0) tags.push("underAttack");
  return tags;
}
