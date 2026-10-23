import type { GameSnapshot } from "./types";

/**
 * OpenFront v0.35.2 combat constants (packages/engine/src/configuration/EngineConfig.ts), unchanged
 * since v0.34.25. Used only to explain how attacks resolve; FlashFront never sees the defender.
 */
export const COMBAT_RULES = {
  /** Defender troops per attacking troop at or below which the attacker's losses stop shrinking. */
  cheapestTroopRatio: 0.6,
  /** Retreating from a player kills 25% of the troops still alive; wilderness attacks retreat free. */
  retreatLoss: 0.25,
  /** Tiles inside a defense post's range (30) defend 5x harder. */
  defensePostBonus: 5,
  defensePostRange: 30,
  /** A traitor (broke an alliance) defends at half strength for 30 s. */
  traitorDefense: 0.5,
  traitorSeconds: 30,
} as const;

export interface PushResult {
  /** Own troops that left (troop drops when the outgoing-attack count rose, growth added back). */
  sent: number;
  tilesGained: number;
  /** Own land % gained (0 when unknown). */
  landGainedPct: number;
  durationSec: number;
  endedAtTick: number;
  /** Sent troops per tile gained; Infinity when no land was gained. */
  troopsPerTile: number;
  verdict: "good" | "costly" | "failed";
  overlapped: boolean;
  gaps: boolean;
}

interface Open { startTick: number; startTiles: number; startPct: number; sent: number; overlapped: boolean; gaps: boolean }

/**
 * Follows the player's OWN attacks from their own numbers only: troops, tiles and the outgoing
 * attack count. A push opens when the count rises from 0 and closes when it returns to 0.
 */
export class PushTracker {
  private game?: string;
  private prev?: { tick: number; troops: number; tiles: number; pct: number; outgoing: number; growth: number; incoming: boolean };
  private open?: Open;
  private last?: PushResult;

  observe(snapshot: GameSnapshot): PushResult | undefined {
    if (snapshot.gameId !== this.game || snapshot.tick < (this.prev?.tick ?? -1)) { this.game = snapshot.gameId; this.prev = undefined; this.open = undefined; this.last = undefined; }
    const me = snapshot.self;
    if (snapshot.mode === "Ranked" || snapshot.observer || snapshot.phase !== "playing") { this.prev = undefined; this.open = undefined; this.last = undefined; return; }
    if (!me || me.outgoingAttacks === undefined || snapshot.ticksPerSecond <= 0) { if (this.open) this.open.gaps = true; return this.last; }
    const now = { tick: snapshot.tick, troops: me.troops, tiles: me.tilesOwned, pct: me.tilesOwnedPct, outgoing: me.outgoingAttacks, growth: me.troopGrowthPerSec, incoming: me.incomingAttacks.length > 0 };
    const p = this.prev;
    if (p && now.tick > p.tick) {
      const seconds = (now.tick - p.tick) / snapshot.ticksPerSecond;
      if (now.outgoing > p.outgoing) {
        const sent = Math.max(0, p.troops + Math.max(0, p.growth) * seconds - now.troops);
        if (this.open) this.open.overlapped = true;
        this.open ??= { startTick: p.tick, startTiles: p.tiles, startPct: p.pct, sent: 0, overlapped: p.outgoing > 0 || now.outgoing > 1, gaps: false };
        this.open.sent += sent;
      }
      if (this.open) { this.open.overlapped ||= p.incoming || now.incoming; this.open.gaps ||= seconds > 2; }
      if (this.open && now.outgoing === 0) {
        const o = this.open; this.open = undefined;
        const tilesGained = now.tiles - o.startTiles;
        const durationSec = (now.tick - o.startTick) / snapshot.ticksPerSecond;
        if (o.sent > 0) this.last = { sent: o.sent, tilesGained, landGainedPct: o.startPct > 0 || now.pct > 0 ? now.pct - o.startPct : 0,
          durationSec, endedAtTick: now.tick, troopsPerTile: tilesGained > 0 ? o.sent / tilesGained : Infinity,
          verdict: pushVerdict(o.sent, tilesGained, me.maxTroops), overlapped: o.overlapped, gaps: o.gaps };
      }
    }
    this.prev = now;
    return this.last;
  }
}

/**
 * failed: no land. costly: a push of at least 10% of max that paid over 600 internal troops per tile.
 * Calibrated 2026-10-18 on 358 own pushes from 25 recorded matches: median 46, 90th percentile 655.
 */
export function pushVerdict(sent: number, tilesGained: number, maxTroops: number): PushResult["verdict"] {
  if (tilesGained <= 0) return "failed";
  if (maxTroops > 0 && sent >= maxTroops * 0.1 && sent / tilesGained > 600) return "costly";
  return "good";
}

/** Likely reasons a push went badly, phrased as possibilities (FlashFront cannot see the defender). */
export function pushReasons(result: PushResult): string[] {
  if (result.verdict === "good") return [];
  return ["Low yield. Common causes: a strong defender, a defense post or rough terrain."];
}
