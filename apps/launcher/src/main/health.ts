import { heatCameraMatches, heatDimensions, maxTroops, RULES_VERSION, troopGrowthPerTick, type RawExtract } from "@flashfront/core";
import { restrictedMatch, type LauncherState } from "../shared";

export type Feature = "growth" | "attack" | "build" | "trade" | "alliances" | "spawnHeat";
export type HealthStatus = "verified" | "paused" | "unavailable";
export type FeatureHealth = Record<Feature, HealthStatus>;
export type PlatformState = LauncherState & { gameForeground?: boolean | null; health?: FeatureHealth };
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const counter = (value: unknown) => typeof value === "string" && /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value));
const close = (actual: number, expected: number) => Math.abs(actual - expected) <= Math.max(1, expected * 0.02);

/** Check the raw payload: mapped defaults are not evidence that a getter still works. */
export function featureHealth(raw: RawExtract | null, version?: string): FeatureHealth {
  const health: FeatureHealth = { growth: "unavailable", attack: "unavailable", build: "unavailable", trade: "unavailable", alliances: "unavailable", spawnHeat: "unavailable" };
  if (!raw?.inGame || restrictedMatch({ raw })) return health;
  const me = raw.me; const testedVersion = version?.replace(/^v/, "") === RULES_VERSION;
  if (me) {
    const growthFields = numeric(me.troops) && numeric(me.maxTroops) && me.maxTroops > 0 && numeric(me.troopRatePerTick);
    const growthCheck = growthFields && numeric(me.tiles) && numeric(me.cityLevels)
      && close(me.maxTroops!, maxTroops(me.tiles, me.cityLevels)) && close(me.troopRatePerTick!, troopGrowthPerTick(me.troops!, me.maxTroops!));
    health.growth = growthFields && !raw.game?.cheats && (testedVersion || growthCheck) ? "verified" : "paused";
    health.attack = health.growth === "verified" && numeric(me.attackRatio) && me.attackRatio <= 1 && numeric(me.outgoingCount)
      && numeric(me.tiles) && Array.isArray(me.incoming) && me.incoming.every(a => a && numeric(a.troops)) ? "verified" : "paused";
    // Build costs are not in the fixed extract. A changed rules version cannot self-verify them. An
    // unknown version (connected mid-match; the version is only shown in the menu) is trusted when the
    // live growth self-check matches the tested formulas.
    const rulesMatch = testedVersion || (!version && growthCheck);
    health.build = rulesMatch && !raw.game?.cheats && counter(me.gold) && counter(me.goldEarned) && numeric(raw.tick)
      && numeric(me.troops) && numeric(me.maxTroops) && me.maxTroops > 0
      && [me.cityLevels, me.portLevels, me.factoryLevels, me.defensePosts, me.samLaunchers, me.silos].every(numeric) ? "verified" : "paused";
    health.trade = counter(me.tradeGold) && counter(me.trainGold) && counter(me.goldEarned) && numeric(raw.tick)
      && numeric(me.portLevels) && numeric(me.factoryLevels) ? "verified" : "paused";
    health.alliances = numeric(raw.tick) && Array.isArray(me.alliances) && me.alliances.every(a => a && typeof a.with === "string"
      && numeric(a.expiresInTicks) && (a.renewRequested === undefined || typeof a.renewRequested === "boolean")) ? "verified" : "paused";
  }
  if (raw.inSpawnPhase && !raw.gameOver) {
    const dims = heatDimensions(raw.game?.map ?? ""); const heat = raw.spawnHeat;
    if (dims) health.spawnHeat = heat && Array.isArray(heat.others) && heat.others.every(p => p && numeric(p.x) && numeric(p.y))
      && heatCameraMatches(dims, heat.camera, raw.game?.mapSize === "Compact" ? "Compact" : "Normal") ? "verified" : "paused";
  }
  return health;
}

export interface Diagnosis { code: "port-closed" | "menu" | "no-player" | "hotkey" | "hidden-ranked" | "hidden-replay" | "not-focused" | "ok"; text: string; fix?: string }
export function diagnose(state: LauncherState & { gameForeground?: boolean | null }): Diagnosis {
  if (!state.status.startsWith("connected")) return { code: "port-closed", text: "The local game connection is unavailable.", fix: "Steam → OpenFront → Properties → Launch Options. Copy the option below, then restart OpenFront." };
  if (state.raw?.replay || state.snapshot?.observer === "replay") return { code: "hidden-replay", text: "HUD hidden during replays.", fix: "Live public matches show the HUD." };
  if (state.raw?.game?.rankedType || state.raw?.game?.type === "Ranked" || state.snapshot?.mode === "Ranked") return { code: "hidden-ranked", text: "HUD hidden in ranked matches.", fix: "Public unranked matches show the HUD." };
  if (!state.raw?.inGame) return { code: "menu", text: "Connected to the OpenFront menu.", fix: "The HUD appears during a live match." };
  if (!state.raw.me) return { code: "no-player", text: "Own-player data is unavailable.", fix: "The HUD waits for your player to be available in a live match." };
  if (state.errors.some(e => e.startsWith("Shortcut "))) return { code: "hotkey", text: "A FlashFront shortcut could not register.", fix: "Settings → Hotkeys: choose a different shortcut and save." };
  if (!(state.gameForeground ?? state.raw.visible) && !state.editing) return { code: "not-focused", text: "HUD hidden while OpenFront is in the background.", fix: "Switch back to OpenFront to see the HUD." };
  if (!state.hudEnabled) return { code: "ok", text: "Connected. HUD is switched off.", fix: "Turn HUD on here or use the HUD shortcut." };
  if (state.snapshot?.observer === "spectating") return { code: "no-player", text: "HUD hidden while spectating.", fix: "The HUD returns in your next live match." };
  if (state.errors.some(e => e.startsWith("Can't locate the OpenFront window"))) return { code: "not-focused", text: "The game window bounds are unavailable.", fix: "Restore the OpenFront window to show the HUD." };
  return { code: "ok", text: "Connected. The HUD is ready." };
}
