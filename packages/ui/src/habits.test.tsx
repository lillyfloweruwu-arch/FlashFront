// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockDataSource } from "@flashfront/core";
import { OpeningPanel } from "./hud/OpeningPanel";
import { TradePanel } from "./hud/TradePanel";
import { AlliancePanel } from "./hud/AlliancePanel";
import { AttackPreview } from "./hud/AttackPreview";
import { EventFeed } from "./hud/EventFeed";
import { HudRoot } from "./hud/HudRoot";
import { defaultLayout, GAME_UI_ZONES, PANEL_WIDTH, stackColumns } from "./hud/layout";

let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const snapshot = () => { const s = new MockDataSource().getSnapshot(); s.phase = "playing"; s.map = "World"; s.elapsedSec = 20; s.tick = 200; return s; };
it("renders unchecked costs, port check marks, completion and the 5:00 cutoff", () => {
  const s = snapshot();
  s.elapsedSec = 180; // Full checklist resumes after survival mode.
  let html = renderToStaticMarkup(<OpeningPanel snapshot={s} />);
  expect(html).toContain("Ally a neighbour"); expect(html).toContain("Build a port"); expect(html).toContain("2:03 to afford");
  expect(html).toContain("45 public FFA games, Oct 2026");
  s.self!.portLevels = 1; html = renderToStaticMarkup(<OpeningPanel snapshot={s} />);
  expect(html).toContain('aria-label="Done"');
  s.self!.cityLevels = 1; s.self!.alliances = [{ with: "Pact" }];
  expect(renderToStaticMarkup(<OpeningPanel snapshot={s} />)).toBe("");
  s.self!.cityLevels = 0; s.elapsedSec = 300;
  expect(renderToStaticMarkup(<OpeningPanel snapshot={s} />)).toBe("");
});
it("renders reserve floor math, trade status and neutral copy", () => {
  const s = snapshot(); s.self!.troops = 300000; s.self!.maxTroops = 430000; s.self!.attackRatio = 0.5;
  const html = renderToStaticMarkup(<><OpeningPanel snapshot={s} /><AttackPreview self={s.self} /><TradePanel status={{ last60: 0, share: 0, noIncome: true }} /></>);
  expect(html).toContain("Send up to 49% · keeps 35%"); expect(html).not.toContain("Max send"); expect(html).toContain("send-readout warning");
  expect(html).toContain("No trade income yet"); expect(html).toContain("Ports send trade ships automatically");
  expect(html).not.toMatch(/always|must|betray|winners|67%/i);
});
it("sorts alliance expiry and shows the caution renew state below 30 seconds", () => {
  const s = snapshot(); s.self!.alliances = [{ with: "Later", expiresAtTick: 810 }, { with: "Soon", expiresAtTick: 800 }, { with: "Urgent", expiresAtTick: 350 }, { with: "Unknown" }];
  const html = renderToStaticMarkup(<AlliancePanel snapshot={s} />);
  expect(html.indexOf("Urgent")).toBeLessThan(html.indexOf("Soon")); expect(html.indexOf("Soon")).toBeLessThan(html.indexOf("Later"));
  expect(html).toContain("renew · "); expect(html).toContain('class="warning"'); expect(html).toContain("Expiry unknown");
  s.self!.alliances = []; s.elapsedSec = 120;
  expect(renderToStaticMarkup(<AlliancePanel snapshot={s} />)).toContain("No active alliance.");
});
it("pins a big incoming row until attacks end, then clears it on a new match", async () => {
  const s = snapshot(); s.self!.troops = 201000; s.self!.incomingAttacks = [{ from: "Own incoming record", troops: 130000 }];
  await act(async () => root.render(<EventFeed snapshot={s} />));
  expect(host.querySelector("li:first-child")?.textContent).toContain("Big attack incoming: 13.0K vs your 20.1K");
  s.tick++; s.self!.incomingAttacks[0]!.troops = 100;
  await act(async () => root.render(<EventFeed snapshot={s} />)); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  s.self!.incomingAttacks = []; await act(async () => root.render(<EventFeed snapshot={s} />)); expect(host.querySelector('[role="alert"]')).toBeNull();
  s.self!.incomingAttacks = [{ from: "Own incoming record", troops: 130000 }]; await act(async () => root.render(<EventFeed snapshot={s} />));
  s.gameId = "new"; s.self!.incomingAttacks[0]!.troops = 100; await act(async () => root.render(<EventFeed snapshot={s} />)); expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("keeps completed opening hidden, offers edit controls for new panels and persists visibility", async () => {
  const s = snapshot(); const store = { load: () => defaultLayout(1920), save: vi.fn() };
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  expect((host.querySelector('[data-panel="opening"]') as HTMLElement).hidden).toBe(false);
  s.self!.portLevels = 1; s.self!.cityLevels = 1; s.self!.alliances = [{ with: "Pact" }];
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  s.self!.portLevels = 0; await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  expect((host.querySelector('[data-panel="opening"]') as HTMLElement).hidden).toBe(true);
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} editMode />));
  for (const title of ["Opening checklist", "Trade monitor", "Practice goal"]) {
    const button = host.querySelector<HTMLButtonElement>(`[aria-label="Hide ${title}"]`); expect(button).not.toBeNull();
    await act(async () => button!.click());
  }
  expect(store.save.mock.calls.at(-1)?.[0]).toMatchObject({ opening: { hidden: true }, trade: { hidden: true }, goal: { hidden: true } });
});
// Real module heights measured from live 1920x1080 screenshots on 2026-10-17 (attack includes the
// exposed warning, events a full list). Positions come from stackColumns, as at runtime.
const LIVE_HEIGHTS = { spawn: 543, gauge: 196, attack: 187, opening: 302, alliances: 91, build: 216, trade: 108, goal: 87, events: 200 } as const;
it("keeps simultaneously visible panels clear of each other and every game UI zone", () => {
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const phases: Record<string, (keyof typeof LIVE_HEIGHTS)[]> = {
    spawn: ["spawn", "alliances", "goal"],
    playing: ["gauge", "attack", "opening", "alliances", "build", "trade", "goal", "events"],
  };
  for (const ids of Object.values(phases)) {
    const pos = stackColumns(Object.fromEntries(ids.map(id => [id, LIVE_HEIGHTS[id]])), 1920, 1080);
    const rects = ids.map(id => ({ id, x: pos[id]![0], y: pos[id]![1], width: PANEL_WIDTH, height: LIVE_HEIGHTS[id] }));
    rects.forEach((rect, i) => {
      for (const other of rects.slice(i + 1)) expect(overlaps(rect, other), `${rect.id}/${other.id}`).toBe(false);
      for (const zone of GAME_UI_ZONES) expect(overlaps(rect, zone), `${rect.id}/${zone.id}`).toBe(false);
      expect(rect.y + rect.height, `${rect.id} bottom`).toBeLessThanOrEqual(1080);
    });
  }
});
// 0.2.0 fixes (drafted by FlashBot, verified here).
it("keeps the danger tone for alliances with 15 seconds or less", () => {
  const s = snapshot();
  s.self!.alliances = [{ with: "Pact", expiresAtTick: s.tick + 100 }];          // 10 s
  expect(renderToStaticMarkup(<AlliancePanel snapshot={s} />)).toContain('class="danger"');
  s.self!.alliances = [{ with: "Pact", expiresAtTick: s.tick + 250 }];          // 25 s
  const html = renderToStaticMarkup(<AlliancePanel snapshot={s} />);
  expect(html).toContain('class="warning"'); expect(html).not.toContain('class="danger"');
});
it("shows the trade monitor for a factory-only economy", async () => {
  const s = snapshot(); s.phase = "playing"; s.self!.portLevels = 0; s.self!.factoryLevels = 1;
  const store = { load: () => defaultLayout(1920), save: vi.fn() };
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  expect((host.querySelector('[data-panel="trade"]') as HTMLElement).hidden).toBe(false);
  s.self!.factoryLevels = 0;
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  expect((host.querySelector('[data-panel="trade"]') as HTMLElement).hidden).toBe(true);
});
