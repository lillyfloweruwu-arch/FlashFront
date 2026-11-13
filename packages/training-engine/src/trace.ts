// Turns a simulated branch into the same shapes C's Game Review reads. Kept in memory only:
// a trace never enters the match recorder or the disk archive.
import { parseGameRecord, RULES_VERSION, stableZone, sweetSpotFraction, TICKS_PER_SECOND } from "@flashfront/core";
import type { RecordedMatch, Sample, TroopZone } from "@flashfront/core";
import type { TrainingTrace } from "./contracts";

export interface Observation { tick: number; troops: number; maxTroops: number; gold: number; tiles: number; landTiles: number; alliances: number; incoming: number; outgoing: number; alive: boolean }
export interface RawRecord { gitCommit: string; info: { config: { gameMap: string; gameMode: string }; num_turns: number } & Record<string, unknown>; turns: unknown[] }

/** Own samples from the branch start; `t` counts seconds from the start tick, so the first is 0. */
export function samplesFrom(observations: readonly Observation[], startTick: number): Sample[] {
  let zone: TroopZone | undefined;
  return observations.filter((o) => o.tick >= startTick).map((o) => {
    const fraction = o.maxTroops > 0 ? o.troops / o.maxTroops : 0;
    zone = stableZone(zone, fraction, sweetSpotFraction(o.maxTroops));
    return {
      t: (o.tick - startTick) / TICKS_PER_SECOND, tick: o.tick, troops: o.troops, maxTroops: o.maxTroops, gold: o.gold, tiles: o.tiles,
      attackRatio: 0, zone, incoming: o.incoming, outgoingCount: o.outgoing, allianceCount: o.alliances,
      tilesOwnedPct: o.landTiles > 0 ? (o.tiles / o.landTiles) * 100 : 0,
    };
  });
}

export function buildTrace(raw: RawRecord, ownClientId: string, branchTurns: readonly unknown[], observations: readonly Observation[], startTick: number, endTick: number): TrainingTrace {
  // Before the start only spawns matter (they fix player ids); older moves belong to the original game.
  const turns = branchTurns.map((t) => {
    const turn = t as { turnNumber: number; intents: { type: string }[] };
    return turn.turnNumber < startTick ? { ...turn, intents: turn.intents.filter((i) => i.type === "spawn") } : turn;
  });
  const record = parseGameRecord({ gitCommit: raw.gitCommit, info: { ...raw.info, num_turns: branchTurns.length }, turns });
  if (!record) throw new Error("branch record did not normalize");
  const samples = samplesFrom(observations, startTick);
  const zones: Record<TroopZone, number> = { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 };
  for (let i = 1; i < samples.length; i++) zones[samples[i - 1]!.zone] += samples[i]!.t - samples[i - 1]!.t;
  const last = observations.at(-1);
  const durationSec = (endTick - startTick) / TICKS_PER_SECOND;
  const match: RecordedMatch = {
    version: 1, recordedBy: "FlashFront", rulesVersion: RULES_VERSION, gameVersion: raw.gitCommit,
    map: raw.info.config.gameMap, mode: raw.info.config.gameMode,
    startedAt: new Date(0).toISOString(), endedAt: new Date(durationSec * 1000).toISOString(), durationSec,
    me: { clientId: ownClientId }, samples, events: [],
    summary: {
      peakTroops: Math.max(0, ...samples.map((s) => s.troops)), peakTiles: Math.max(0, ...samples.map((s) => s.tiles)),
      timeInZone: zones, pushes: 0, exposedPushes: 0, idleGoldSeconds: 0,
    },
    outcome: last && !last.alive ? "eliminated" : "unknown",
    endedAtSec: durationSec,
  };
  return { match, record };
}
