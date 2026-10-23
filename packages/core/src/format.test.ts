import { expect, it } from "vitest";
import { formatDuration, formatGold, formatPct, formatRate, formatTroopRate, formatTroops, renderNumber } from "./format";

// Port of OpenFront v0.34.25 src/client/Utils.ts renderNumber: truncates, never rounds up.
it.each([[0, "0"], [632.6, "632"], [1234, "1.23K"], [3600, "3.60K"], [12345, "12.3K"], [15_299, "15.2K"], [146_999, "146K"],
  [999_999, "999K"], [2_500_000, "2.50M"], [12_345_678, "12.3M"], [1_234_567_890, "1.23B"], [-5, "0"], [NaN, "0"], [Infinity, "0"]])
  ("renderNumber %s", (input, expected) => expect(renderNumber(input as number)).toBe(expected));
it("formatGold matches the game", () => { expect(formatGold(902_000)).toBe("902K"); expect(formatGold(42_800)).toBe("42.8K"); });
it.each([[0, "0:00"], [725, "12:05"], [-725, "-12:05"], [1_000_000, "16666:40"], [NaN, "0:00"]])("duration %s", (n, expected) => expect(formatDuration(n as number)).toBe(expected));
it.each([[0, "0%"], [12.34, "12.3%"], [-12.3, "-12.3%"], [1_000_000, "1000000%"], [NaN, "0%"]])("percent %s", (n, expected) => expect(formatPct(n as number)).toBe(expected));
it.each([[0, "0/s"], [1200, "+1.2K/s"], [-1200, "-1.2K/s"], [2_000_000, "+2M/s"], [NaN, "0/s"]])("rate %s", (n, expected) => expect(formatRate(n as number)).toBe(expected));

it.each([[123_450, "12.3K"], [3_070_000, "307K"], [6_326, "632"], [146_020, "14.6K"], [0, "0"], [NaN, "0"]])("troops %s display like the game (/10)", (n, expected) => expect(formatTroops(n as number)).toBe(expected));
it.each([[27_800, "+2.78K/s"], [3_900, "+390/s"], [8_879.7, "+887/s"], [0, "0/s"]])("troop rate %s like the game", (n, expected) => expect(formatTroopRate(n as number)).toBe(expected));
