import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MAP_ATTRIBUTION, MockDataSource, spotsFor } from "@flashfront/core";
import { SpawnPanel } from "./hud/SpawnPanel";
import { HudRoot } from "./hud/HudRoot";

it("renders three numbered spots, reasons, community source and attribution only during spawn", () => {
  const snapshot = { phase: "spawn" as const, map: "World" };
  const html = renderToStaticMarkup(<SpawnPanel snapshot={snapshot} />);
  expect(html.match(/class="spawn-marker"/g)).toHaveLength(3);
  for (const n of [1, 2, 3]) expect(html).toContain(`aria-label="Spawn spot ${n}"`);
  expect(html).toContain(MAP_ATTRIBUTION); expect(html).toContain("Spawn spots · World");
  expect(html).toContain("Community tips"); expect(html).toContain("OpenFront Intel");
  expect(html).toContain("./minimaps/world.png"); expect(html).toContain("spawn-chip");
  expect(html).toContain("Terrain-based suggestions, fitted to 145 real games. Terrain explains a small part of results; your call.");
  expect(html).toContain('title="Players with more cheap land within ~120 tiles did better; being next to an AI nation did worse."');
  expect(html).toContain("Why these spots?");
  expect(html.match(/Top \d+% of this map/g)).toHaveLength(3);
  expect(html).not.toMatch(/always|must|winners do|betray/i);
  for (const phase of ["lobby", "playing", "ended"] as const) expect(renderToStaticMarkup(<SpawnPanel snapshot={{ ...snapshot, phase }} />)).toBe("");
});
it("renders saved warnings and preserves terrain percentiles on Compact maps", () => {
  const normal = spotsFor("World")!; const compact = spotsFor("World", "Compact")!;
  expect(compact.picks.map(p => p.percentile)).toEqual(normal.picks.map(p => p.percentile));
  let warnings = 0;
  for (const name of ["Caribbean", "Channel Islands", "Oceania", "Sol"]) {
    const map = spotsFor(name)!;
    const html = renderToStaticMarkup(<SpawnPanel snapshot={{ phase: "spawn", map: name }} />);
    for (const p of map.picks) if (p.warning) { warnings++; expect(html).toContain(p.warning); }
  }
  expect(warnings).toBeGreaterThan(0);
});
it("handles unknown maps, Compact and team-area caveats", () => {
  expect(renderToStaticMarkup(<SpawnPanel snapshot={{ phase: "spawn", map: "missing" }} />)).toContain("No spawn data for this map yet.");
  const html = renderToStaticMarkup(<SpawnPanel snapshot={{ phase: "spawn", map: "Four Islands", mapSize: "Compact" }} />);
  expect(html).toContain("Compact map: picks are approximate"); expect(html).toContain("Team spawn areas");
});
it("takes no HUD space outside spawn, including in edit mode, and replaces gauge and attack during spawn", () => {
  const snapshot = new MockDataSource().getSnapshot(); snapshot.map = "World";
  snapshot.phase = "spawn";
  const html = renderToStaticMarkup(<HudRoot snapshot={snapshot} />);
  expect(html).toMatch(/data-panel="gauge" hidden/); expect(html).toMatch(/data-panel="attack" hidden/);
  expect(html).not.toContain('data-panel="spawn"');
  expect(html).toContain('aria-label="Spawn heat map"');
  snapshot.phase = "playing";
  const playing = renderToStaticMarkup(<HudRoot snapshot={snapshot} editMode />);
  expect(playing).not.toContain('data-panel="spawn"'); expect(playing).not.toMatch(/data-panel="gauge" hidden/);
});
