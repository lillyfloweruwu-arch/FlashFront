// SPDX-License-Identifier: AGPL-3.0-only
// Copyright OpenFront and Contributors. FlashFront: bridge-owned snapshot, copied per worker transfer.
import type { ClientID, GameStartInfo } from "../../../../vendor/openfront/packages/engine-api/src/Schemas";
import { WorkerClient as UpstreamWorkerClient } from "../../../../vendor/openfront/client/src/client/WorkerClient";
import type { ErrorUpdate, GameUpdateViewData } from "../../../../vendor/openfront/packages/engine-api/src/game/GameUpdates";
import { snapshotFor, sessionFor, type TrainingSession } from "./session";
export { createGameWorker } from "../../../../vendor/openfront/client/src/client/WorkerClient";

export class WorkerClient extends UpstreamWorkerClient {
  private trainingSession: TrainingSession;
  constructor(gameStartInfo: GameStartInfo, clientID: ClientID | undefined, snapshot?: Uint8Array) {
    super(gameStartInfo, clientID, snapshot ? snapshot.slice() : snapshotFor(gameStartInfo.gameID));
    this.trainingSession = sessionFor(gameStartInfo.gameID);
  }
  start(gameUpdate: (update: GameUpdateViewData | ErrorUpdate) => void): void {
    super.start(gameUpdate);
    // Upstream keeps this transport private; this adapter owns the additional offline view message.
    if (this.trainingSession.mode === "replay") (this as unknown as { worker: Worker }).worker.postMessage({ type: "review_seed" });
    const started = this.trainingSession.onRunnerStarted;
    this.trainingSession.onRunnerStarted = undefined;
    started?.();
  }
}

