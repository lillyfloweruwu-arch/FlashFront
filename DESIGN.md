---
name: FlashFront
description: "War table: a dimmed OpenFront map with floating glass launcher panels and solid in-game instruments."
colors:
  signature-red: "#E8192C"
  signature-red-dim: "#8C0F1B"
  void-black: "#0A0A0B"
  panel-graphite: "#121316"
  raised-graphite: "#1B1D22"
  hairline-steel: "#2A2D34"
  instrument-white: "#F2F3F5"
  label-grey: "#9AA0AB"
  faint-grey: "#6B7280"
  state-good: "#34D399"
  state-caution: "#FFB020"
  state-rose: "#FF6B8E"
  state-ally: "#5AA9FF"
typography:
  display:
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.03em"
  play-hero:
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "50px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.03em"
  headline:
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  module-title:
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-compact:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  hairline: "2px"
  sm: "4px"
  control: "8px"
  button: "10px"
  hud: "12px"
  panel: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-primary:
    background: "linear-gradient(180deg, #F02236, #C61224)"
    boxShadow: "0 10px 24px rgba(232,25,44,.3), inset 0 1px 0 rgba(255,255,255,.25)"
    textColor: "#FFFFFF"
    fontFamily: "Antonio Variable, Bahnschrift, Arial Narrow, sans-serif"
    textTransform: "uppercase"
    letterSpacing: "0.1em"
    rounded: "{rounded.button}"
    height: "44px"
    padding: "8px 24px"
  button-primary-hero:
    height: "56px"
    fontSize: "20px"
    boxShadow: "0 14px 34px rgba(232,25,44,.42)"
  button-secondary:
    backgroundColor: "rgba(255,255,255,.08)"
    border: "1px solid rgba(255,255,255,.1)"
    textColor: "{colors.instrument-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.raised-graphite}"
  input:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  hud-module:
    backgroundColor: "{colors.panel-graphite}"
    rounded: "{rounded.hud}"
    boxShadow: "0 6px 18px rgba(0,0,0,.5)"
    width: "272px"
    padding: "8px 12px 10px"
  hud-module-header:
    textColor: "{colors.instrument-white}"
    typography: "{typography.module-title}"
    height: "28px"
    padding: "0 12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.label-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 4px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.label-grey}"
    rounded: "{rounded.pill}"
    size: "44px"
  nav-item-active:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.signature-red}"
  keycap:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
  plate:
    backgroundColor: "rgba(14,16,19,.8)"
    backdropFilter: "blur(16px)"
    border: "1px solid rgba(255,255,255,.08)"
    rounded: "{rounded.panel}"
    padding: "16px"
shadows:
  lift: "inset 0 1px 0 rgba(255,255,255,.07)"
  float: "0 20px 50px rgba(0,0,0,.5)"
  hud: "0 6px 18px rgba(0,0,0,.5)"
  primary: "0 10px 24px rgba(232,25,44,.3)"
  primary-hero: "0 14px 34px rgba(232,25,44,.42)"
  title: "0 4px 24px rgba(0,0,0,.7)"
---

# Design System: FlashFront

## Visual direction: War table

The dimmed OpenFront map fills the launcher window. Frosted glass panels float above a faint contour pattern and 64px grid, making the launcher feel like a command table inside the game. Option B in `docs/design/war-table/look-directions-v2.html` and `docs/design/war-table/war-table-surfaces.html` define the approved direction.

Use the real map assets at `minimaps/<name>.png`, with `--map-filter` (saturation .9, brightness .55, contrast 1.05) or `--map-filter-dim` (saturation .6, brightness .32) behind dense content. `--topo-ring` and `--grid-line` keep decoration quiet. Artwork cards use `--scrim-art` to protect text contrast.

The sidebar floats 16px inside the window, with 16px vertical and 12px horizontal padding. Main content sits beside it with 12?14px gaps and 14px 16px panel padding. Use content-sized panels and a left-aligned Play hero. No coloured side bars on rows or cards.

## Palette and the One Red Rule

Keep the palette in the frontmatter: graphite neutrals, instrument white and grey text, signature red, and separate green, blue, amber and rose states. Theme variants retain their existing neutral and state overrides.

**The One Red Rule.** #E8192C means FlashFront and "do this". At most one red primary action appears per screen. Red is reserved for identity, the primary action, active navigation, selection and focus; it never means a warning, loss or enemy. The primary gradient is the approved treatment of that same action.

Move quality: Great = good green, Good = ally blue, Costly = caution amber, Blunder = rose. Always label state colours in text. Charts and ordinary numbers stay neutral. Never invent data: show a short empty state or "Unavailable" when data is missing.

## Typography

Keep Antonio Variable (Bahnschrift, Arial Narrow fallbacks) and Inter (Segoe UI, system-ui fallbacks), self-hosted. Use Inter for sentence-case copy, labels, controls and small tabular numbers. Antonio caps belong to titles, big numbers and the approved primary action treatment.

`.ff-page-title` is Antonio 600 at 34px, line-height 1, .03em tracking and `--title-shadow`. The Play hero heading is 50px Antonio, distinct from the hero button's 20px label. Section headings are 20px; glanceable numbers are 28px or larger. Small data uses Inter with tabular numerals. HUD module titles retain their existing 14px Antonio exception, with 13px Compact / 14px Comfortable body text and 11px column labels.

All game values use the core formatters; never round up or show digits the game would not. HUD layout continues to respect `GAME_UI_ZONES` and content-sized module heights.

## Surfaces, radii and shadows

Use `.ff-glass`: `--glass` rgba(14,16,19,.8), 16px blur, a 1px `--glass-edge`, `--radius-panel`, and `--float` plus `--lift`. The sidebar uses `--glass-strong` rgba(14,16,19,.78) and `--glass-blur-side` 14px. Shared tokens are the source of truth; do not introduce local blur or glow that bypasses fallback rules.

The radius scale is **8 / 10 / 12 / 14 / 999px**: controls, primary buttons, HUD, panels and pills. Existing 2px and 4px details remain available for legacy compact instruments. The spacing scale remains 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px.

Panels cast `--float` (0 20px 50px rgba(0,0,0,.5)) and catch `--lift` (inset 0 1px 0 rgba(255,255,255,.07)). Page titles use 0 4px 24px rgba(0,0,0,.7). Keep the authored 16px line icons, 1.5px strokes, square caps and miter joins.

## Buttons

`.ff-btn-primary` uses a 180-degree gradient from #F02236 to #C61224, white Antonio caps, .1em tracking, 10px corners, a 44px minimum height and `--primary-glow` (0 10px 24px rgba(232,25,44,.3)) plus an inset white highlight at .25 alpha. `.hero` is 56px tall with 20px text and `--primary-glow-hero` (0 14px 34px rgba(232,25,44,.42)).

`.ff-btn-secondary` uses an 8% white fill, a 10% white hairline and 8px corners. Shared Button primary/default variants follow these treatments outside `ff-static`, preserving their API. Keep visible focus, disabled states and descriptive labels.

## Lite and accessibility

`html[data-fx="lite"]` and `prefers-reduced-transparency: reduce` replace glass and sidebar fills with `--glass-solid` rgba(14,16,19,.94), remove backdrop filters, set primary glows and floating shadows to transparent zero shadows, and hide topo rings. All glass consumers, including pseudo-elements, obey these overrides. Inset highlights remain subtle structural edges.

Lite mode and `prefers-reduced-motion: reduce` disable transitions and animations for `html.launcher *`, including pseudo-elements. The existing global reduced-motion safeguard remains in place.

## In-game HUD and static overlay

The War table HUD direction stays solid: no blur, 12px radius and the light `--hud-shadow` (0 6px 18px rgba(0,0,0,.5)). This is the documented target, not an instruction to restyle the shipped overlay in the token task.

**The Static Overlay Rule.** The current `html.ff-static` runtime keeps its existing appearance and geometry: opaque graphite panels, no backdrop filters, no box shadows, no animation and no transitions. Existing HUD tokens remain unchanged. Animated numbers finish immediately. Applying the documented HUD radius and light shadow requires a separate explicit HUD task.

Keep the transparent, frameless, click-through overlay sized to visible panel bounds. Never clip it with `setShape` or `SetWindowRgn`. Preserve the spawn-only terrain heat visualization, its labelled state ramp and its existing lifecycle. Never cover the game's own UI or give HUD content a fixed height.
