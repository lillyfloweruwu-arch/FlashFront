import type { RecordedMatch, Sample } from "../recorder";
import type { RecordIntent, ReviewRecord } from "./record";

export const attack = (tick: number, target: string | null, troops: number | null, by = "OWNCLI00"): RecordIntent => ({ kind: "attack", tick, target, troops, by });
export const rec = (intents: RecordIntent[] = []): ReviewRecord => ({
  gameId: "review01", gitCommit: "fixture", map: "World", mode: "FFA", durationTicks: 10_000, alliancesEnabled: true, idsVerified: true,
  players: [{ clientId: "OWNCLI00", playerId: "own00000", name: "Player 1" }, { clientId: "OTHERCLI", playerId: "human002", name: "Player 2" }],
  intents: [...intents].sort((a, b) => a.tick - b.tick),
});
export const sample = (tick: number, overrides: Partial<Sample> = {}): Sample => ({
  t: tick / 10, tick, troops: 600_000, maxTroops: 1_000_000, gold: 100_000, tiles: 1000,
  attackRatio: 0.2, zone: "sweet", incoming: 0, outgoingCount: 0, ...overrides,
});
export const samples = (start = 0, end = 3000, change: (tick: number) => Partial<Sample> = () => ({})): Sample[] =>
  Array.from({ length: Math.floor((end - start) / 50) + 1 }, (_, i) => sample(start + i * 50, change(start + i * 50)));
export const match = (ownSamples = samples(), overrides: Partial<RecordedMatch> = {}): RecordedMatch => ({
  version: 1, recordedBy: "FlashFront", rulesVersion: "fixture", gameId: "review01", map: "World", mode: "FFA",
  startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:10:00Z", durationSec: 600,
  me: { clientId: "OWNCLI00" }, samples: ownSamples, events: [], outcome: "unknown",
  summary: { peakTroops: 600_000, peakTiles: 1000, timeInZone: { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 }, pushes: 0, exposedPushes: 0, idleGoldSeconds: 0 },
  ...overrides,
});
