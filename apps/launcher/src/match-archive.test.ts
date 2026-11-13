import { expect, it } from "vitest";
import { joinArchive } from "./match-archive";
import { recentGames } from "./stats";
import type { MatchListItem } from "./main/recorder";
const local = (file: string, gameId?: string, outcome?: MatchListItem["outcome"]): MatchListItem => ({ file, gameId, outcome, map: "Local map", mode: "FFA", startedAt: "2026-10-24T12:00:00Z", durationSec: 400, finalRank: 1, sparkline: [] });
it("joins only IDs, preserves duplicates and missing values, and never guesses wins from rank", () => {
  const games = recentGames({ results: [{ gameId: "game", map: "Public map", result: "won" }, { gameId: "game" }, {}] }).games.map(value => Object.freeze(value));
  const recordings = [local("one", "game", "eliminated"), local("two", "game"), local("three"), local("four", "lost", "eliminated")].map(value => Object.freeze(value));
  const rows = joinArchive(Object.freeze(games), Object.freeze(recordings), new Map());
  expect(rows).toHaveLength(4);
  expect(rows.find(r => r.gameId === "game")).toMatchObject({ map: "Public map", outcome: "Win", recordings: [recordings[0], recordings[1]] });
  expect(rows.find(r => r.gameId === "lost")?.outcome).toBe("Eliminated");
  expect(rows.find(r => r.recordings[0]?.file === "three")?.outcome).toBe("Incomplete");
  const anonymous = rows.find(r => !r.recordings.length)!; expect(anonymous.durationSec).toBeUndefined(); expect(anonymous.rank).toBeUndefined(); expect(anonymous.review).toBeUndefined();
});
it("uses known local outcome for unknown public result and prefers newest ready review", () => {
  const games = recentGames({ results: [{ gameId: "game", result: "unknown" }] }).games;
  const recordings = [local("older", "game", "eliminated"), { ...local("newer", "game"), startedAt: "2026-10-25T12:00:00Z" }];
  const ready = { status: "ready" as const, review: {} as import("@flashfront/core").GameReview };
  expect(joinArchive(games, recordings, new Map<string, import("./shared").ReviewResult>([["older", ready], ["newer", { status: "waiting" }]]))[0]).toMatchObject({ outcome: "Eliminated", review: ready });
});
it("keeps anonymous page entries isolated and orders dated rows then stable keys", () => {
  const anonymous = recentGames({ results: [{}, {}] }).games;
  const rows = joinArchive([...anonymous.map((g, i) => ({ ...g, sourceKey: `page1:${i}` })), ...anonymous.map((g, i) => ({ ...g, sourceKey: `page2:${i}` }))], [local("b"), local("a")], new Map());
  expect(rows).toHaveLength(6); expect(rows.slice(0, 2).map(r => r.key)).toEqual(["local:a", "local:b"]);
  expect(new Set(rows.map(r => r.key)).size).toBe(6);
});
