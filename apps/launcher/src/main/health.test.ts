import { expect, it } from "vitest";
import { maxTroops, RULES_VERSION, troopGrowthPerTick, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherState } from "../shared";
import { diagnose, featureHealth } from "./health";

const troops = 100_000; const capacity = maxTroops(1000, 1);
const raw: RawExtract = { inGame: true, visible: true, gameId: "fixture", tick: 500, game: { map: "World" }, me: {
  troops, maxTroops: capacity, troopRatePerTick: troopGrowthPerTick(troops, capacity), tiles: 1000, gold: "500000", goldEarned: "600000",
  attackRatio: 0.2, incoming: [], outgoingCount: 0, cityLevels: 1, portLevels: 0, factoryLevels: 0,
  defensePosts: 0, samLaunchers: 0, silos: 0, tradeGold: "0", trainGold: "0", alliances: [],
} };
it("pauses missing raw fields before the mapper can turn them into zeros", () => {
  const health = featureHealth({ ...raw, me: { ...raw.me, maxTroops: undefined } }, RULES_VERSION);
  expect(health.growth).toBe("paused"); expect(health.attack).toBe("paused");
  expect(health.build).toBe("paused"); expect(health.alliances).toBe("verified"); expect(featureHealth(raw, RULES_VERSION).growth).toBe("verified");
  expect(Object.values(featureHealth(null, RULES_VERSION))).toEqual(Array(6).fill("unavailable"));
});
it("self-checks a changed version and never verifies unknown costs", () => {
  expect(featureHealth(raw, "0.36.0").growth).toBe("verified");
  const changed = featureHealth({ ...raw, me: { ...raw.me, troopRatePerTick: 1 } }, "0.36.0");
  expect(changed.growth).toBe("paused"); expect(changed.attack).toBe("paused");
  expect(changed.build).toBe("paused"); expect(changed.trade).toBe("verified");
});
// Live 2026-10-18: FlashFront connected mid-match, so the game version (read only in the menu) was
// unknown; build, decision and opening all showed "estimate paused" although every self-check passed.
it("treats an unknown game version like the tested rules when the live self-checks pass", () => {
  expect(featureHealth(raw, undefined)).toMatchObject({ growth: "verified", attack: "verified", build: "verified" });
  const broken = featureHealth({ ...raw, me: { ...raw.me, troopRatePerTick: 1 } }, undefined);
  expect(broken.growth).toBe("paused"); expect(broken.build).toBe("paused");
});
it("rejects malformed values and keeps unavailable features distinct", () => {
  expect(featureHealth({ ...raw, me: { ...raw.me, gold: "", alliances: undefined, incoming: [{ from: "Incoming", troops: NaN }] } }, RULES_VERSION))
    .toMatchObject({ build: "paused", alliances: "paused", attack: "paused", spawnHeat: "unavailable" });
  expect(featureHealth({ ...raw, replay: true }, RULES_VERSION).growth).toBe("unavailable");
  expect(featureHealth({ ...raw, game: { rankedType: "ffa" } }, RULES_VERSION).growth).toBe("unavailable");
  expect(featureHealth({ ...raw, inSpawnPhase: true }, RULES_VERSION).spawnHeat).toBe("paused");
});
const state: LauncherState = { feedbackAvailable: false, status: "connected-game", settings: DEFAULT_SETTINGS, raw, snapshot: null, editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };
it.each([
  [{ status: "port-closed", raw: null }, "port-closed"],
  [{ status: "connected-menu", raw: { inGame: false, visible: true } }, "menu"],
  [{ raw: { ...raw, me: undefined } }, "no-player"],
  [{ errors: ["Shortcut Ctrl+Alt+H could not register."] }, "hotkey"],
  [{ raw: { ...raw, game: { rankedType: "ffa" } }, settings: { ...DEFAULT_SETTINGS, ranked: false } }, "hidden-ranked"],
  [{ raw: { ...raw, replay: true } }, "hidden-replay"],
  [{ raw: { ...raw, visible: false } }, "not-focused"],
  [{}, "ok"],
] as const)("diagnoses %j", (patch, code) => { expect(diagnose({ ...state, ...patch } as LauncherState).code).toBe(code); });
it("uses OS focus when available and explains a disabled HUD", () => {
  expect(diagnose({ ...state, raw: { ...raw, visible: false }, gameForeground: true }).code).toBe("ok");
  expect(diagnose({ ...state, hudEnabled: false }).fix).toContain("HUD");
});
