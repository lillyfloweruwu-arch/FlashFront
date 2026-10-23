import { isThemeId, THEME_IDS, type ThemeId } from "@flashfront/core";
export { isThemeId, THEME_IDS, type ThemeId };
type Tokens = Record<`--${string}`, string>;
const base: Tokens = {
  "--ff-bg": "#0A0A0B", "--ff-surface": "#121316", "--ff-surface-2": "#1B1D22", "--ff-edge": "#2A2D34",
  "--ff-fg": "#F2F3F5", "--ff-muted": "#9AA0AB", "--ff-faint": "#6B7280", "--ff-red": "#E8192C", "--ff-red-dim": "#8C0F1B",
  "--ff-good": "#34D399", "--ff-caution": "#FFB020", "--ff-rose": "#FF6B8E", "--ff-ally": "#5AA9FF",
};
function tokens(colors: Tokens, scale = 1): Tokens {
  const t = { ...base, ...colors };
  return { ...t, "--font-scale": String(scale),
    "--panel-bg": `color-mix(in srgb, ${t["--ff-surface"]} 96%, transparent)`,
    ...Object.fromEntries(Object.entries({ canvas: "bg", surface: "surface", "surface-hover": "surface-2", "panel-border": "edge", text: "fg", muted: "muted", primary: "red", accent: "red", gain: "good", danger: "rose", warning: "caution", ally: "ally" }).map(([old, name]) => [`--${old}`, t[`--ff-${name}`]!])),
    ...Object.fromEntries(Object.entries({ xs: 11, sm: 12, md: 13, base: 14, lg: 16, xl: 20, "2xl": 28, "3xl": 40 }).map(([key, value]) => [`--text-${key}`, `${value * scale}px`])),
    "--text-hero": `${40 * scale}px`,
  };
}
export const THEMES: Record<ThemeId, { name: string; description: string; tokens: Tokens }> = {
  abyss: { name: "Front", description: "Flash neutrals. Signature red. Your field instruments.", tokens: tokens({}) },
  daylight: { name: "Daylight", description: "Brighter graphite surfaces for a bright room.", tokens: tokens({ "--ff-bg": "#17191D", "--ff-surface": "#24272D", "--ff-surface-2": "#30343C", "--ff-edge": "#505661", "--ff-muted": "#BBC1CA" }) },
  ember: { name: "Ember", description: "Flash neutrals with warm state cues.", tokens: tokens({}) },
  signal: { name: "Signal", description: "High contrast, colorblind-safe cues and 15% larger text.", tokens: tokens({ "--ff-bg": "#030508", "--ff-surface": "#0C1016", "--ff-surface-2": "#222C38", "--ff-edge": "#A6B2C1", "--ff-fg": "#FFFFFF", "--ff-muted": "#CED7E3", "--ff-faint": "#A6B2C1", "--ff-good": "#56B4E9", "--ff-caution": "#E69F00", "--ff-rose": "#D55E00" }, 1.15) },
};
export function resolveTheme(override: unknown, fallback: unknown = "abyss"): ThemeId {
  return isThemeId(override) ? override : isThemeId(fallback) ? fallback : "abyss";
}
/** Only called on FlashFront-owned documents, never on the game document. */
export function applyTheme(element: HTMLElement, id: ThemeId): void {
  const doc = element.ownerDocument;
  if (!doc.querySelector("style[data-flashfront-themes]")) {
    const style = doc.createElement("style"); style.dataset.flashfrontThemes = "true";
    style.textContent = THEME_IDS.map(key => `[data-ff-theme="${key}"]{color-scheme:dark;${Object.entries(THEMES[key].tokens).map(([name, value]) => `${name}:${value}`).join(";")}}`).join("\n");
    doc.head.append(style);
  }
  element.dataset.ffTheme = id;
}
