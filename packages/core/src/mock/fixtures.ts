import type { BuildingType, MatchSummary, PlayerProfile } from "../types";
import { seededRandom } from "./random";

export const buildingTypes: BuildingType[] = ["City", "Port", "DefensePost", "MissileSilo", "SAMLauncher", "Factory"];
export const maps = ["Dyslexdria", "World", "Europe", "Archipelago"];
export function makeHistory(seed: number): { profile: PlayerProfile; matches: MatchSummary[] } {
  const random = seededRandom(seed ^ 0x12345678);
  let elo = 1120;
  const eloHistory = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10),
    elo: elo += Math.floor(random() * 45) - 12,
  }));
  const matches: MatchSummary[] = Array.from({ length: 20 }, (_, i) => {
    const won = i % 4 === 0;
    const durationSec = 700 + Math.floor(random() * 800);
    const peakTilesPct = won ? 80 + random() * 8 : 8 + random() * 35;
    const peakTroops = Math.round(350_000 + random() * 1_800_000);
    const timeline = Array.from({ length: 61 }, (_, n) => {
      const progress = n / 60;
      const growth = Math.max(0, progress - Math.sin(progress * 18) * 0.04);
      return { t: Math.round(progress * durationSec), tilesPct: Math.min(peakTilesPct, peakTilesPct * growth), troops: Math.round(Math.min(1, growth) * peakTroops), gold: Math.round(progress * 200_000 * (0.7 + random() * 0.3)) };
    });
    return {
      gameId: `mock-${seed}-${i + 1}`, map: maps[i % maps.length]!, mode: i % 3 ? "Ranked" : "FFA",
      startedAt: new Date(Date.UTC(2026, 9, 15 - i, 18)).toISOString(), durationSec,
      placement: won ? 1 : 2 + Math.floor(random() * 20), playerCount: 40, won,
      peakTilesPct, peakTroops, timeline,
      buildings: { City: 8, Port: 4, DefensePost: 6, MissileSilo: 1, SAMLauncher: 3, Factory: 4 },
      eloDelta: won ? 24 : -8 - Math.floor(random() * 12),
    };
  });
  return { profile: { publicId: "self", name: "Ember", clanTag: "FF", rankedElo: elo, rankedTier: "Platinum II", gamesPlayed: 30, wins: 9, eloHistory }, matches };
}
