import { expect, it } from "vitest";
import { statsOverview } from "./stats-overview";
import type { ArchiveRow } from "./match-archive";

const row = (n: number, outcome: ArchiveRow["outcome"], map = "World"): ArchiveRow =>
  ({ key: `k${n}`, recordings: [], map, mode: "FFA", startedAt: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`, outcome });

it("counts the record and streaks in date order; Incomplete breaks a streak", () => {
  const rows = [row(1, "Win"), row(2, "Win"), row(3, "Incomplete"), row(4, "Eliminated"), row(5, "Win")].reverse();
  expect(statsOverview(Object.freeze(rows))).toMatchObject({ wins: 3, eliminated: 1, incomplete: 1, currentWinStreak: 1, bestWinStreak: 2 });
  expect(statsOverview([row(1, "Win"), row(2, "Incomplete"), row(3, "Win")])).toMatchObject({ currentWinStreak: 1, bestWinStreak: 1 });
});

it("ranks maps by win rate over finished games only, needing three, tying by count then name", () => {
  const rows = [
    row(1, "Win", "Alps"), row(2, "Win", "Alps"), row(3, "Eliminated", "Alps"), row(4, "Incomplete", "Alps"),
    row(5, "Win", "Baltic"), row(6, "Win", "Baltic"), row(7, "Eliminated", "Baltic"),
    row(8, "Win", "World"), row(9, "Eliminated", "World"), row(10, "Eliminated", "World"), row(11, "Eliminated", "World"),
    row(12, "Win", "Mars"), row(13, "Win", "Mars"),
  ];
  const o = statsOverview(rows);
  expect(o.bestMap).toBe("Alps"); expect(o.worstMap).toBe("World");
  const few = statsOverview([row(1, "Win"), row(2, "Win")]); expect(few.bestMap).toBeUndefined(); expect(few.worstMap).toBeUndefined();
  expect(statsOverview([])).toEqual({ wins: 0, eliminated: 0, incomplete: 0, currentWinStreak: 0, bestWinStreak: 0 });
});
