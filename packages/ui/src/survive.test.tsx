// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPin, MockDataSource } from "@flashfront/core";
import { AttackPreview } from "./hud/AttackPreview";
import { BuildPlanner } from "./hud/BuildPlanner";
import { TradePanel } from "./hud/TradePanel";
import { HudRoot } from "./hud/HudRoot";
import { defaultLayout } from "./hud/layout";

let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  document.documentElement.classList.add("ff-static");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); buildPin.clear();
  document.documentElement.classList.remove("ff-static"); vi.unstubAllGlobals();
});
const snapshot = () => {
  const s = new MockDataSource().getSnapshot();
  Object.assign(s, { gameId: "ui-survive", phase: "playing", elapsedSec: 100, tick: 1000 });
  Object.assign(s.self!, { troops: 600000, maxTroops: 1000000, outgoingAttacks: 0, incomingAttacks: [], troopGrowthPerSec: 0, tilesOwned: 100 });
  return s;
};
it("wires the chosen recovery floor, edit pins and displayed decision changes through HudRoot", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const s = snapshot(); const report = vi.fn();
  const render = (paused = false) => act(async () => root.render(<HudRoot snapshot={s} reserveFloor={55} editMode onDecision={report} featureHealth={{ attack: paused ? "paused" : "verified" }} />));
  await render();
  s.tick += 10; s.elapsedSec++; s.self!.troops = 400000; s.self!.outgoingAttacks = 1; await render();
  expect(host.querySelector('[data-panel="decision"]')?.textContent).toContain("55%");
  expect(report).toHaveBeenLastCalledWith(s.gameId, s.tick, expect.objectContaining({ kind: "recovery" }));
  const row = host.querySelector<HTMLElement>('[data-panel="build"] [role="button"]')!;
  expect(row).not.toBeNull(); await act(async () => row.click()); expect(host.textContent).toContain("Saving for");
  await render(true); expect(host.querySelector('[data-panel="decision"] .hud-panel-content')?.textContent).toBe("estimate paused");
  s.tick += 10; s.elapsedSec++; await render();
  expect(host.querySelector('[data-panel="decision"]')?.textContent).not.toContain("Recovering");
  expect(host.querySelector(".last-push")).toBeNull();
});
it("labels net land changes and observation uncertainty in one compact explanation", async () => {
  const s = snapshot();
  const render = () => act(async () => root.render(<AttackPreview self={s.self} snapshot={s} />));
  await render(); s.tick += 10; s.self!.troops = 300000; s.self!.outgoingAttacks = 1; await render();
  s.tick += 10; s.self!.incomingAttacks = [{ from: "Incoming", troops: 1 }]; await render();
  s.tick += 30; s.self!.outgoingAttacks = 0; s.self!.tilesOwned = 90; await render();
  // One line: verdict, net land, "ago". Reasons and combat rules live in match review and Training.
  const line = host.querySelector(".last-push")!;
  expect(line.textContent).toBe("Last push no land · -10 tiles net · 0:00 ago · estimate");
  expect(line.getAttribute("title")).toBe("Estimate: overlapping attacks, observation gaps");
  expect(host.textContent).not.toContain("Common causes");
});

it("pins rows only while editing, supports keyboard unpin, and resets the choice with the game", async () => {
  const s = snapshot(); s.self!.gold = 500; s.self!.goldPerSec = 10;
  s.self!.buildings = [{ type: "City", count: 0, nextCost: 1000 }];
  const render = (editing: boolean) => act(async () => root.render(<BuildPlanner self={s.self} elapsedSec={s.elapsedSec} gameId={s.gameId} editing={editing} />));
  await render(false); await act(async () => (host.querySelector(".build-row") as HTMLElement).click());
  expect(buildPin.get(s.gameId, s.elapsedSec)).toBeUndefined();
  await render(true);
  await act(async () => (host.querySelector('[role="button"]') as HTMLElement).click());
  expect(host.textContent).toContain("Saving for City · 50%");
  expect(buildPin.get(s.gameId, s.elapsedSec)).toBe("City");
  expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
  await act(async () => host.querySelector('[role="button"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(buildPin.get(s.gameId, s.elapsedSec)).toBeUndefined();
  await act(async () => (host.querySelector('[role="button"]') as HTMLElement).click());
  s.gameId = "new"; await render(true);
  expect(host.textContent).not.toContain("Saving for");
});

it("shows separate ship/train income and a signed change without rounding up", () => {
  const html = renderToStaticMarkup(<TradePanel status={{ last60: 190, ship60: 150, train60: 40, prev60: 120, noIncome: false }} />);
  expect(html).toContain("Trade ships"); expect(html).toContain("Trains"); expect(html).toContain("+70");
  const lower = renderToStaticMarkup(<TradePanel status={{ last60: 20, prev60: 120, noIncome: false }} />);
  expect(lower).toContain("-100");
  const missing = renderToStaticMarkup(<TradePanel status={{ noIncome: false }} />);
  expect(missing).toContain("Income counters unavailable."); expect(missing).not.toContain("NaN");
});
// Live 2026-10-18: paused build estimates hid every decision card, even "growth slowing" at 84% of max.
// The growth card shows only while Troop growth is hidden (0.2.1: one owner per message).
it("keeps decision cards when only build estimates are paused, hiding just the idle-gold card", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const s = snapshot(); s.self!.troops = 900000;
  const layout = defaultLayout(1920, 1080); layout.gauge.hidden = true;
  const render = () => act(async () => root.render(<HudRoot snapshot={s} layoutStore={{ load: () => layout, save() {} }} featureHealth={{ build: "paused" }} />));
  for (let i = 0; i < 30; i++) { s.tick += 10; s.elapsedSec++; await render(); }
  const card = host.querySelector('[data-panel="decision"]');
  expect(card?.textContent).toContain("Growth slowing at 90% of max.");
  expect(card?.textContent).not.toContain("estimate paused");
});
