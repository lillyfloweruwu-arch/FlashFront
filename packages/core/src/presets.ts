/** Field facts from OpenFront v0.34.25 GraphicsOverridesSchema; independent validation. */
export const THEME_IDS = ["abyss", "daylight", "ember", "signal"] as const;
export type ThemeId = typeof THEME_IDS[number];
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.some(id => id === value);
}
export type PresetId = ThemeId | "colorblind";
type JsonObject = { [key: string]: string | number | boolean | JsonObject };
type Rule = "number" | "boolean" | "string" | "opacity" | readonly string[] | { [key: string]: Rule };
const fields: Record<string, Rule> = {
  palette: ["default", "colorblind"], classicBotColors: "boolean",
  name: { nameScaleFactor: "number", cullThreshold: "number", darkNames: "boolean", hoverFadeAlpha: "number", hoverGlowWidth: "number", hoverGlowAlpha: "number" },
  structure: { iconSize: "number", classicIcons: "boolean", classicNumbers: "boolean", showDots: "boolean" },
  mapOverlay: { navalHighlight: "boolean", highlightFillBrighten: "number", highlightBrighten: "number", highlightThicken: "number", territorySaturation: "number", territoryAlpha: "number", coordinateGridOpacity: "number", staleNukeColor: "string", friendlyTintColor: "string", embargoTintColor: "string", friendlyTintRatio: "number", embargoTintRatio: "number" },
  altView: { fillAlpha: "number" },
  affiliation: { selfColor: "string", allyColor: "string", enemyColor: "string" },
  railroad: { railMinZoom: "number", railThickness: "number" },
  smallPlayerGlow: { strength: "number" }, passEnabled: { fx: "boolean", fallout: "boolean" },
  terrain: { backgroundColor: "string", oceanColor: "string", sandColor: "string", plainsColor: "string", highlandColor: "string", mountainColor: "string" },
  lighting: { ambient: "number", falloffPower: "number" },
  cosmetics: { showFrom: ["everyone", "teammates", "self"], territorySkins: "boolean", flags: "boolean", flagOpacity: "opacity", crowns: "boolean", transportShipTrail: "boolean", nukeTrail: "boolean", nukeExplosion: "boolean", structures: "boolean", warship: "boolean", train: "boolean", railroad: "boolean" },
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function matches(value: unknown, rule: Rule): boolean {
  if (Array.isArray(rule)) return typeof value === "string" && rule.includes(value);
  if (rule === "opacity") return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  if (rule === "number") return typeof value === "number" && Number.isFinite(value);
  if (typeof rule === "string") return typeof value === rule;
  const section = rule as Record<string, Rule>;
  return object(value) && Object.entries(value).every(([key, item]) => Object.hasOwn(section, key) && matches(item, section[key]!));
}
/** Validate the whole official field list, without stripping or coercing anything. */
export function validatePreset(value: unknown): value is JsonObject {
  return object(value) && Object.entries(value).every(([key, item]) => {
    if (key === "mapLayerVisibility" || key === "mapLayerAlpha") {
      return object(item) && Object.values(item).every(v => matches(v, key === "mapLayerAlpha" ? "opacity" : "boolean"));
    }
    return Object.hasOwn(fields, key) && matches(item, fields[key]!);
  });
}
export function formatPreset(value: unknown): string {
  if (!validatePreset(value)) throw new Error("Invalid graphics preset.");
  const sort = (item: JsonObject): JsonObject => Object.fromEntries(Object.keys(item).sort().map(key => {
    const entry = item[key]!;
    return [key, typeof entry === "object" ? sort(entry) : entry];
  }));
  return JSON.stringify(sort(value), null, 2);
}
const colorblind = {
  palette: "colorblind",
  affiliation: { selfColor: "#0072b2", allyColor: "#56b4e9", enemyColor: "#d55e00" },
  mapOverlay: { friendlyTintColor: "#0072b2", embargoTintColor: "#d55e00", friendlyTintRatio: 0.85, embargoTintRatio: 0.85 },
};
export const MAP_PRESETS: Record<PresetId, { name: string; overrides: JsonObject }> = {
  abyss: { name: "Abyss", overrides: { palette: "default", terrain: { oceanColor: "#18384f", backgroundColor: "#101e30" }, lighting: { ambient: 0.55 } } },
  daylight: { name: "Daylight", overrides: { palette: "default", terrain: { oceanColor: "#628fa8", backgroundColor: "#456779" }, lighting: { ambient: 1 } } },
  ember: { name: "Ember", overrides: { palette: "default", terrain: { oceanColor: "#294657", backgroundColor: "#1b2933", sandColor: "#e2bc79", plainsColor: "#a99a55", highlandColor: "#b87f46", mountainColor: "#eedac0" }, lighting: { ambient: 0.7 } } },
  signal: { name: "Signal", overrides: { ...colorblind, structure: { iconSize: 66 } } },
  colorblind: { name: "Colorblind (game built-in)", overrides: colorblind },
};
/** Clipboard boundary: only catalog IDs, and no cosmetics overrides. */
export function presetJson(id: unknown): string {
  if (typeof id !== "string" || !Object.hasOwn(MAP_PRESETS, id)) throw new Error("Choose a listed map preset.");
  const preset = MAP_PRESETS[id as PresetId].overrides;
  if (Object.hasOwn(preset, "cosmetics")) throw new Error("Cosmetics are excluded from FlashFront presets.");
  return formatPreset(preset);
}
