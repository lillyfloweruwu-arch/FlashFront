# Vendored OpenFront engine and client

Copied unmodified by `tools/training/vendor.ts` from https://github.com/openfrontio/OpenFrontIO at tag `v0.35.4`, commit `14ba82badb1e945ef2e758999238339404fdb788`.
Records from v0.35.3 (`a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7`) also replay: their engine and map files are byte-identical.
Only the engine's import closure is included. Code is AGPL-3.0 (see LICENSE, including its Section 7 terms);
`resources/` data is CC BY-SA 4.0 (see LICENSE-ASSETS, resources/LICENSE, CREDITS.md). Package manifests are
regenerated with exact dependency versions. © OpenFront and Contributors.

## Client

`client/` holds OpenFront's game client at the same pin, mirroring upstream paths (for example
`client/src/client/ClientGameRunner.ts`), with `client-manifest.json` hashing every file. Training runs drills on it.
Entries: `src/client/ClientGameRunner.ts`, `src/client/GameStartingModal.ts`, `src/client/LangSelector.ts`, `src/client/components/baseComponents/Button.ts`, `src/client/components/baseComponents/Modal.ts`, `src/client/styles.css`, `src/client/styles/core/typography.css`, `src/client/styles/core/variables.css`, `packages/shared/src/EventBus.ts`, `packages/shared/src/SharedUtil.ts`.
The scan follows imports and stylesheet `@import`/`url()`; engine files already under `packages/` are referenced, not copied twice.
Runtime assets (images, sprites, atlases, fonts the client fetches by URL) come from `assetUrl("images|sprites|atlases|fonts/...")`
literals in the closure plus `resources/atlases/msdf-atlas.json`, `resources/flags/uk_us_flag.svg`. Sounds, other flags and everything under
`proprietary/` (All Rights Reserved) are not vendored; the manifest's `missing` list names assets that exist only there.
FlashFront replaces four upstream modules through build-time redirects; each replacement is a copy with the upstream AGPL header plus a
FlashFront note, and the upstream originals stay vendored unmodified:
- `src/client/LocalServer.ts`: the singleplayer game server, replaced by a drill server that serves the recorded turns.
- `src/client/WorkerClient.ts`: the main-thread side of the game worker, replaced by one that restores a snapshot.
- `packages/engine/src/worker/Worker.worker.ts`: the worker that runs the engine, replaced by the Training worker.
- `src/client/Auth.ts`: sign-in and token refresh, stubbed so the client never makes its refresh call.

## FlashFront Training client entry

The replacements live in `apps/launcher/src/training-client/`. `TrainingServer.ts`,
`SnapshotWorkerClient.ts` and `SnapshotWorker.worker.ts` port the R2 snapshot spike;
the worker retains its full-board seed (owned tiles, units and SpawnPhaseEnd) and removes timing logs.
`AuthStub.ts` preserves Auth's exports while returning a signed-out state. The originals above remain unmodified.
The redirect plugin is installed only in the renderer build and matches Training's `?fftraining`
module instances under `client/`. Other renderer inputs retain the originals; the engine graph is
unchanged. Worker queries, including `?worker&inline`, are preserved.

No fifth ClientGameRunner redirect is needed: `joinLobby` mounts the upstream HUD, whose `build-menu`
element publicly exposes the same `TransformHandler` that `createRenderer` installs. The bridge calls
its `worldToScreenCoordinates(new Cell(x, y))`; `control-panel.game` provides the live GameView and
`#webgl-debug-canvas` provides the rendered canvas. These references are exposed only while live.

Training imports game components rather than Main, installs its offline guard before upstream imports,
and disables Howler's load/play paths before starting a game. The page CSP also prohibits media and
off-origin connections. Only manifest-listed redistributable assets are copied. The absent proprietary
OpenFront font URL serves the launcher's Antonio font and OpenFrontLogo.svg serves an empty SVG.
Neither stand-in comes from proprietary/. The in-game markup in training.html is ported from the spike.

## Training window map URLs

`apps/launcher/src/training-client/TerrainMapFileLoader.ts` is a fifth Training-only replacement,
for `src/client/TerrainMapFileLoader.ts`. It retains upstream's terrain cache and uses
`fftraining://app/maps` as the `FetchGameMapLoader` base. `BOOTSTRAP_CONFIG.cdnBase` alone
does not cover maps: `buildAssetUrl` ignores the base for paths absent from the asset manifest.
The original stays unmodified. The scheme handler belongs only to `persist:training` and
serves map files only after the main-process loader has verified and unpacked them.

## Review replay extensions

The same Training replacements are used by the isolated `persist:review` WebContentsView.
`SnapshotWorkerClient.ts` sends FlashFront's `review_seed` message after installing the update
callback; `SnapshotWorker.worker.ts` uses `review-seed.ts` to publish the exact restored board,
including player names, tiles and units, without advancing a tick. `TrainingServer.ts` has a
read-only replay mode that never accepts player intents or advances the simulation. Original
upstream files remain unchanged. Entry-level `review.css` hides the upstream HUD while retaining
its live game references; only the map is visible.

Training lifecycle adapter: the build redirects GameRenderer's anonymous resize listener through renderer-lifecycle.ts so each stopped game releases its renderer and map. Vendored bytes stay unchanged; the pinned listener shape is checked during the build.

The same offline build adapter removes ClientGameRunner's delayed network watchdog. It is unnecessary for the local transport, and otherwise starts a new interval after a restarted game has already stopped.

BuildPreviewController and AttackingTroopsController frame requests are redirected through the lifecycle adapter, which cancels both recursive animation loops at teardown. Heap snapshots identified them retaining stopped game buffers.

RadialMenu's dynamically appended menu and tooltip are removed at teardown. WorkerClient timers (including its 60-second initialization timeout) are tracked and canceled when the offline game stops. These adapters are build-time changes; pinned vendor source bytes remain intact.
