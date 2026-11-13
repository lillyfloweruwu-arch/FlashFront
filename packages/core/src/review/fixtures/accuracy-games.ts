import { attack, rec, match, samples } from "../testHelpers";

// Synthetic games: these demonstrate formula weights, not observed player performance.
const ticks = [500, 1300, 2100, 2900];
export const accuracyGames = [
  {
    name: "balanced",
    record: rec([
      ...ticks.map(tick => attack(tick, null, 10_000)),
      { kind: "build", tick: 1000, by: "OWNCLI00", unit: "Port" },
      { kind: "build", tick: 2300, by: "OWNCLI00", unit: "Defense Post" },
      attack(2500, "own00000", 10_000, "OTHERCLI"),
    ]),
    recording: match(samples(0, 3600, tick => ({
      tiles: 1000 + 100 * [550, 1350, 2150].filter(at => tick >= at).length,
      allianceCount: tick >= 1500 ? 1 : 0,
    }))),
  },
  {
    name: "costly",
    record: rec([
      ...ticks.map(tick => attack(tick, null, 400_000)),
      ...ticks.map(tick => attack(tick, "own00000", 10_000, "OTHERCLI")),
    ]),
    recording: match(samples(0, 3600, tick => ({
      tiles: 1000 - 100 * [550, 1350, 2150, 2950].filter(at => tick >= at).length,
      allianceCount: 0,
    }))),
  },
];
