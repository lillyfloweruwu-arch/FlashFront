import { GameUpdateType } from "../../../../vendor/openfront/packages/engine-api/src/game/GameUpdates";
import { expect, it } from "vitest";
import { newRunner, parseStart, expandTurns, type Turn } from "../../../../packages/training-engine/src/upstream";
import { onionMap } from "../../../../packages/training-engine/src/fixtures/maps";
import synthetic from "../../../../packages/training-engine/src/fixtures/synthetic-record.json";
import { reviewSeed } from "./review-seed";
it("seeds the exact snapshot tick without advancing the engine", async () => {
  const runner = await newRunner(parseStart(synthetic.info)!, onionMap(), () => {}, () => {});
  for (const turn of expandTurns(synthetic.turns as Turn[], synthetic.info.num_turns).slice(0, 300)) { runner.addTurn(turn); runner.executeNextTick(); }
  const before = runner.snapshot(synthetic.gitCommit);
  const update = reviewSeed(runner);
  expect(update.tick).toBe(300);
  expect(update.updates[GameUpdateType.Player]).toHaveLength(runner.game.players().length);
  expect(runner.snapshot(synthetic.gitCommit)).toEqual(before);
});




