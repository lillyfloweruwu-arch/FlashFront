# FlashFront

## [Download FlashFront for Windows](https://github.com/lillyfloweruwu-arch/FlashFront/releases/download/v0.3.2/FlashFront-Setup-0.3.2.exe)

**Windows 10/11 · Version 0.3.2 · Free**

Click the link above, then run the downloaded installer. Updating an existing installation keeps your settings; no uninstall needed.

[Release notes and other downloads](https://github.com/lillyfloweruwu-arch/FlashFront/releases/latest) · Linux download coming after validation.

A read-only OpenFront companion: a compact **HUD**, transparent **stream widgets**, a mock stats gallery, and an Electron **Steam launcher**. The launcher reads own-player state and rendered leaderboard rows through a restricted local CDP adapter. It draws the HUD in its own window and never sends game input.

## Brand redesign (v7)

FlashFront now uses the Front bolt mark, Flash neutrals and signature red, self-hosted Antonio
display type and Inter labels. The launcher has a 64px rail, Play / Matches / Profile / Themes /
Settings views, and a live HUD preview. The overlay uses content-sized 272px modules and disables
blur, shadows, animation and transitions. Its window mechanics and fair-play rules are unchanged.

Run `pnpm brand:icons` to regenerate the launcher PNG (512px) and ICO (16/32/48/256) from the
approved mark. `#/brand` documents the mark, palette, type scale and SVG icons.
See [DESIGN.md](DESIGN.md) and [the v7 build log](docs/BUILD-LOG-v7.md) for the finish review,
validation and remaining browser-review limitation.

Optional renderer-only browser review: start the gallery on port 5173 and the standalone launcher
renderer on port 5175, then run `node scripts/brand-review.mjs`. It supplies a mock bridge and never
starts the launcher main process, Steam or OpenFront. Override the renderer URL with
`FLASHFRONT_RENDERER_URL`; an existing test browser can be supplied with `FLASHFRONT_CDP_URL`.
Successful runs write screenshots to `test-results/v7/`; this environment could not start a
browser, so no UI screenshots are claimed for this build.

## Habit features (v5)

- Opening checklist for an ally, a city, and a port on ocean maps, with costs and estimated affordability. It closes when completed or at 5:00.
- Configurable 20–60% reserve floor (35% default), a safe maximum send percentage, and slider comparison alongside the exposed warning.
- Trade and train income over the last 60 observed game seconds, match income share, and a quiet reminder after a port has waited 60 seconds without income.
- Sorted alliance timers with 60-second and 15-second highlights, plus a pinned incoming-attack alarm at half your own troops.
- Local recording of income counters, committed troops, attack tempo, opening observations and trade share, with descriptive post-match coaching.
- Up to three optional practice suggestions in Matches. Select one for the next recording; its HUD strip shows progress and recent recordings show hit, miss or insufficient observations.

All panels can be hidden in edit mode. The gallery demonstrates the panels using mock counters and a sample practice goal. The research is correlation evidence, not a performance target.

## Themes and map presets (v6)

Open the launcher's **Themes** tab to compare four interactive sample gauges and attack previews. The sample-send sliders change the previews only. **Use this theme** saves the selection for the launcher, its separate HUD window and OBS widgets. The gallery's **Theme** toolbar picker offers the same four looks across HUD, stream and stats.

| Theme | FlashFront appearance | Matching optional map preset |
| --- | --- | --- |
| Front (`abyss`) | Flash neutrals and signature red | Ocean `#18384f`, background `#101e30`, default palette, ambient `0.55` |
| Daylight | Brighter graphite surfaces, light text | Ocean `#628fa8`, background `#456779`, default palette, ambient `1.0` |
| Ember | Warm charcoal surfaces, signature red | Ocean `#294657`, background `#1b2933`, sand `#e2bc79`, plains `#a99a55`, highland `#b87f46`, mountain `#eedac0`, default palette, ambient `0.7` |
| Signal | Near-black panels, white text, 1.15× type; gain `#56B4E9`, danger `#D55E00`, warning `#E69F00` | Built-in colorblind palette/relationship values, structure icon size `66` |

In Themes, expand **Map preset JSON** to inspect the exact output, then select **Copy map preset**. Import it yourself:

1. In OpenFront, open **Settings → Graphics**.
2. Select **Import settings JSON**.
3. Paste the copied JSON.
4. Select **Apply**.

Optional. Changes only your own map colors, using OpenFront's own settings. Signal also increases the official structure-icon size by 10%. The separate **Colorblind (game built-in)** option reproduces the game's original preset without that size change. Its affiliation colors are self `#0072b2`, ally `#56b4e9`, enemy `#d55e00`; friendly/embargo tints are `#0072b2`/`#d55e00`, both at `0.85`. Signal includes those same values. Terrain fields omitted by a preset use the game's defaults.

FlashFront copies JSON through Electron's clipboard. It does not import presets for you, write game settings/storage, alter the game's render, or include cosmetics overrides. Existing own-player extraction and rendered leaderboard access are unchanged.

OBS follows the saved theme unless its URL contains a valid override, for example `http://127.0.0.1:47474/obs?widgets=card,stats,top&theme=signal`. Supported IDs are `abyss`, `daylight`, `ember`, `signal`; invalid overrides fall back to the saved choice. The gallery OBS route accepts the same parameter.

Validation: `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build`. Optional browser checks of built FlashFront pages: `node scripts/themes-smoke.mjs` (Chrome; mock state only). See [the v6 build log](docs/BUILD-LOG-v6.md) for results and verification limits.

## Run

Use **Node 24** and **pnpm 11** (the workspace pins pnpm 11.20.0).

```sh
pnpm install --config.confirmModulesPurge=false
pnpm dev
```

Open **http://127.0.0.1:5173/**. Fonts ship from local `@fontsource` dependencies; no CDN or runtime external assets are used. Development and production assets are served from the same origin.

| Route | Surface |
| --- | --- |
| `#/` | Gallery landing page |
| `#/brand` | Approved mark, wordmark, palette roles, type scale and icon set |
| `#/hud` | Live mock game over original CSS terrain; seed/speed controls, game UI zone overlay |
| `#/hud?nofonts=1` | HUD with system font fallbacks and no font stylesheet |
| `#/hud?phase=spawn&map=World` | Persistent spawn preview; also Iceland, Europe and Four Islands; add `&size=Compact` |
| `#/stream` | All five widgets on a neutral preview background |
| `#/stream/obs?widgets=card,stats,top,lobby,result&scale=1&anchor=tl` | Transparent OBS browser source |
| `#/stats` | Profile, ELO history and sortable match history |
| `#/stats/match/mock-42-1` | Example match detail for the default seed |

For OBS, use a **1920 × 1080** browser source. Widget names are `card`, `stats`, `top`, `lobby`, `result`; anchors are `tl`, `tr`, `bl`, `br`. Unknown widgets are ignored; an empty widget list renders nothing. Scale defaults to 1 and is bounded to 0.25–3. Query parameters work after the hash, or before it when the hash has no query.

On the HUD, **Ctrl+Alt+H** shows/hides panels and **Ctrl+Alt+E** toggles edit mode. The gallery also has an **Edit HUD** button. Drag a panel by its handle (or focus the handle and use arrow keys), collapse it, show/hide it, or change its opacity. Troops/gold and the match clock are hidden by default because the game already shows them. Enable **Show game UI zones** to inspect the measured reserved areas. Positions snap to screen edges. Settings persist in `localStorage`; storage failure falls back to in-memory operation. The HUD is click-through outside edit controls. The HUD layer itself never intercepts pointer input.

## Package map

| Package | Contents |
| --- | --- |
| `packages/core` / `@flashfront/core` | Exact spec types, `DataSource`, deterministic mock source, formatters, v0.34.25 formulas and attack arithmetic |
| `packages/ui` / `@flashfront/ui` | HUD, stream and stats components; reusable SVG charts; `src/theme.css` tokens/styles and separate `src/fonts.css` local fonts |
| `apps/gallery` / `@flashfront/gallery` | Vite + React 19 + Tailwind CSS 4; small hash router and mock controls |
| `packages/cdp` / `@flashfront/cdp` | Node-only loopback discovery, allowlisted CDP client, fixed extraction and live data source |
| `apps/launcher` / `@flashfront/launcher` | Electron 44 + electron-vite + React; launcher, separate HUD window, global shortcuts and local OBS feed |
| `scripts/browser-smoke.mjs` | Optional Playwright browser checks and screenshots |
| `tools/spawn` / `@flashfront/spawn` | Offline public-map fetcher, scorer, PNG writer and validation tests |
| `packages/training-engine` / `@flashfront/training-engine` | Training-only adapter around the vendored OpenFront engine: typed contracts, worker client, exact board rebuild, branches and rewind |
| `vendor/openfront` | OpenFront engine source (tag v0.35.4, commit 14ba82badb1e945ef2e758999238339404fdb788; v0.35.3 records also replay), copied unmodified by `tools/training/vendor.ts` |

Workspace packages expose TypeScript source for Vite. Recursive builds emit JavaScript and declarations for core/UI and a deployable gallery in `apps/gallery/dist`. They are private workspace packages, not publishable distributions yet. Import `@flashfront/ui/theme.css` in a consuming app. Gallery, stream and stats routes load `@flashfront/ui/fonts.css` dynamically at the app boundary; HUD components do not import fonts. The nofonts route also removes a previously loaded font stylesheet when navigating from another surface.

## Future adapters

The v2 `CdpDataSource` implements the live game subscription. Its `subscribeStatus` and `subscribeRaw` streams report connection state, menus and visibility; `start()`/`stop()` own the polling lifecycle. Lobby/profile/match API methods still return empty results. The gallery continues using deterministic mock data.

Implement `DataSource` in `packages/core/src/datasource.ts` and supply it to the gallery's subscription/loading boundary in `apps/gallery/src/App.tsx`. UI components accept typed snapshots and records rather than depending on `MockDataSource`. Only the gallery's seed/speed controls use mock-specific methods.

`subscribeGame` immediately supplies the current snapshot and returns an unsubscribe function. The mock starts its timer for the first subscriber, stops it after the last unsubscribe, and returns detached snapshots so consumers cannot mutate the game. Its PRNG and history are seeded independently; history requests do not affect simulation randomness. The same seed at the same game tick produces the same state at any supported speed.

Adapters must supply only player-visible information and arithmetic on it. No fog-of-war data, hidden enemy information, automated actions, or game input belongs in this interface. `mechanics.ts` implements the formulas pinned by the v1 spec to OpenFront v0.34.25 (`RULES_VERSION`). Projections integrate at 10 ticks/s with fixed capacity, excluding future combat, construction and trades. Attack previews only calculate the visible ratio; they do not send or change it.

## Verification

Generate or refresh the pinned spawn assets with `pnpm spawn:build`, using the existing
ignored `tools/spawn/.cache/v0.34.25/` cache. Both the build and generator tests are
offline and fail if cached terrain is missing or corrupt. The 0.3.0 release includes
`FlashFront-0.3.0-map-inputs.tar.gz` for source builds (SHA-256
`e831719fc4ce4908dce933fcc3712c9bd1dce072bd0ecfa2268aa27e07f578b8`).
Extract it at the repository root to supply the versioned spawn caches and packed Training maps.
These are public OpenFront terrain assets under CC BY-SA 4.0; the Training build verifies
every decompressed map against the pinned manifest. `node scripts/prepare-ci-maps.mjs`
can fetch the spawn caches independently; `pnpm training:maps <checkout-at-the-manifest-commit>
apps/launcher/build/training-maps` rebuilds Training inputs from upstream source.
No scoring or map downloads occur during live matches.

Generated files: `packages/core/src/spawn/spots.json`, launcher minimap PNGs, four
gallery PNGs, adjacent `LICENSE-MAPDATA.md` files, and
[`docs/SPAWN-SPOTS-v0.34.25.md`](docs/SPAWN-SPOTS-v0.34.25.md).

Map data © OpenFront contributors, CC BY-SA 4.0

The generated scores and minimaps are derived works under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), based on
[OpenFront v0.34.25 maps](https://github.com/openfrontio/OpenFrontIO/tree/v0.34.25/resources/maps).
The adjacent license files describe the terrain scoring, resizing and recoloring.

```sh
pnpm install --config.confirmModulesPurge=false
pnpm spawn:build
pnpm -r typecheck
pnpm -r test
pnpm -r build
pnpm lint
```

The original v1 Vitest tests cover formulas and cost caps, numerical growth peaks, per-tick projection, attack thresholds/recovery, seeded simulation across speeds, the wasting-to-exposed arc, default rectangle exclusion, bundled-only spawn minimaps and otherwise URL-free HUD assets, font route switching, idle-gold timing/resets, layout visibility and persistence, and the existing stream/stats/formatting interactions. Gallery interaction tests use JSDOM and reduced-motion settings. `lint` runs strict TypeScript's unused-symbol and fallthrough checks; no separate style linter is installed.

With the dev server running and Chrome installed, optional real-browser verification is:

```sh
pnpm test:browser
```

It checks routes, HUD interactions, the v1 arc at 20x, 1080p zone collisions and panel content bounds, fallback/local fonts, mobile overflow, actual computed transparency, 1080p OBS fit, console errors, and external asset requests, then writes screenshots to ignored `test-results/`. `FLASHFRONT_URL` can select another server; `FLASHFRONT_CDP_URL` can connect to a dedicated test browser already running with debugging enabled.

See [docs/BUILD-LOG-v5.md](docs/BUILD-LOG-v5.md) for current verification outputs. Game and public API tests use fixtures and fakes; Steam and OpenFront are never launched during verification.

## Steam launcher

```sh
pnpm install --config.confirmModulesPurge=false
node apps/launcher/node_modules/electron/install.js
pnpm --dir apps/launcher dev
```

pnpm 11 blocks Electron's dependency postinstall. The launcher's own `postinstall` runs `node node_modules/electron/install.js`; the explicit root command above also works when dependency hooks were skipped. In a restricted environment where pnpm lifecycle subprocesses fail, install with `--ignore-scripts`, then run the installer explicitly. If its default cache is unwritable, set `electron_config_cache` to a writable cache directory. The noninteractive install flag avoids the modules-purge TTY prompt.

In Steam, open **Library → OpenFront → Properties → Launch Options** and enter:

```text
%command% --remote-debugging-port=9222
```

Restart OpenFront after changing the option. **Launch OpenFront** connects if the port already answers; otherwise it opens the official Steam game and waits up to 60 seconds before showing the setup guide. The guide is always reachable and has a copy button. Changing the debug port in FlashFront also changes the text to copy into Steam.

While this option is set, local programs can control the OpenFront window through **127.0.0.1:9222**. Remove it when not using FlashFront.

The HUD follows the game window once per second, hides in menus, when minimized or unfocused, and is click-through outside edit mode. **Ctrl+Alt+H** toggles it; **Ctrl+Alt+E** enters/leaves edit mode. Settings persist in Electron's user-data directory. Shortcut registration failures appear in the launcher. **F8 is reserved for Flash clipping and is rejected**, including modified combinations. The manual **Ranked mode: hide HUD** override takes precedence over edit mode; automatic ranked detection is not implemented.

OBS: add `http://127.0.0.1:47474/obs?widgets=card,stats,top,lobby,result&scale=1&anchor=tl` as a 1920 × 1080 browser source. The server binds only to 127.0.0.1 and pushes snapshots through `/ws`. Widget selection, scale and anchors match the gallery. PlayerCard shows the resolved public profile, clan and known ranked ELO, with confirmed session W/L from recordings completed since launcher startup. ResultCard shows the last recording's observed final rank, duration and peak land in tiles for 60 seconds, then hides. Unknown ELO delta is hidden. LobbyCard remains a placeholder.

## Local matches and public profile

The launcher has **Play**, **Matches**, and **Profile** tabs. Matches lists local recordings with troop sparklines; opening one shows troop percentage with exposed/wasting bands, push/incoming markers, land in tiles, and coaching notes. **Open folder** opens the recordings directory; **Export JSON** reveals the selected JSON in your file manager so you can copy or share it yourself. **Delete** removes only that validated recording.

Recordings live at Electron `app.getPath("userData")/matches` (normally `%APPDATA%/FlashFront/matches` on Windows; use Open folder for the actual path). Filenames are `<YYYY-MM-DD_HHmmss>_<map>_<gameId>.json`. They contain only your own numbers, own observed rank and inferred events—not other players' names, stats, alliances or raw snapshots. Nothing uploaded unless you send feedback. Samples use internal troop units and normally arrive every 50 game ticks (5 seconds), plus notable events. Matches end on menu/game-over, a changed game ID, tick rewind, or 30 seconds without data. Files are capped at 2 MB; the newest 200 FlashFront files are kept. Foreign files are ignored.

Enter the 8-character **Public ID** in Settings or Profile: the id in your profile URL `openfront.io/player/<id>`. Resolution uses that setting first, then your own extracted profile ID, then your own exact `clientID` in the public archive for a completed recording. Missing archives are retried at 30 seconds, 2 minutes and 10 minutes; resolved IDs are saved in settings. Profile shows games/wins by type, paginated recent games, and your ranked ELO if present on leaderboard pages 1–2. No cookies, tokens, login or name search are used.

The local server exposes these GET-only proxy routes:

| Local route | Upstream at `https://api.openfront.io` |
| --- | --- |
| `/api/player/:publicId` | `/public/player/:publicId` |
| `/api/player/:publicId/games?cursor=` | `/public/player/:publicId/games?cursor=` |
| `/api/game/:gameId` | `/public/game/:gameId?turns=false` |
| `/api/leaderboard/ranked?page=1` | `/leaderboard/ranked?page=1` |

IDs are validated (public IDs: 8 alphanumeric characters; game IDs: 6–16); leaderboard pages are 1–20. The shared in-memory cache honors upstream `max-age` with a 30-second minimum, coalesces identical pending requests, and limits all upstream request starts to one per second. Requests time out at 10 seconds, never follow redirects or forward caller credentials, preserve upstream status codes and return JSON 502 errors on network failure. The launcher renderer uses its restricted preload bridge to this same client. Public responses stay in memory; they are not added to recordings.

`pnpm --dir apps/launcher build` creates `apps/launcher/out/` with main, sandboxed preload, and renderer bundles. This is a runnable development build, not a packaged installer.

For a safe desktop smoke check, set `FLASHFRONT_SMOKE_TEST=1` before running the dev command. This substitutes a closed-port discovery fake and disables Steam launch, then checks our own window, preload bridge, setup guide, hidden overlay and OBS response before quitting. It never connects to OpenFront. In this sandbox Electron exits with a native crashpad error before these assertions; this check still needs a desktop-capable environment.

## Fair-play boundary

`ALLOWED_CDP_METHODS` contains only **Runtime.evaluate** and **Browser.getWindowForTarget**. Every outgoing JSON-RPC call checks the allowlist. Evaluation accepts only `EXTRACT_EXPRESSION`, return-by-value, and its strict/relaxed side-effect flag. It starts with `throwOnSideEffect: true`; only a side-effect EvalError permits retrying the identical expression with false. The active mode is logged once.

Discovery uses HTTP `/json/list` on the configured **127.0.0.1** port, rejects redirects and non-loopback websocket targets, and never navigates the game. No input events, bindings, script injection, CSP bypass, game edits or hidden player enumeration are permitted. Other-player rows come exclusively from rendered leaderboard DOM; `g.players()` and `g.playerViews()` are never called. The older screenshot probe is not used by the adapter.

## Decisions

- **Themes (v6):** keep IDs in core so settings and presets do not depend on React; visual token maps live in `packages/ui/src/themes.ts`. Apply a scoped stylesheet and `data-ff-theme` on each FlashFront document root before painting. Keep existing spacing, widths, panel coordinates and layout storage; theme changes do not remount HUD panels or reset their state. Expanded HUD panels reserve their existing maximum heights in every theme so their frames stay fixed when text grows; edit/collapse retains its content-driven sizing. Signal increases text tokens by 1.15; sample preview slots reserve room for the larger text. The gallery picker is session-only; launcher selection persists in its existing settings file. Older settings default to Abyss; explicit invalid IDs are rejected.
- **Preset schema (v6):** the standalone validator recognizes the full supplied official field list, including `cosmetics.flagOpacity` (0–1) and the two per-layer records. This permits meaningful schema conformance checks. The clipboard catalog independently excludes the entire `cosmetics` section and only accepts shipped preset IDs, so the schema validator is not a custom-settings editor. Reject unknown keys, wrong types, null/array sections and nonfinite numbers without coercion. Serialize recursively sorted keys with two-space indentation.
- **Preset choices (v6):** use only ocean/background and brightness for Abyss/Daylight, leaving land at game defaults; use explicit warm land colors and a blue ocean for Ember. The built-in colorblind values are field facts from the supplied `graphics-presets.json`, not copied implementation code. Signal uses icon size 66 (10% above the official default 60, verified in [OpenFront render-settings.json](https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/src/client/render/gl/render-settings.json) on 2026-10-16). No game files or settings are changed. The built-in Colorblind option is an extra map-preset entry, not a fifth FlashFront theme.
- **Preview and delivery (v6):** reuse the real gauge/attack components with fixed sample own-player numbers and a local sample-send slider. Copying and theme selection are independent actions. The main process validates settings/catalog IDs, sends theme selection in existing state IPC and OBS frames, and republishes OBS immediately after saving settings. A valid OBS query override wins; on disconnection OBS retains the last theme while clearing stale match data.

- **Spawn calibration (v4b):** explicit spec rules take precedence over conflicting reference details: rank all six terms by the fraction of valid map cells strictly below them, using the weights 0.60 reach120 + 0.05 reach60 + 0.10 defense + 0.05 coast - 0.10 nationNear - 0.10 smallIsland. The Python prototype instead uses max-scaled reach and raw other terms; its printed picks also use 120-tile spacing. Production therefore cannot match those coordinates and the new spacing simultaneously. Port tests separately reproduce its nine World/Europe/Japan picks, rounded scores and reach-percentile texts under the reference settings, then verify the production percentile arithmetic. The report's measured correlations apply to the reference model, not this percentile variant. This supersedes the v4 scoring and Iceland notes below.
- **Spawn geometry and percentiles (v4b):** retain the 20,000-tile component minimum, five-cell spawn cross, zero-padded disks, four-neighbor components and Manhattan anchor distances. Use the reference's graded small-island penalty `max(0, (0.10 - component/largest)/0.10)`. Rank terms among valid cells with strict-lower ties (as in `propose.py:reasons`); round to nine decimals before ranking to suppress floating-point convolution noise. Score percentiles use midranks, saved on a 0–1 scale to six decimals before spacing selection. The panel rounds the remaining top share up, with a 1% floor; this is terrain rank, not win probability.
- **Spawn spacing (v4b):** select up to three picks at least `min(250, 0.25 × shorter full-map side)` apart, preserving row-major score ties. Return fewer when eligible terrain cannot fit three (for example Archipelago Sea); do not reduce spacing or admit undersized components to fill slots. Cache-only builds fail on missing terrain instead of downloading it.
- **Spawn explanations (v4b):** use section 5's exact texts and the prototype's salience ordering. Reach reasons use per-map percentiles; defense, closure, coast and warning thresholds retain the table's raw units. “Main landmass” means the largest component by area, including equal-size ties, rather than the prototype's approximate 99% threshold. Keep up to three reasons plus a separate optional warning. If warnings coincide, keep the highest-salience one: island (0.95), nation (0.70), then edge (0.65). Geometry is explanatory only; no wall, edge, exits or live crowding term enters the score. All data stays in FlashFront's panel and bundled assets.

- **Own-player boundary (v5):** the fixed expression reads only the own player, own incoming-attack/alliance records, config and rendered leaderboard. Attacker/ally player-object lookups were removed, including name getters. Live incoming records use a generic label; pacts use numbered labels. Alliance counts remain available when expiry is unknown; no partner balances are read or saved.
- **Evidence copy (v5):** the requested opening sentence conflicted with the user's prohibited-word rule. Use “Ports and allies were common among players who survived past 5:00. Correlation, not a guarantee.” with the sample/date tooltip. No research percentages become UI targets.
- **Opening (v5):** use absolute game time (`tick / 10`), including spawn. Checklist completion stays hidden for the observed match even if a structure is lost later. Ally cost is zero gold and immediately affordable, with agreement still needed. Building ETA uses the existing own income estimate; unavailable estimates are labeled. Unknown maps omit the port item. `hasOcean` comes from any ocean-marked tile in cached public terrain, and all 123 map flags are independently tested; no minimaps were regenerated.
- **Trade (v5):** trade means own `tradeGold + trainGold`; piracy is extracted but excluded. Window deltas are assigned to their observation time in `(now - 60, now]`, without extrapolating before attachment. Missing/decreasing counters reset the baseline. Match share divides the cumulative trade/train counter by cumulative earned gold, with zero earned shown as 0%; unavailable counters show a dash. The no-income message requires a continuously observed port for 60 seconds and zero cumulative trade/train income.
- **Reserve and reminders (v5):** safe send is floored to a whole percent and clamped at zero when already below reserve. Settings accept integer floors from 20 through 60. Alliance thresholds are inclusive at 60 and 15 seconds. A summed incoming amount of at least half your troops pins an alarm until the observed incoming set is empty; it does not predict combat results.
- **Recorded habits (v5):** new fields are optional additions to recording version 1, preserving old files. Committed troops sum the existing inferred push `sent` values; tempo divides by observed peak troops. These remain estimates from polling, not reconstructed game actions. Opening timestamps use absolute game seconds; the older chart/event `t` remains recording-relative. A first-port timestamp requires an observed zero-to-positive transition after an early attachment. No-alliance notes require coverage through 5:00 with no gaps over five seconds.
- **Practice goals (v5):** suggest only relevant observed issues, up to the three fixed goals. Store one selected goal in settings and freeze it at recording start; it remains selected for later matches until changed or cleared. The 35% practice goal stays fixed even when the preview reserve setting changes. Under-70 fails at 70% or higher outside spawn; port timing is strictly before 3:00; reserve fails on an observed push leaving less than 35%. A hit for whole-match goals needs early, continuous observations and an observed game end/elimination. Gaps over five seconds, late attachment, no observed pushes for the reserve goal, or incomplete recordings produce an unknown result unless a hit/miss is already established. Old recordings show no goal result.
- **HUD layout (v5):** add opening/trade/goal in the free inner-left column at x=340, y=290/750/590. Hidden clock/self move to x=1280. Eleven panels share `flashfront.hud.v3`; older layouts are ignored so new panels get safe defaults. The mobile stack grows to 2780px. New panels remain mounted while hidden/collapsed so observations continue. These v5 choices supersede the older layout and alliance-threshold notes below.

- **Spawn inputs (v4):** use only pinned public `map16x.bin`, manifests and paraphrased community guides. The spawn feature consumes map name, map size and phase; it never reads live terrain, ownership, claims, opponents or nation positions, sends clicks, or draws inside OpenFront.
- **Map catalog (v4):** the supplied research locates the 123-entry enum in `Maps.gen.ts`, rather than the spec’s `Game.ts`. Use the research’s complete wire-name/display-name/folder table; no extra source downloads beyond the two allowed map files. Versioned cache entries are validated before use; corrupt entries fail rather than being silently trusted.
- **Scoring (v4):** preserve the prototype’s discrete circular kernels, zero padding, 4-neighbor components, radius-one erosion and weights. Row-prefix box sums reproduce disk convolution without numpy or an image library. Select three picks with Euclidean spacing of at least 120 full tiles, stable row-major ties, and up to three strongest normalized reasons. These are unvalidated terrain heuristics, not measured win rates. A nearby coast can be separated by water; reach ignores actual expansion paths.
- **Iceland (v4):** the stated score and 120-tile separation give (1712,800), (1260,372), (1744,580), matching the prototype’s first three candidates. The third eastern pick is 222 tiles from the first, so it is not suppressed. The northwest example (548,432) is not forced into the top three. All picks meet the explicit passable/coastal/60-tile anchor checks.
- **Compact and teams (v4):** halve coordinates and map dimensions to keep markers aligned; show “Compact map: picks are approximate”. Scores and reason distances still describe Normal terrain. Team-area metadata triggers a caveat; no team or live nation positions are read, and picks are not restricted to a team rectangle.
- **Spawn layout (v4, updated v5):** the 300×540 maximum panel starts at (16,290) and temporarily replaces gauge/attack while visible. Outside spawn it has no element or reserved space, even in edit mode. Keep attribution below scrollable reasons/tips; scrolling works in edit mode and directly in the gallery. Movement, hide/collapse and opacity persist under `flashfront.hud.v3`.
- **Spawn delivery (v4):** electron-vite copies `apps/launcher/resources` into the renderer output; relative minimap URLs work with the development server and packaged `file:` pages. The gallery bundles World, Iceland, Europe and Four Islands only, with a no-image message for other known maps. `phase=spawn` freezes only the gallery phase so its preview stays visible; mock time may continue.
- **Community sources (v4):** seven maps have named-area advice; Svalmel, Dyslexdria and Europe Classic have partial advice. Tips paraphrase the supplied research; the last source has no known publication date, recorded explicitly. Source names/dates appear without external navigation from the overlay.

- **Recording clock and inferred actions (v3):** `t=0` is the first observed tick, so attaching mid-match records only the observed segment. Zone time uses elapsed game ticks and the previous stable zone; unknown time after the last valid observation is not credited. Pushes compare successive own observations (including observations between periodic samples), requiring a drop of at least 10% of previous capacity and an increased outgoing count. Events add a sample without shifting the periodic cadence. The prior attack slider ratio is recorded. Idle gold counts only observed intervals where a known City cost stays affordable and neither a gold decrease nor a changed City cost is seen; spending and income between polls cannot be reconstructed.
- **Storage bounds (v3):** filenames use UTC and safe map/ID slugs; missing game IDs use `local`, and same-second collisions get a numeric suffix. After one recorded hour, periodic samples use 100 ticks; notable events still sample immediately. Under the byte budget, older samples are thinned and only the most recent 1,000 events retained, while full-session summaries remain intact. JSON is compact and checked against a conservative decimal 2 MB limit. Retention orders by `startedAt`, validates both filename and `recordedBy`, and ignores corrupt/foreign files and symbolic links. Graceful launcher shutdown also finishes and flushes an incomplete recording.
- **Results and W/L (v3):** final rank means the last observed own leaderboard rank, not a server-confirmed placement. Only confirmed individual outcomes count: observed elimination is a loss, and alive rank 1 at game-over in a non-team mode is a win. Incomplete and team outcomes remain unknown and do not change W/L. Session counters reset when the launcher starts. Peak land uses tiles because no total-map tile count is extracted. OBS sends only the result summary, not the sample/event arrays.
- **Public stats availability (v3):** archived public IDs may be missing; leave the setting editable instead of matching names. Retries respect the shared upstream cache, including cached errors; a long upstream TTL can delay discovery beyond the retry window. Profile refreshes every five minutes and after recordings, subject to caching. When multiple ladders contain the ID, prefer 1v1, then 2v2, then FFA on the first matching page; show ladder/rank when no tier is provided rather than inventing a tier. Public responses never persist to disk.

- **Unknown live values:** raw getters are optional and independently guarded. Existing required numeric snapshot fields use zero when unavailable; new income/missile fields remain optional. Unknown building entries are omitted, including Port/Factory costs unless both shared counts are known. Alliances without expiry retain their own entry with an unknown timer. Map/mode default to Unknown/FFA. Events remain empty; the incoming alarm derives from own incoming records. Leaderboard color uses a neutral swatch because territory colors are not extracted.
- **Leaderboard parsing:** accept visible table/ARIA rows in `leader-board` (including its shadow root), with rendered rank/name/land/gold/troops cells. Hidden, clipped or offscreen rows are excluded. Unsupported layouts produce no rows; there is no game-object fallback. Live DOM compatibility awaits the user's game verification.
- **Income and identity:** gold income uses elapsed ticks at 10 Hz, initializes from the first nonnegative delta, then applies a 25% new/75% previous exponential average. Spending retains the last estimate. Menus, disconnects and tick rewinds reset the baseline; each observed new match gets a new source-local ID.
- **Connection lifecycle:** discovery runs every second, extraction at most four times per second with no overlapping poll, and websocket reconnect uses 250ms exponential backoff capped at five seconds. Pending calls have a two-second timeout and reject on disconnect. Stale HUD/OBS state clears on lost connection or menu.
- **Launcher settings:** ranked hiding defaults on when the game reports Ranked. Start-hidden applies on the next launch. Configurable shortcuts use Ctrl/Alt/Shift/Meta plus a letter, number or function key, excluding the clipping app's reserved key. Main owns global shortcuts; overlay in-page shortcuts are disabled to avoid double toggles.
- **Window and OBS delivery:** use the existing read-only window bounds; never request game screenshots or focus changes. OBS assets are served from the renderer output in production and proxied from the local Vite renderer during development. Its websocket accepts only same-origin browser connections. V3 adds the restricted public stats proxy above; no packaged installer is included.

- **Mock timing:** exactly 10 simulation ticks/s at 1×, with 1, 5 or 20 ticks per 100ms timer callback. Snapshots publish every 300ms (3.33 Hz), plus an initial snapshot on subscribe. This meets the four-updates-per-second ceiling without fractional simulation ticks. Speed changes preserve state; a new seed restarts it.
- **Mock lifecycle:** start at spawn, play for 15 simulated minutes, finish near 30% land and freeze at the end. Ending marks the end of this demonstration, not a claimed 80% victory. Change the seed to start again. The win target remains the spec's assumed 80%.
- **Fixtures:** the gallery uses Ember (`self`, clan FF, country code US), 40 players, 30 ELO points and 20 matches. Fixed September–October 2026 dates keep history reproducible. Gallery stream session W/L and the result card deliberately use sample fixtures; the preview labels this. Launcher OBS uses real local/profile data. Lobby countdowns refresh from the mock source. Player flags use country-code badges, avoiding external flag assets.
- **Mechanics:** formulas are pinned to v0.34.25, with one-hour / 36,000-tick projection limits. Partial simulation ticks are discarded. Already-reached targets return zero before testing unreachable capacity. Invalid growth inputs return zero; attack ratios are clamped to 0-1. The sweet spot uses 48 golden-section iterations and is memoized by rounded capacity. A nonpositive capacity has zero growth everywhere, so the numerical tie resolves to the lower search bound (1%).
- **Alliances:** the expiry bar uses remaining time when first observed because the specified type has no creation tick. It highlights at 60 seconds and becomes urgent at 15 seconds. Mock alliance formation is a simulated event, never an input action.
- **HUD layout:** eleven panels, 300px wide, with self/clock initially hidden and spawn/opening/goal gated by their applicable state. Layout storage is `flashfront.hud.v3`; older data is ignored. Desktop default coordinates scale from 1920x1080 to the HUD container; below 720px panels stack. Saved/custom positions remain pixels and are clamped to the container. Edge snapping is for dragging, not default placement (so x=16 stays x=16). Hidden panels remain accessible in edit mode during their applicable phase, and collapsing/hiding keeps their state mounted. Custom layouts can intentionally overlap; there is no collision solver.
- **Stream composition:** a two-column group fits the five-widget scene at 1920 × 1080; a single selected widget uses one column. The anchor applies to the group. Scale can intentionally extend content beyond the canvas, as with an OBS source transform.
- **Charts:** hand-written responsive SVG. Land and troops have separate area plots to avoid conflating different units. ELO/area tooltips work with pointer hover or keyboard focus and arrow keys. Sparklines retain the last 120 simulated seconds available since mounting the widget.
- **Theme:** visual colors, font stacks and shared design tokens live in `packages/ui/src/theme.css`; only `fonts.css` imports the local font packages. Territory swatches are snapshot data, not theme colors. Silkscreen is limited to the wordmark and tiny labels. Animated live numbers respect reduced motion.
- **Tooling:** Vite 8, Vitest 5 and native Node 24 config loading avoid esbuild subprocesses. Vitest uses worker threads; pnpm runs workspace scripts sequentially because this Windows sandbox rejects child-process pipes. Preserved Vite symlinks avoid a Windows network-drive probe; React is deduplicated and its scheduler is resolved from React DOM's actual pnpm package location. These are checked-in portable settings, not changes to installed dependency code.
- **Scope:** no separate stats root or routing library; the gallery composes the requested page components. No chart library or UI kit. All terrain and wordmark treatments are original CSS/text.

- **Mock playtest arc:** retain the 15-minute demonstration (45 seconds at 20x). Small expansion sends stop at 5:30; gold/building spending pauses until 8:00, allowing the 6-7 minute overfill. The visible ratio switches to 80% at 7:20, the push happens at 7:30, and RetroCityUKF's 13K attack appears at 7:34 and resolves at 7:50. Base income is 1,000/s with seeded 80-120K trades each minute. Mock buildings are all level one, so counts equal level sums; Port/Factory prices use their shared sum. This replays the arc, not every historical numeric sample.
- **Zone boundaries:** 25% belongs to low; both sweet +/-8 percentage-point endpoints belong to sweet; 70% belongs to high. Exposed and wasting use the spec's strict inequalities. Zone copy is exact. Growth rates use two decimals in K/s; incoming attacks retain one decimal (13.0K). Other troop figures keep the existing compact formatter.
- **Idle gold:** use elapsed game time since first observation of an affordable City, not wall time. Highlight at 30 seconds; reset when affordability is lost, the City price changes, time rewinds, the player becomes a spectator, or the game ID changes. This follows the gallery speed controls and survives panel collapse/hide.
- **Incoming comparison:** list each visible attack and compare the summed incoming troops with the preview's remaining troops; this is an amount comparison, not a combat outcome prediction.
- **Reference layout heights:** reserve 220px for gauge, 300px for attack, 450px for build, 190px for alliances, and 360px for events. Left y positions are 290/530/850; right y positions are 190/660. Hidden clock/self use free space at (340,290)/(340,480). Content bounds are enforced outside edit mode. The gallery's stage is a full game viewport (minimum 1080px high) beneath its navigation/controls, with a taller mobile stage for stacking.
- **Font switching:** the gallery is the shared entry point for HUD, stream and stats. It dynamically imports `fonts.css?inline` and mounts a removable stylesheet, so navigating to `#/hud?nofonts=1` also disables fonts previously loaded on another route. Fresh nofonts loads skip that import entirely. No font URL is required by HUD code.

Implementation references: [Vite documentation](https://vite.dev/guide/) and [Tailwind's Vite installation guide](https://tailwindcss.com/docs/installation/using-vite).

## License and attribution

FlashFront is free software under the [GNU AGPL-3.0](LICENSE), using the
`AGPL-3.0-only` identifier. Each release's source is in this repository.

FlashFront is a companion for [OpenFront](https://github.com/openfrontio/OpenFrontIO),
which is licensed under AGPL-3.0. Any OpenFront code included here retains its
original copyright notices and is listed in this section with its source path and
version. The OpenFront engine is bundled for the Training room only: `vendor/openfront` holds
the unmodified engine source from OpenFrontIO tag v0.35.4 (commit
14ba82badb1e945ef2e758999238339404fdb788), © OpenFront and Contributors, AGPL-3.0 with its
Section 7 terms; see [vendor/openfront/UPSTREAM.md](vendor/openfront/UPSTREAM.md) and
[its LICENSE](vendor/openfront/LICENSE).

Map data © OpenFront contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
from OpenFrontIO `resources/maps` versions v0.34.25, v0.35.2 and v0.35.4. The installer ships every
v0.35.4 map, compressed, so Training works offline; map data sources are credited in
[vendor/openfront/CREDITS.md](vendor/openfront/CREDITS.md). Derived spawn data
and minimaps are also CC BY-SA 4.0; see the notices for
[spawn data](packages/core/src/spawn/LICENSE-MAPDATA.md),
[launcher minimaps](apps/launcher/resources/minimaps/LICENSE-MAPDATA.md), and
[gallery minimaps](apps/gallery/public/minimaps/LICENSE-MAPDATA.md).
Community spawn tips are short paraphrases credited in
[tools/spawn/community.ts](tools/spawn/community.ts).

FlashFront is not affiliated with or endorsed by OpenFront.
