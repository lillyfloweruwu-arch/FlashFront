export const panelIds = ["clock", "self", "spawn", "decision", "gauge", "attack", "build", "alliances", "events", "opening", "trade", "goal"] as const;
export type PanelId = typeof panelIds[number];
export interface PanelLayout { x: number; y: number; opacity: number; collapsed: boolean; hidden: boolean; }
export type HudLayout = Record<PanelId, PanelLayout>;
export type HudPreset = "custom" | "minimal" | "learning" | "economy";
export interface LayoutStore { load(): HudLayout | null; save(layout: HudLayout): void; }
export function isHudLayout(value: unknown): value is HudLayout {
  if (!value || typeof value !== "object") return false;
  return panelIds.every(id => {
    const p = (value as Partial<HudLayout>)[id];
    return p && [p.x, p.y, p.opacity].every(Number.isFinite) && p.x >= 0 && p.y >= 0 && p.opacity >= 0.2 && p.opacity <= 1 && typeof p.collapsed === "boolean" && typeof p.hidden === "boolean";
  });
}
export class LocalStorageLayoutStore implements LayoutStore {
  readonly key: string;
  constructor(width: number | string = 1920, height = 1080) { this.key = typeof width === "string" ? width : `flashfront.hud.v5.${Math.round(width)}x${Math.round(height)}`; }
  load(): HudLayout | null {
    try {
      const stored = localStorage.getItem(this.key);
      const migrate = stored === null && this.key.startsWith("flashfront.hud.v5.") && !localStorage.getItem(`${this.key}.migrated`);
      const value = JSON.parse(stored ?? (migrate ? localStorage.getItem("flashfront.hud.v4") : null) ?? "null");
      if (value && typeof value === "object" && !value.decision) value.decision = defaultLayout(1920).decision;
      if (!isHudLayout(value)) return null;
      // The overlay is opaque by rule (0.2.1): older per-panel opacity values load as 1.
      for (const id of panelIds) value[id].opacity = 1;
      if (migrate) { localStorage.setItem(this.key, JSON.stringify(value)); localStorage.setItem(`${this.key}.migrated`, "true"); }
      return value;
    } catch { return null; }
  }
  save(layout: HudLayout): void { try { localStorage.setItem(this.key, JSON.stringify(layout)); } catch { /* Storage may be disabled or full; current layout still works. */ } }
  reset(): void { try { localStorage.setItem(`${this.key}.migrated`, "true"); localStorage.removeItem(this.key); } catch { /* Current layout still resets when storage is unavailable. */ } }
}
export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;
export const PANEL_WIDTH = 272;
export interface Rectangle { x: number; y: number; width: number; height: number; }
export const GAME_UI_ZONES: (Rectangle & { id: string; label: string })[] = [
  { id: "leaderboard", label: "Leaderboard", x: 0, y: 0, width: 400, height: 260 },
  { id: "hovered", label: "Hovered player", x: 710, y: 0, width: 500, height: 70 },
  { id: "settings", label: "Clock / settings", x: 1790, y: 0, width: 130, height: 40 },
  { id: "controls", label: "Control panel", x: 710, y: 950, width: 500, height: 130 },
  { id: "toasts", label: "Events / alliance requests", x: 1500, y: 950, width: 420, height: 130 },
  { id: "music", label: "Music overlay", x: 1630, y: 45, width: 270, height: 125 },
];
// Conservative reference footprints for layout validation; never applied as fixed content heights.
export const PANEL_HEIGHTS: Record<PanelId, number> = { decision: 128, clock: 140, self: 180, spawn: 554, gauge: 200, attack: 380, build: 380, alliances: 180, events: 244, opening: 180, trade: 170, goal: 140 };
export const OFF_BY_DEFAULT: readonly PanelId[] = ["decision", "alliances", "build", "opening", "goal", "events"];
export function defaultLayout(width: number, height = REFERENCE_HEIGHT): HudLayout {
  const mobile = width < 720;
  const positions: Record<PanelId, [number, number]> = mobile
    ? { decision: [16, 16], clock: [16, 2340], self: [16, 2520], spawn: [16, 16], gauge: [16, 156], attack: [16, 396], alliances: [16, 800], build: [16, 1000], events: [16, 1450], opening: [16, 1740], goal: [16, 1940], trade: [16, 2100] }
    : { decision: [16, 284], clock: [1328, 190], self: [1328, 350], spawn: [16, 284], gauge: [16, 424], attack: [16, 636], alliances: [1632, 760], build: [1632, 190], events: [1632, 690], opening: [16, 700], goal: [1632, 576], trade: [1632, 440] };
  return Object.fromEntries(panelIds.map(id => [id, {
    x: positions[id][0] * (mobile ? 1 : width / REFERENCE_WIDTH),
    y: positions[id][1] * (mobile ? 1 : height / REFERENCE_HEIGHT),
    opacity: 1, collapsed: false, hidden: OFF_BY_DEFAULT.includes(id),
  }])) as HudLayout;
}
export function presetLayout(preset: HudPreset, width: number, height = REFERENCE_HEIGHT): HudLayout {
  const layout = defaultLayout(width, height);
  if (preset === "custom") return layout;
  const visible: readonly PanelId[] = preset === "minimal" ? ["decision", "gauge", "attack"]
    : preset === "economy" ? ["decision", "build", "trade", "goal"] : panelIds;
  for (const id of panelIds) layout[id].hidden = !visible.includes(id);
  return layout;
}
/** Measured edit panels can be taller than their live readouts; spill inward before covering game UI. */
export function arrangePanels(heights: Partial<Record<PanelId, number>>, width: number, height: number): Partial<Record<PanelId, [number, number]>> {
  const sx = width / REFERENCE_WIDTH, sy = height / REFERENCE_HEIGHT;
  const occupied: Rectangle[] = GAME_UI_ZONES.map(z => ({ x: z.x * sx, y: z.y * sy, width: z.width * sx, height: z.height * sy }));
  const out: Partial<Record<PanelId, [number, number]>> = {};
  const panelWidth = Math.min(PANEL_WIDTH, width - 32);
  const xs = [16, width - panelWidth - 16];
  for (let x = panelWidth + 28; x + panelWidth < width - 16; x += panelWidth + 12) xs.push(x);
  for (const column of HUD_COLUMNS) for (const id of column.ids) {
    const h = heights[id]; if (h === undefined) continue;
    const ys = [...new Set([16, ...occupied.map(p => Math.ceil(p.y + p.height + 12))])].sort((a, b) => a - b);
    const preferred = column.x > REFERENCE_WIDTH / 2 ? [xs[1]!, xs[0]!, ...xs.slice(2).reverse()] : xs;
    let position: [number, number] | undefined;
    for (const x of preferred) {
      const y = ys.find(y => y + h <= height - 12 && !occupied.some(p => x < p.x + p.width + 8 && x + panelWidth + 8 > p.x && y < p.y + p.height + 8 && y + h + 8 > p.y));
      if (y !== undefined) { position = [x, y]; break; }
    }
    if (!position) continue;
    out[id] = position; occupied.push({ x: position[0], y: position[1], width: panelWidth, height: h });
  }
  return out;
}
export function snapPosition(x: number, y: number, width: number, height: number, panelWidth: number, panelHeight: number) {
  const maxX = Math.max(0, width - panelWidth); const maxY = Math.max(0, height - panelHeight);
  const snap = (v: number, max: number) => v < 20 ? 0 : v > max - 20 ? max : Math.min(max, Math.max(0, v));
  return { x: snap(x, maxX), y: snap(y, maxY) };
}
/** Default HUD columns: every module sits in a side column, never over the middle of the map. */
export const HUD_COLUMNS: { x: number; y: number; bottom: number; ids: PanelId[] }[] = [
  // Live columns are bounded (0.2.1): left 284-940, right 190-938 at 1080p, clear of the control panel and toasts.
  { x: 16, y: 284, bottom: 940, ids: ["spawn", "decision", "gauge", "attack", "opening"] },
  // Alliances sit on the right: the left column is full once the opening checklist shows (measured 302px).
  { x: 1632, y: 190, bottom: 938, ids: ["build", "trade", "goal", "alliances", "events", "clock", "self"] },
];
/**
 * Stack the visible panels (measured heights in px) top-down in their column with a 12px gap, so
 * hidden panels leave no holes and nothing overlaps. Coordinates scale from the 1920×1080 reference.
 */
export function stackColumns(heights: Partial<Record<PanelId, number>>, width: number, height: number): Partial<Record<PanelId, [number, number]>> {
  const sx = width / REFERENCE_WIDTH; const sy = height / REFERENCE_HEIGHT;
  const out: Partial<Record<PanelId, [number, number]>> = {};
  for (const column of HUD_COLUMNS) {
    let y = column.y * sy;
    for (const id of column.ids) {
      const h = heights[id];
      if (h === undefined) continue;
      out[id] = [Math.round(column.x * sx), Math.round(y)];
      y += h + 12 * sy;
    }
  }
  return out;
}
/**
 * How many pixels the tallest live column runs past its bottom bound (<= 0 when everything fits).
 * HudRoot drops optional detail in priority order until this is no longer positive.
 */
export function columnOverflow(heights: Partial<Record<PanelId, number>>, _width: number, height: number): number {
  const sy = height / REFERENCE_HEIGHT;
  return Math.max(...HUD_COLUMNS.map(column => {
    const shown = column.ids.map(id => heights[id]).filter((h): h is number => h !== undefined);
    const used = shown.reduce((sum, h) => sum + h, 0) + Math.max(0, shown.length - 1) * 12 * sy;
    return column.y * sy + used - column.bottom * sy;
  }));
}
