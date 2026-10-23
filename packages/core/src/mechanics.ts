import type { BuildingType, SelfState } from "./types";

// Formulas re-checked against v0.35.2 source on 2026-10-17: unchanged from v0.34.25.
export const RULES_VERSION = "0.35.2";
// OpenFront v0.34.25 src/core/configuration/Config.ts: simulation tick rate.
export const TICKS_PER_SECOND = 10;
// OpenFront v0.34.25 src/core/configuration/Config.ts: human base gold income.
export const GOLD_PER_TICK = 100;
const MAX_TICKS = 36_000;

// OpenFront v0.34.25 src/core/configuration/Config.ts: troop growth per tick.
export function troopGrowthPerTick(troops: number, max: number): number {
  if (!Number.isFinite(troops) || !Number.isFinite(max) || max <= 0 || troops >= max) return 0;
  troops = Math.max(0, troops);
  return Math.max(0, (10 + troops ** 0.73 / 4) * (1 - troops / max));
}
// OpenFront v0.34.25 src/core/configuration/Config.ts: growth converted to seconds.
export const troopGrowthPerSec = (troops: number, max: number): number => troopGrowthPerTick(troops, max) * TICKS_PER_SECOND;
// OpenFront v0.34.25 src/core/configuration/Config.ts: territory and city capacity.
export const maxTroops = (tilesOwned: number, cityLevelSum: number): number =>
  2 * (tilesOwned ** 0.6 * 1000 + 50_000) + 250_000 * cityLevelSum;

// OpenFront v0.34.25 src/core/configuration/Config.ts: integrate growth at each tick.
export function simulateTroops(troops: number, max: number, seconds: number): number {
  if (!Number.isFinite(troops) || !Number.isFinite(max) || max <= 0) return 0;
  let current = Math.max(0, Math.min(troops, max));
  const ticks = Number.isNaN(seconds) ? 0 : Math.min(MAX_TICKS, Math.max(0, Math.floor(seconds * TICKS_PER_SECOND)));
  for (let tick = 0; tick < ticks; tick++) current = Math.min(max, current + troopGrowthPerTick(current, max));
  return current;
}
// OpenFront v0.34.25 src/core/configuration/Config.ts: tick integration to a fixed troop target.
export function secondsToReachTroops(troops: number, max: number, target: number): number {
  if (![troops, max, target].every(Number.isFinite)) return Infinity;
  if (troops >= target) return 0;
  if (max <= 0 || target >= max) return Infinity;
  let current = Math.max(0, troops);
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    current = Math.min(max, current + troopGrowthPerTick(current, max));
    if (current >= target) return tick / TICKS_PER_SECOND;
  }
  return Infinity;
}
const sweetSpots = new Map<number, number>();
// OpenFront v0.34.25 src/core/configuration/Config.ts: numerically maximize its growth formula.
export function sweetSpotFraction(max: number): number {
  const key = Number.isFinite(max) ? Math.max(0, Math.round(max)) : 0;
  const cached = sweetSpots.get(key);
  if (cached !== undefined) return cached;
  let left = 0.01; let right = 0.99;
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 48; i++) {
    const a = right - ratio * (right - left); const b = left + ratio * (right - left);
    if (troopGrowthPerTick(a * key, key) >= troopGrowthPerTick(b * key, key)) right = b;
    else left = a;
  }
  const result = (left + right) / 2;
  sweetSpots.set(key, result);
  return result;
}

// OpenFront v0.34.25 src/core/configuration/Config.ts: owned is levels (City, shared Port/Factory), otherwise count.
export function buildCost(type: BuildingType, owned: number): number {
  switch (type) {
    case "City": case "Port": case "Factory": return Math.min(1_000_000, 125_000 * 2 ** owned);
    case "DefensePost": return Math.min(250_000, 50_000 * (owned + 1));
    case "SAMLauncher": return owned === 0 ? 1_500_000 : 3_000_000;
    case "MissileSilo": return 1_000_000;
  }
}
export type UnitType = "Warship" | "AtomBomb" | "HydrogenBomb" | "MIRV";
// OpenFront v0.34.25 src/core/configuration/Config.ts: MIRV counter is launches this game.
export function unitCost(type: UnitType, count = 0): number {
  switch (type) {
    case "Warship": return Math.min(1_000_000, 250_000 * (count + 1));
    case "AtomBomb": return 750_000;
    case "HydrogenBomb": return 5_000_000;
    case "MIRV": return 25_000_000 + 15_000_000 * count;
  }
}
// Constant-rate arithmetic for a supplied rate; expenses and future trades are not predicted.
export function secondsToReach(current: number, target: number, ratePerSec: number): number {
  if (![current, target, ratePerSec].every(Number.isFinite)) return Infinity;
  if (current >= target) return 0;
  return ratePerSec > 0 ? (target - current) / ratePerSec : Infinity;
}
// Income projection uses the caller's visible gold rate.
export const secondsToAfford = (gold: number, goldPerSec: number, cost: number): number => secondsToReach(gold, cost, goldPerSec);
// OpenFront v0.34.25 src/core/configuration/Config.ts: fixed-capacity projection, excluding combat.
export const projectedTroopsAt = (self: SelfState, secondsAhead: number): number => simulateTroops(self.troops, self.maxTroops, secondsAhead);
