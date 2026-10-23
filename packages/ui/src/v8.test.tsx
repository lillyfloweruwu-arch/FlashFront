// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockDataSource, mapToSnapshot, type RawExtract } from "@flashfront/core";
import { HudRoot } from "./hud/HudRoot";
import { OpeningPanel } from "./hud/OpeningPanel";
import { BuildPlanner } from "./hud/BuildPlanner";
import { AlliancePanel } from "./hud/AlliancePanel";
import { AttackPreview } from "./hud/AttackPreview";
import { GAME_UI_ZONES, stackColumns } from "./hud/layout";
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const snapshot = () => { const s = new MockDataSource().getSnapshot(); s.phase = "playing"; s.elapsedSec = 100; s.tick = 1000; s.map = "World"; return s; };
it("snoozes one decision via edit button, keyboard and launcher signal, and hides in spawn", async () => {
  const s = snapshot(); const store = { load: () => null, save: vi.fn() };
  vi.spyOn(Date, "now").mockReturnValue(100000);
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} editMode />));
  const card = () => host.querySelector('[data-panel="decision"]')!;
  expect(card().textContent).toContain("No ally yet.");
  await act(async () => (card().querySelector(".decision-card button") as HTMLButtonElement).click());
  expect(card().textContent).toContain("No decision active.");
  vi.spyOn(Date, "now").mockReturnValue(220000);
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} />));
  expect(card().textContent).toContain("No ally yet.");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, altKey: true })));
  expect((card() as HTMLElement).hidden).toBe(true);
  vi.spyOn(Date, "now").mockReturnValue(340000);
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} snoozeSignal={0} />));
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} snoozeSignal={1} />));
  expect((card() as HTMLElement).hidden).toBe(true);
  s.phase = "spawn"; await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store} editMode />));
  expect((card() as HTMLElement).hidden).toBe(true);
});
it("shows only the next unchecked opening item and collapses the build list during survival", async () => {
  const s = snapshot();
  const render = () => root.render(<><OpeningPanel snapshot={s} /><BuildPlanner self={s.self} elapsedSec={s.elapsedSec} gameId={s.gameId} map={s.map} /></>);
  await act(async () => render());
  expect(host.querySelectorAll(".opening-checklist li")).toHaveLength(1);
  expect(host.querySelector(".opening-checklist")?.textContent).toContain("Ally a neighbour");
  expect(host.querySelector("details")?.open).toBe(false);
  expect(host.textContent).toContain("Next: Port");
  s.self!.alliances = [{ with: "Ally" }]; await act(async () => render());
  expect(host.querySelector(".opening-checklist")?.textContent).toContain("Build a port");
  s.elapsedSec = 180; await act(async () => render());
  expect(host.querySelectorAll(".opening-checklist li")).toHaveLength(3);
  expect(host.querySelector("details")?.open).toBe(true);
});
it("tracks unknown alliance expiry from formation, resets on removal, and labels renew", async () => {
  const raw: RawExtract = { inGame: true, visible: true, gameId: "alliance", tick: 100, me: { alliances: [{ with: "Alliance 1" }] } };
  const first = mapToSnapshot(raw)!; raw.tick = 2020;
  const later = mapToSnapshot(raw, first)!;
  await act(async () => root.render(<AlliancePanel snapshot={later} />));
  expect(host.textContent).toContain("formed 3:12 ago · alliances last 5:00 by default");
  later.self!.alliances = []; await act(async () => root.render(<AlliancePanel snapshot={later} />));
  later.self!.alliances = [{ with: "Alliance 1" }]; await act(async () => root.render(<AlliancePanel snapshot={later} />));
  expect(host.textContent).toContain("formed 0:00 ago");
  later.self!.alliances[0]!.expiresAtTick = later.tick + 290;
  await act(async () => root.render(<AlliancePanel snapshot={later} />));
  expect(host.querySelector(".warning")?.textContent).toContain("renew");
});
it("renders read-only attack comparisons and highlights the current slider", async () => {
  const s = snapshot(); Object.assign(s.self!, { troops: 3070000, maxTroops: 3810000, attackRatio: 0.2 });
  await act(async () => root.render(<AttackPreview self={s.self} />));
  const table = host.querySelector(".attack-sizes")!;
  expect(table.querySelectorAll("tbody tr")).toHaveLength(3); expect(table.querySelector('[aria-current="true"]')?.textContent).toBe("20%245K · 64%above sweet spot");
  expect(table.querySelector("button,input")).toBeNull();
  expect(host.textContent).not.toMatch(/wasting|always|must|winners|you should|betray/i);
});
it("stacks the decision above growth without touching game UI zones", () => {
  const heights = { decision: 110, gauge: 196, attack: 300, opening: 100 };
  const positions = stackColumns(heights, 1920, 1080);
  expect(positions.decision).toEqual([16, 284]); expect(positions.gauge).toEqual([16, 406]);
  for (const id of Object.keys(heights) as (keyof typeof heights)[]) {
    const [x, y] = positions[id]!;
    expect(y + heights[id]).toBeLessThanOrEqual(1080);
    for (const zone of GAME_UI_ZONES) expect(x < zone.x + zone.width && x + 272 > zone.x && y < zone.y + zone.height && y + heights[id] > zone.y).toBe(false);
  }
});
