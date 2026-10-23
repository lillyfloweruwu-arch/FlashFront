import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MockDataSource } from "@flashfront/core";
import { GrowthGauge } from "./hud/GrowthGauge";
import { AttackPreview } from "./hud/AttackPreview";
import { defaultLayout, GAME_UI_ZONES, PANEL_HEIGHTS, PANEL_WIDTH, panelIds } from "./hud/layout";

it("keeps every default panel rectangle clear of every game UI zone at 1080p", () => {
  expect(GAME_UI_ZONES).toContainEqual({ id: "toasts", label: "Events / alliance requests", x: 1500, y: 950, width: 420, height: 130 });
  const layout = defaultLayout(1920, 1080);
  for (const id of panelIds) {
    const p = layout[id];
    expect(p.x + PANEL_WIDTH).toBeLessThanOrEqual(1920);
    expect(p.y + PANEL_HEIGHTS[id]).toBeLessThanOrEqual(1080);
    for (const zone of GAME_UI_ZONES) {
      const overlaps = p.x < zone.x + zone.width && p.x + PANEL_WIDTH > zone.x && p.y < zone.y + zone.height && p.y + PANEL_HEIGHTS[id] > zone.y;
      expect(overlaps, `${id} intersects ${zone.id}`).toBe(false);
    }
  }
  expect(layout.self.hidden).toBe(true); expect(layout.clock.hidden).toBe(true);
  expect(panelIds.filter(id => !layout[id].hidden)).toHaveLength(10);
  expect(layout.spawn).toMatchObject({ x: 16, y: 284 });
  expect(defaultLayout(960, 540).gauge.x).toBe(layout.gauge.x / 2);
  expect(defaultLayout(960, 540).build.y).toBe(layout.build.y / 2);
  expect(defaultLayout(390, 844).build.x).toBe(16);
});
it("allows only the bundled spawn minimap image in HUD and separates font imports", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
  for (const file of walk(fileURLToPath(new URL("./hud", import.meta.url)))) {
    const source = readFileSync(file, "utf8").replace('new URL("./heat.worker.ts", import.meta.url)', "");
    if (!file.endsWith("SpawnPanel.tsx")) expect(source, file).not.toMatch(/url\(|<img/i);
    expect(readFileSync(file, "utf8"), file).not.toContain("fonts.css");
  }
  expect(readFileSync(new URL("./theme.css", import.meta.url), "utf8")).not.toContain("@import");
  expect(readFileSync(new URL("./fonts.css", import.meta.url), "utf8")).toContain("@fontsource");
});
it("renders every zone's exact status and the previewed danger/incoming comparison", () => {
  const self = new MockDataSource().getSnapshot().self!; self.maxTroops = 4_300_000;
  const cases = [[0.1, "exposed · under 25% of max"], [0.3, "low · rebuilding"], [0.42, "sweet spot"], [0.6, "above sweet spot"], [0.8, "growth slowing · 70% of max or more"]] as const;
  for (const [fraction, text] of cases) {
    self.troops = fraction * self.maxTroops;
    const html = renderToStaticMarkup(<GrowthGauge self={self} />);
    expect(html).toContain(text); expect(html).toContain("ghost-marker"); expect(html).toContain("current-marker");
  }
  self.troops = 3_000_000; self.attackRatio = 0.8;
  self.incomingAttacks = [{ from: "RetroCityUKF", troops: 130_000 }];
  const html = renderToStaticMarkup(<AttackPreview self={self} />);
  expect(html).toContain("attack-exposed"); expect(html).toContain("This push leaves you exposed.");
  expect(html).toContain("Incoming 13.0K<"); expect(html).not.toContain(" from "); expect(html).toContain("60.0K remaining vs 13.0K incoming");
  expect(html).toContain("Back to sweet spot in"); expect(html).not.toContain("<button");
  self.attackRatio = 0.3;
  expect(renderToStaticMarkup(<AttackPreview self={self} />)).not.toContain("Back to sweet spot in");
  expect(renderToStaticMarkup(<AttackPreview self={null} />)).toContain("spectating");
});
it("stays calm during the spawn phase instead of warning 'exposed'", () => {
  const self = new MockDataSource().getSnapshot().self!; self.maxTroops = 4_300_000; self.troops = 0.1 * self.maxTroops; self.attackRatio = 0.8;
  const gauge = renderToStaticMarkup(<GrowthGauge self={self} phase="spawn" />);
  expect(gauge).toContain("Spawn phase: troops grow once you land.");
  expect(gauge).not.toContain("Exposed");
  const attack = renderToStaticMarkup(<AttackPreview self={self} phase="spawn" />);
  expect(attack).not.toContain("attack-exposed");
  expect(attack).not.toContain("This push leaves you exposed.");
});
