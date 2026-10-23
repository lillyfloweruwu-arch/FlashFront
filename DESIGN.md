---
name: FlashFront
description: Broadcast-grade field instruments for OpenFront, sibling of Flash.
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
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.08em"
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
  panel: "6px"
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
    backgroundColor: "{colors.signature-red}"
    textColor: "#FFFFFF"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "8px 24px"
  button-primary-active:
    backgroundColor: "{colors.signature-red-dim}"
  button-secondary:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.raised-graphite}"
  input:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  hud-module:
    backgroundColor: "{colors.panel-graphite}"
    rounded: "{rounded.panel}"
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
    backgroundColor: "{colors.panel-graphite}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: FlashFront

## Overview

**Creative North Star: "The Broadcast Instrument Panel"**

FlashFront reads like the instrument cluster an esports broadcast would put over a match: flat graphite slabs, one-pixel steel hairlines, small square-capped line icons, and big condensed numerals that can be read in under a second. It is the sibling of Flash and shares its neutrals, its condensed display face and its signature red; the Front bolt mark is its own. The game is the picture and FlashFront is the readout in the corner, so every surface stays quiet, opaque and content-sized.

Density is high and deliberate. A HUD module is 272px wide with a 28px header and compact 12px Inter body; values update in tabular numerals so digits never jitter. The launcher uses the same parts at a calmer pace: a 64px icon rail, a 48px status bar, one big caps state line and a single red action. Colour does the signalling work: neutrals for structure, one red for identity and the primary action, and a separate good/caution/rose/ally set for game state that never borrows the red.

The system turns down the generic dark dashboard: no glass, no blur, no glow, no gradients, no cyan, no grid of equal cards. Depth comes from three graphite steps and hairlines, never from shadow.

**Key Characteristics:**
- Dark only. Three graphite steps (#0A0A0B / #121316 / #1B1D22) plus a #2A2D34 hairline.
- One signature red, kept for the mark, the wordmark's "FRONT", the primary action, active nav, selection, focus and slider thumbs.
- State colours (good, caution, rose, ally) are separate from the red and always come with text labels.
- Antonio in caps for titles and glanceable numerals; Inter for labels, body and small numbers.
- One authored 16px line-icon set: 1.5px stroke, square caps, miter joins, stroked in the current text colour.
- Flat, opaque, hairline-bordered panels with 6px corners. No shadows anywhere.

## Colors

A restrained palette: graphite neutrals and one signature red. Game state gets its own colours, kept apart from the red.

### Primary
- **Signature Red** (signature-red): the product's identity. Used for the mark, "FRONT" in the wordmark, the Launch and Save buttons, the active rail icon, the active theme or tab border, focus outlines, caret, slider thumbs, checkboxes, the edit-mode panel border, and text selection (at 30% alpha). It is also tinted to 8% (accent-soft) as the hover/selected wash on table rows and the self row on leaderboards.
- **Pressed Red** (signature-red-dim): the pressed state of red buttons and the border of pressed controls. Never used as a fill colour at rest.

### Tertiary (state)
- **Sweet-Spot Green** (state-good): gain, done, the growth sweet-spot band, affordable build rows (8% wash), the online connection light, the HUD-on switch border.
- **Spark Amber** (state-caution): over capacity, wasting, idle gold, expiring, version-mismatch notices.
- **Exposed Rose** (state-rose): exposed reserves, incoming attacks, danger, warning coach notes. It is the danger colour so the brand red never has to mean danger.
- **Ally Blue** (state-ally): allies and informational tier badges.

### Neutral
- **Void Black** (void-black): app background, launcher rail, live-preview column, chart dot stroke. Also the launcher window's native background colour.
- **Panel Graphite** (panel-graphite): panels, HUD modules, plates, top status bar, default buttons, tooltips. HUD panels use it at 96% opacity in the launcher and fully opaque in the overlay.
- **Raised Graphite** (raised-graphite): inputs, keycaps, hover fills, active nav, chips, meter and bar tracks.
- **Hairline Steel** (hairline-steel): every border, divider, table rule, chart grid line, scrollbar thumb and slider track.
- **Instrument White** (instrument-white): primary text, big numerals, chart lines, growth markers.
- **Label Grey** (label-grey): labels, captions, module icons, inactive nav, secondary readouts.
- **Faint Grey** (faint-grey): tertiary text and the offline connection light.

### Theme variants
Four themes override only the neutral and state primitives; geometry and type stay fixed. **Front** (id `abyss`) and **Ember** use the exact values above. **Daylight** lifts the graphite steps (#17191D / #24272D / #30343C, edge #505661, muted #BBC1CA). **Signal** is high contrast with a colourblind-safe state set (good #56B4E9, caution #E69F00, rose #D55E00), white text, edge #A6B2C1, and every type size multiplied by 1.15.

### Named Rules
**The One Red Rule.** #E8192C means FlashFront and "do this". It never means a warning, a loss or an enemy; those are rose and amber. If red appears on a surface, it is the mark, the primary action, or the current selection.

**The Labelled State Rule.** A state colour never stands alone. Zone bands, chips and coach notes always carry the state as text ("sweet spot", "exposed", "warning"), so Signal and colourblind players read the same thing.

**The One Vocabulary Rule.** Troop zones are named only through `zoneLabel` in core `attack.ts`: exposed / low / sweet spot / above sweet spot / growth slowing. The growth gauge, attack preview, Training, chips and field reports all use it, and the 70% growth threshold is `atGrowthCap` (truncated percent of max, the same digits the gauge shows) everywhere.

**The Neutral Data Rule.** Charts, countdowns, ranks and avatar letters are drawn in instrument white and grey. Green or rose appears in data only for direction (gain or danger).

## Typography

**Display Font:** Antonio Variable (with Bahnschrift, Arial Narrow)
**Body Font:** Inter 400/500/600 (with Segoe UI, system-ui)

**Character:** A condensed caps display face sets titles like a scoreboard; Inter carries everything you read rather than glance at. Both fonts are self-hosted (fontsource). The in-page HUD path loads no fonts and has to look right on the fallback stack.

### Hierarchy
- **Display** (Antonio 600, 40px, 1.1, caps, +0.08em; the launcher Play state line uses +0.03em): page h1, the Play state line ("READY TO LAUNCH"), placement on the OBS result card.
- **Headline** (Antonio 600, 28px, 1.1): the one glanceable number per module (troop growth), profile metrics, key match stats, avatar letters. OBS numerals go up to 32px.
- **Title** (Antonio 600, 20px, 1.2, caps, +0.08em): section h2s, Next match plate, theme cards, settings sections, table captions, the attack send readout.
- **Module Title** (Antonio 600, 14px, 1, caps, +0.08em): HUD module headers and the launcher's "Field instruments" column heading. This is the only Antonio size below 16px.
- **Body** (Inter 400, 14px, 1.5, tabular): launcher body; launcher paragraphs run at 13px/1.55.
- **Body Compact** (Inter 400, 12px, 1.5, tabular): launcher compact text. In the HUD, module bodies, state lines (zone chips, field reports, last push, goal progress) and table rows are 13px in Compact and 14px in Comfortable; 11px there is only for column headers and labels.
- **Label** (Inter 400, 11px, 1.4): field labels, chips, keycaps, chart axis labels, gauge legends, footnotes. On the OBS stream, labels are set in caps.

Type tokens scale with `--font-scale` (1, or 1.15 in Signal); module titles, chips and the growth headline multiply by it directly.

### Named Rules
**The Glance Number Rule.** A number you read at a glance is set in Antonio at 16px or larger. A number you read closely (build costs, ETAs, gauge values, rates, table cells under 16px) is set in Inter with tabular numerals. Antonio never sets small data.

**The Game Digits Rule.** Every troop, gold and rate value goes through the core formatters, which port OpenFront's `renderNumber`: they truncate and never round up, and troops are divided by 10. FlashFront never shows a digit the game would not.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is on the body, so updating values never shift sideways.

## Layout

**Spacing rhythm.** A 4px base scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64). HUD internals use the 4 to 12 steps; launcher sections use 16 to 48.

**Launcher.** A two-column grid with a 64px rail on the left and a 48px top status bar. Content is padded 32px (24px under 960px). The Play view is `minmax(300px, 1fr)` beside a 296px live-preview column with a 48px gap and a 1040px max width, and the Next match plate spans both columns. The window is 1100×720 by default and has a 900×600 minimum. Under 720px every multi-column grid collapses to one column and the version chip and connection pill are hidden. Composition is left-aligned throughout: no centred hero.

**HUD overlay.** Modules are 272px wide and their height follows their content; reference heights exist only for collision tests. Default positions are authored on a 1920×1080 reference and scaled to the game viewport. Panels snap to an edge within 20px. Event and alliance lists scroll inside a bounded height and never scroll horizontally.

**OBS.** Stream widgets are 420px wide and pinned to one of four corner anchors 16px in. Two widgets go side by side, and a single widget is shown alone.

### Named Rules
**The Game Zones Rule.** HUD modules never cover the game's own UI. The rectangles in `layout.ts` `GAME_UI_ZONES` (leaderboard, hovered player, clock/settings, control panel, events/alliance toasts, music overlay) are no-go areas for default positions, and every new module or default must pass the no-overlap test against them.

**The Content-Sized Rule.** A module is as tall as what it shows. Never give HUD content a fixed height.

## Elevation & Depth

The system is completely flat. `--shadow` is `none` and no surface casts one. Depth comes from tonal steps alone: void black for the canvas, panel graphite for panels, raised graphite for things inside panels (inputs, hover, active nav), with a 1px hairline-steel border separating every layer.

### Named Rules
**The Static Overlay Rule.** The in-game overlay runs under `html.ff-static`. It has no `backdrop-filter`, no `box-shadow`, no animation and no transition, and panels are fully opaque panel graphite. Animated numbers finish instantly in this mode and do not request animation frames, including an update that is already running when the class is added. This was measured live over the game and is not a style preference.

**The Transparent Window Rule.** The overlay is a transparent, frameless, click-through window sized to the bounding box of the visible panels. Never clip it with Electron `setShape` or Win32 `SetWindowRgn`: on Windows (Electron 44) a clipped window paints #202020 outside the clip.

Spawn heat exception (2026-10-18): during spawn only, use the game area minus one pixel row and a
single terrain-masked canvas at 32% alpha. Its labelled Okabe-Ito green / yellow / vermilion data
ramp means room + coast / mixed / crowded or poor; it never uses signature red. This is a map data
visualization, not a decorative glow or gradient. Fade by poll-driven opacity steps, never CSS
animation. Hide at spawn end and return to the normal panel bounds.

## Shapes

Corners are small and consistent: 6px for panels, modules, plates, theme cards and the mark tile at small size; 4px for buttons, inputs, chips, keycaps, tooltips and meters; 2px for swatches, flags and slider tracks. The pill radius is kept for the 44px round rail buttons, the connection status pill and round markers. Every container has a 1px hairline border. Meters are 4px tall and the growth track is 6px. Icons follow a 16px grid with a 1.5px stroke, square caps and miter joins.

## Components

### Buttons
Quiet slabs with one loud exception.
- **Shape:** gently squared (4px).
- **Primary (Launch, Save):** signature red fill, white text, Inter 600, at least 44px tall. Launch is full width with a leading play icon and a 12px gap. Pressed is pressed red.
- **Default:** panel graphite with a hairline border, 8px 12px padding. Hover lifts to raised graphite. Pressed adds a pressed-red border. Disabled is 50% opacity with a not-allowed cursor.
- **Focus:** a 2px signature red outline with a 2px offset on every focusable element.
- **Icon-only:** copy buttons have 6px padding, an aria-label and a title.

### Chips
- **Style:** transparent background, hairline border, 4px radius, 11px Inter in label grey, 0 4px padding. The module-header chip sits at the right of the header (phase, live state). Zone chips swap the border and text to `currentColor` in the state colour.

### HUD Module (signature component)
The core instrument. A 272px panel-graphite slab with a 6px radius and a hairline border. Its 28px header holds a 16px label-grey line icon, a 14px Antonio caps title in instrument white, and an optional right-aligned chip, with a hairline underneath. The body is padded 8px 12px 10px in 12px Inter. Each module leads with at most one Antonio headline number. When an attack is exposed, the module border turns rose. In edit mode, every panel border turns signature red.

### Growth Gauge
A 6px segmented track of state bands at 45% opacity (rose for exposed, amber for low or wasting, green for sweet spot, raised graphite for high). A 2px instrument-white marker shows the current value and a hollow 4px ghost marker shows the post-send value. Under it sits a separate 11px legend with text zone names.

### Build Row
A four-column baseline grid: name, owned, cost, ETA. The last three columns are 20/48/62px and right-aligned. Rows are 28px minimum with a hairline divider and use 12px Inter tabular for every cell. Affordable rows get a green 8% wash. Idle gold gets an amber 8% wash with an amber border.

### Cards / Containers (plates)
- **Corner Style:** 6px.
- **Background:** panel graphite on void black.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px hairline steel.
- **Internal Padding:** 16px (Next match plate, theme cards); 12px for the setup disclosure.

### Inputs / Fields
- **Style:** raised graphite, hairline border, 4px radius, 8px 12px padding. Range sliders have a 4px hairline-steel track and a 14px signature red round thumb. Checkboxes use the red accent colour.
- **Focus:** a 2px signature red outline.

### Navigation
- **Rail:** 64px void-black column with a right hairline. The 32px mark sits on top in a 64px brand cell. Below it are 44px round icon buttons with 20px line icons, in label grey by default. Hover gives a panel-graphite fill and white icon. The active button is a raised-graphite fill with a signature red icon. Labels appear as hover/focus tooltips (raised graphite, hairline, 4px radius, 12px).
- **Status bar:** 48px panel-graphite bar with a bottom hairline holding the wordmark (Antonio 700 at 20px, "FLASH" white, "FRONT" red), a version chip, the rules version, and a right-aligned connection pill with a 6px status light.

### Keycaps
11px Inter, 4px 6px padding, raised graphite, hairline border, 4px radius, one cap per key with a 4px gap.

### Tables
Full-width tables with hairline row rules, 8px 12px cells, label-grey 11px headers in weight 400, and an accent-soft row hover. Numeric cells of 16px and up are set in Antonio.

### Mark
The Front bolt (docs/brand/mark.svg): a graphite tile with a red bolt that doubles as a territory front line. Below 20px it is replaced by the hinted mark-16 (a solid red 3px-radius tile with a white bolt). Never put text inside the mark.

## Do's and Don'ts

### Do:
- **Do** keep #E8192C for the mark, the primary action, active nav, selection and focus only (The One Red Rule).
- **Do** use rose #FF6B8E for danger and incoming attacks, and amber #FFB020 for waste and idle, always with a text label.
- **Do** set glanceable numbers in Antonio at 16px or larger and small data in Inter with tabular numerals.
- **Do** format every game number through the core `renderNumber` formatters.
- **Do** draw every pictogram from the authored 16px icon set (1.5px stroke, square caps, `currentColor`).
- **Do** separate layers with a 1px #2A2D34 hairline and a graphite tonal step.
- **Do** check every HUD default position against `GAME_UI_ZONES`.
- **Do** make the overlay a transparent window sized to the panels' bounding box, with opaque panels under `html.ff-static`.

### Don't:
- **Don't** use backdrop-filter, box-shadow, animation or transition in the in-game overlay.
- **Don't** clip the overlay window with `setShape` or `SetWindowRgn`; Windows paints #202020 outside the clip.
- **Don't** use the signature red for warnings, losses, enemies or chart lines.
- **Don't** add glass, blur, glow, gradients or cyan accents, or lay out grids of equal cards.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** set Antonio below 14px, and never use it for small data.
- **Don't** give HUD modules a fixed content height.
- **Don't** put text inside the mark or use the full mark below 20px.
