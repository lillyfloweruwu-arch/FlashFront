import { expect, it } from "vitest";
import { MAP_PRESETS, formatPreset, presetJson, validatePreset } from "./presets";

it("ships five valid, cosmetics-free presets with sorted two-space JSON", () => {
  for (const [id, preset] of Object.entries(MAP_PRESETS)) {
    expect(validatePreset(preset.overrides)).toBe(true);
    expect(preset.overrides).not.toHaveProperty("cosmetics");
    expect(JSON.parse(presetJson(id))).toEqual(preset.overrides);
  }
  expect(formatPreset({ terrain: { oceanColor: "#123456", backgroundColor: "#000000" }, palette: "default" }))
    .toBe('{\n  "palette": "default",\n  "terrain": {\n    "backgroundColor": "#000000",\n    "oceanColor": "#123456"\n  }\n}');
});
it("rejects unknown fields, wrong types, invalid palettes and non-JSON numbers", () => {
  for (const value of [null, [], "{}", { unknown: 1 }, { terrain: { ocean: "blue" } }, { lighting: { ambient: "1" } },
    { palette: "night" }, { structure: [] }, { palette: undefined }, { lighting: { ambient: Infinity } },
    { classicBotColors: 1 }, { cosmetics: { flagOpacity: -0.1 } }, { cosmetics: { flagOpacity: 1.1 } },
    { cosmetics: { showFrom: "friends" } }, { mapLayerAlpha: { terrain: 2 } }, { mapLayerVisibility: { terrain: 1 } },
    JSON.parse('{"__proto__":{}}'), { terrain: { constructor: "bad" } }]) {
    expect(validatePreset(value), JSON.stringify(value)).toBe(false);
    expect(() => formatPreset(value)).toThrow();
  }
  expect(validatePreset({})).toBe(true);
  expect(validatePreset({ cosmetics: { flagOpacity: 0 } })).toBe(true);
  expect(validatePreset({ cosmetics: { flagOpacity: 1 }, mapLayerAlpha: { terrain: 0.5 }, mapLayerVisibility: { terrain: false } })).toBe(true);
  for (const id of ["__proto__", "constructor", "unknown", {}, undefined]) expect(() => presetJson(id)).toThrow();
});
it("preserves all built-in colorblind facts in Signal and keeps icons within 20%", () => {
  const builtin = { palette: "colorblind", affiliation: { selfColor: "#0072b2", allyColor: "#56b4e9", enemyColor: "#d55e00" }, mapOverlay: { friendlyTintColor: "#0072b2", embargoTintColor: "#d55e00", friendlyTintRatio: 0.85, embargoTintRatio: 0.85 } };
  expect(MAP_PRESETS.colorblind.overrides).toEqual(builtin);
  expect(MAP_PRESETS.signal.overrides).toEqual({ ...builtin, structure: { iconSize: 66 } });
  expect(66 / 60).toBeLessThanOrEqual(1.2);
});
