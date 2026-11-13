import type { GameRunner } from "../../../../vendor/openfront/packages/engine/src/GameRunner";
import { placeName } from "../../../../vendor/openfront/packages/engine/src/game/NameBoxCalculator";
import type { PlayerImpl } from "../../../../vendor/openfront/packages/engine/src/game/PlayerImpl";
import type { GameUpdates } from "../../../../vendor/openfront/packages/engine-api/src/game/GameTypes";
import { GameUpdateType, type GameUpdateViewData } from "../../../../vendor/openfront/packages/engine-api/src/game/GameUpdates";

/** A full view of the restored state, with no simulated tick and no changed game state. */
export function reviewSeed(runner: GameRunner): GameUpdateViewData {
  const game = runner.game;
  const updates = Object.fromEntries(Object.values(GameUpdateType).filter(v => typeof v === "number").map(type => [type, []])) as unknown as GameUpdates;
  const playerNameViewData: NonNullable<GameUpdateViewData["playerNameViewData"]> = {};
  for (const player of game.players()) {
    const p = player as PlayerImpl;
    const sent = p.lastSentUpdate;
    p.lastSentUpdate = undefined;
    const full = p.toUpdate();
    p.lastSentUpdate = sent;
    if (full) updates[GameUpdateType.Player].push(full);
    for (const unit of p.units()) updates[GameUpdateType.Unit].push(unit.toUpdate());
    if (p.hasSpawned()) playerNameViewData[p.id()] = placeName(game, p);
  }
  if (!game.inSpawnPhase()) updates[GameUpdateType.SpawnPhaseEnd].push({ type: GameUpdateType.SpawnPhaseEnd, startTick: game.ticks() });
  const map = game.map(), pairs: number[] = [];
  map.forEachTile(tile => { const state = map.tileState(tile) & 0xffff; if (state) pairs.push(tile, state | (map.terrainByte(tile) << 16)); });
  return { tick: game.ticks(), updates, packedTileUpdates: new Uint32Array(pairs), playerNameViewData, pendingTurns: 0, tickExecutionDuration: 0 };
}

