import { secondsToAfford } from "./mechanics";
import { spotsFor } from "./spawn";
import type { BuildingType, SelfState } from "./types";
import { atGrowthCap } from "./attack";

/** One renderer's current-game choice only; never saved or sent to the game. */
export class BuildPin {
  private game?: string;
  private time = -1;
  private type?: BuildingType;
  get(gameId: string, elapsedSec: number): BuildingType | undefined {
    if (this.game !== gameId || elapsedSec < this.time) this.type = undefined;
    this.game = gameId; this.time = elapsedSec;
    return this.type;
  }
  set(gameId: string, elapsedSec: number, type: BuildingType) {
    this.get(gameId, elapsedSec); this.type = type;
  }
  clear() { this.type = undefined; }
}
export const buildPin = new BuildPin();

/**
 * v0.35 smallEconomySpawnBoost (packages/engine/src/configuration/EngineConfig.ts, PR #5907): a
 * player's first port and factory levels spawn trade ships and trains faster. 1.5x at 1 level down
 * to 1.02x at 5, none from 6. Trade-ship odds use the square (the pity timer square-roots them).
 */
export function economyBoost(levels: number): number {
  return levels <= 0 ? 1 : 1 + 0.5 * Math.min(1, Math.max(0, (6 - levels) / 5)) / levels;
}
/** Spawn-rate gain from building one more level: trade ships for ports, trains for factories. */
export function nextLevelBoost(type: "Port" | "Factory", levels: number): number {
  const boost = economyBoost(levels + 1);
  return type === "Port" ? boost * boost : boost;
}

export interface NextBuild { type: BuildingType; count: number; nextCost: number; seconds: number; reason: string; progress?: number }

/**
 * City when troops sit near the cap (max is the constraint). Otherwise the boosted early economy
 * levels first: the first Port (ocean maps), the first Factory, then the second of each. Otherwise
 * the cheapest affordable City/Port/Factory. Port and Factory share one price ladder.
 */
export function nextBuild(self: SelfState | null, map: string, pinned?: BuildingType): NextBuild | undefined {
  if (!self) return undefined;
  const find = (type: string) => self.buildings.find(b => b.type === type);
  const hasOcean = spotsFor(map)?.hasOcean === true;
  const nearCap = self.maxTroops > 0 && atGrowthCap(self.troops / self.maxTroops);
  const pick = (type: BuildingType, reason: string) => {
    const b = find(type);
    return b ? { ...b, seconds: secondsToAfford(self.gold, self.goldPerSec, b.nextCost), reason } : undefined;
  };
  const boosted = (type: "Port" | "Factory", levels: number) =>
    `${nextLevelBoost(type, levels).toFixed(2)}× ${type === "Port" ? "trade ships" : "trains"}`;
  if (pinned) {
    const selected = pick(pinned, "pinned");
    return selected ? { ...selected, progress: selected.nextCost > 0 ? Math.min(1, Math.max(0, self.gold / selected.nextCost)) : 1 } : undefined;
  }
  if (nearCap) return pick("City", "+25K max · troops near cap");
  for (const step of [0, 1]) {
    if (hasOcean && self.portLevels === step) return pick("Port", boosted("Port", step));
    if (self.factoryLevels === step) return pick("Factory", boosted("Factory", step));
  }
  const cheapest = self.buildings.filter(b => (b.type === "City" || b.type === "Factory" || (b.type === "Port" && hasOcean)) && b.nextCost <= self.gold)
    .sort((a, b) => a.nextCost - b.nextCost)[0];
  return cheapest ? pick(cheapest.type as "City" | "Port" | "Factory", cheapest.type === "City" ? "+25K max" : "cheapest now") : undefined;
}
