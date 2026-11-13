import { buildCost, TICKS_PER_SECOND } from "./mechanics";
import { ownNameMatches } from "./identity";
import type { RawExtract } from "./raw";
import type { BuildingCount, BuildingType, GameSnapshot } from "./types";

const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const optionalNumber = (value: unknown): number | undefined => value !== undefined && value !== null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
function compact(text: string): number {
  const match = text.replaceAll(",", "").trim().match(/^([\d.]+)\s*([KMB])?$/i);
  return match ? number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() ?? ""] ?? 1) : 0;
}
// gameConfig values: gameMode "Free For All" | "Team"; gameType "Singleplayer" | "Public" | "Private".
// Ranked is a Public game with rankedType set (v0.35: "1v1" | "2v2" | "ffa" | "clanwars"); there is no
// "Ranked" gameType (the old check is kept for recorded matches only).
function gameMode(game: RawExtract["game"]): GameSnapshot["mode"] {
  if (game?.rankedType || game?.type === "Ranked") return "Ranked";
  if (game?.type === "Private") return "Custom";
  return /team/i.test(game?.mode ?? "") ? "Teams" : "FFA";
}
export function mapToSnapshot(raw: RawExtract, prev?: GameSnapshot | null): GameSnapshot | null {
  if (!raw.inGame) return null;
  const tick = number(raw.tick);
  const restricted = gameMode(raw.game) === "Ranked" || raw.replay;
  const me = raw.me;
  const continuous = !!prev && tick >= prev.tick && (!raw.gameId || raw.gameId === prev.gameId);
  const gameId = raw.gameId ?? (continuous ? prev.gameId : prev ? `${prev.gameId}:next:${tick}` : "cdp-1");
  const ownRow = raw.leaderboard?.find(row => row.isMe || (me && ownNameMatches(row.name, me)));
  const counts: [BuildingType, number | undefined][] = me ? [
    ["City", me.cityLevels], ["Port", me.portLevels], ["Factory", me.factoryLevels],
    ["DefensePost", me.defensePosts], ["SAMLauncher", me.samLaunchers], ["MissileSilo", me.silos],
  ] : [];
  const buildings: BuildingCount[] = counts.flatMap(([type, count]) => {
    if (count === undefined || !Number.isFinite(count) || count < 0) return [];
    const shared = type === "Port" || type === "Factory";
    if (shared && (me?.portLevels === undefined || me.factoryLevels === undefined)) return [];
    return [{ type, count, nextCost: buildCost(type, shared ? number(me?.portLevels) + number(me?.factoryLevels) : count) }];
  });
  // Income rate from total gold EARNED (spending never lowers it), averaged over ~15 s because trade
  // gold arrives in lumps. Measuring current gold made the planner show only passive income while the
  // player kept building (live bug 2026-10-17: "City in 9:36" at ~19K/s real income).
  let goldPerSec = continuous ? number(prev.self?.goldPerSec) : 0;
  if (continuous && prev.self && tick > prev.tick) {
    const earnedNow = optionalNumber(me?.goldEarned); const earnedBefore = prev.self.goldEarned;
    const delta = earnedNow !== undefined && earnedBefore !== undefined ? earnedNow - earnedBefore
      : me?.gold !== undefined ? number(me.gold) - prev.self.gold : -1;
    if (delta >= 0) {
      const seconds = (tick - prev.tick) / TICKS_PER_SECOND;
      const rate = delta / seconds;
      const alpha = 1 - Math.exp(-seconds / 15);
      goldPerSec = goldPerSec === 0 ? rate : goldPerSec + alpha * (rate - goldPerSec);
    }
  }
  return {
    gameId, map: raw.game?.map ?? "Unknown", mode: gameMode(raw.game), tick, ticksPerSecond: TICKS_PER_SECOND,
    mapSize: raw.game?.mapSize === "Compact" || raw.game?.mapSize === "Normal" ? raw.game.mapSize : undefined,
    elapsedSec: tick / TICKS_PER_SECOND, winTargetPct: 80,
    phase: raw.gameOver ? "ended" : raw.inSpawnPhase ? "spawn" : "playing",
    ...(raw.inSpawnPhase === true && !raw.gameOver && !raw.replay && gameMode(raw.game) !== "Ranked" && raw.spawnHeat ? { spawnHeat: raw.spawnHeat } : {}),
    ...(raw.replay ? { observer: "replay" as const } : me?.alive === false && !raw.gameOver && !raw.inSpawnPhase ? { observer: "spectating" as const } : {}),
    ...(raw.game?.cheats ? { cheats: true } : {}),
    self: me ? {
      id: "self", troops: number(me.troops), maxTroops: number(me.maxTroops),
      troopGrowthPerSec: number(me.troopRatePerTick) * TICKS_PER_SECOND,
      gold: number(me.gold), goldPerSec, attackRatio: Math.min(1, number(me.attackRatio)),
      goldEarned: optionalNumber(me.goldEarned), tradeGold: optionalNumber(me.tradeGold),
      trainGold: optionalNumber(me.trainGold), piracyGold: optionalNumber(me.piracyGold), readyMissiles: optionalNumber(me.readyMissiles),
      cityLevels: number(me.cityLevels), portLevels: number(me.portLevels), factoryLevels: number(me.factoryLevels),
      defensePosts: number(me.defensePosts), samLaunchers: number(me.samLaunchers),
      incomingAttacks: me.incoming ?? [], tilesOwned: number(me.tiles),
      ...(me.outgoingCount !== undefined ? { outgoingAttacks: me.outgoingCount } : {}),
      tilesOwnedPct: number(ownRow?.landPct) || (number(raw.landTiles) > 0 ? number(me.tiles) / number(raw.landTiles) * 100 : 0),
      rank: number(ownRow?.rank), buildings,
      ...(!restricted && me.allianceRequests?.length ? { allianceRequests: me.allianceRequests.map(request => {
        const stripTag = (name: string) => name.replace(/^\[[^\]]+\]\s+/, "");
        const rows = (raw.leaderboard ?? []).filter(row => stripTag(row.name) === stripTag(request.name));
        return { from: request.from, name: request.name, atWar: request.atWar,
          ...(rows.length === 1 && Number.isFinite(rows[0]!.landPct) ? { landPct: rows[0]!.landPct } : {}) };
      }) } : {}),
      alliances: (me.alliances ?? []).map(a => ({ with: a.with, ...(!restricted && a.name !== undefined ? { name: a.name } : {}), ...(a.renewRequested ? { renewRequested: true } : {}), expiresAtTick: a.expiresInTicks === undefined ? undefined : tick + number(a.expiresInTicks),
        formedAtTick: continuous ? prev.self?.alliances.find(old => old.with === a.with)?.formedAtTick ?? tick : tick })),
    } : null,
    players: (raw.leaderboard ?? []).map(row => ({
      id: row === ownRow ? "self" : `visible:${row.name}`, name: row.name, color: "#6B9AC4",
      isAlive: row === ownRow ? me?.alive !== false : true, tilesOwnedPct: row.landPct,
      troops: compact(row.troops) * 10, gold: compact(row.gold),
    })), events: [],
  };
}
