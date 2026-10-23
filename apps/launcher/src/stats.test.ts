import { expect, it } from "vitest";
import { profileFromApi, profileStats, recentGames } from "./stats";
it("reads real public profile, string counts, clan, mode ladders and paginated games", () => {
  const body = { username: "Own name", clans: [{ tag: "FF" }], stats: { Public: { total: "10", wins: "2" }, Ranked: { "1v1": { total: "3", wins: "1" } }, recent: { total: "13", wins: "3" } } };
  expect(profileStats(body)).toEqual([{ type: "Public", games: 10, wins: 2 }, { type: "Ranked · 1v1", games: 3, wins: 1 }]);
  expect(profileFromApi("OWN12345", body, [{ "1v1": [{ public_id: "OWN12345", elo: 1400, rank: 15 }] }])).toMatchObject({ name: "Own name", clanTag: "FF", rankedElo: 1400, rankedTier: "1v1 · #15", gamesPlayed: 13, wins: 3 });
  expect(recentGames({ results: [{ gameId: "game123", durationSeconds: 400, result: "victory", map: "World" }], nextCursor: "opaque+=" })).toMatchObject({ cursor: "opaque+=", games: [{ id: "game123", duration: 400, result: "victory", map: "World" }] });
  expect(profileFromApi("OWN12345", {}, [])).not.toHaveProperty("rankedElo", 0);
});
