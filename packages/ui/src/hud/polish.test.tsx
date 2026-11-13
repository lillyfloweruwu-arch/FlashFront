// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPin, InsightFeed, MockDataSource, type GameSnapshot } from "@flashfront/core";
import { HudRoot } from "./HudRoot";
import { GrowthGauge } from "./GrowthGauge";
import { AttackPreview } from "./AttackPreview";
import { BuildPlanner } from "./BuildPlanner";
import { TradePanel } from "./TradePanel";
import { GoalPanel } from "./GoalPanel";
import { DecisionCard } from "./DecisionCard";
import { SpawnHeatmap } from "./SpawnHeatmap";
import { columnOverflow, defaultLayout, LocalStorageLayoutStore } from "./layout";

/** 0.2.1 HUD polish (docs/superpowers/specs/2026-10-19-ui-polish-0.2.1-design.md, items 1-7). */
const BANNED = /always|must|spend|you should|winners|betray|goal missed/i;
/** Copy states facts: no sentence opens with an order ("Establish your foothold.", "Check your defenses."). */
const COMMAND = /(^|[.!:]\s+)(establish|check|change|spend|send|build|hold|switch|choose|turn|use|try|keep|make|go|wait|attack|expand|consider)\b/i;
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); buildPin.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const playing = (): GameSnapshot => {
  const s = new MockDataSource().getSnapshot();
  Object.assign(s, { gameId: "polish", phase: "playing", elapsedSec: 100, tick: 1000, map: "World" });
  Object.assign(s.self!, { troops: 600000, maxTroops: 1000000, outgoingAttacks: 0, incomingAttacks: [], tilesOwned: 100, alliances: [{ with: "player-1" }] });
  return s;
};
const store = (patch: (layout: ReturnType<typeof defaultLayout>) => void = () => {}) => {
  const layout = defaultLayout(1920, 1080); patch(layout); return { load: () => layout, save() {} };
};

it("item 1: the growth gauge states facts, and the decision card leaves routine growth to it", async () => {
  const self = playing().self!;
  const cases = [[0.1, "exposed · under 25% of max"], [0.3, "low · rebuilding"], [0.42, "sweet spot"], [0.6, "above sweet spot"], [0.8, "growth slowing · 70% of max or more"]] as const;
  for (const [fraction, text] of cases) {
    self.troops = fraction * self.maxTroops;
    const html = renderToStaticMarkup(<GrowthGauge self={self} />);
    expect(html).toContain(text); expect(html).not.toMatch(BANNED);
  }
  const s = playing(); s.self!.troops = 900000; s.self!.gold = 0;
  const run = async (layoutStore: ReturnType<typeof store>) => {
    for (let i = 0; i < 30; i++) { s.tick += 10; s.elapsedSec++; await act(async () => root.render(<HudRoot snapshot={s} layoutStore={layoutStore} />)); }
    return host.querySelector('[data-panel="decision"]')!.textContent ?? "";
  };
  expect(await run(store(l => { l.decision.hidden = false; }))).not.toContain("Growth slowing");
  await act(async () => root.unmount()); root = createRoot(host);
  s.gameId = "polish-2"; s.elapsedSec = 100; s.tick = 1000;
  expect(await run(store(l => { l.decision.hidden = false; l.gauge.hidden = true; }))).toContain("Growth slowing at 90% of max.");
});

it("item 1: field reports log zone changes only while the decision card is hidden or snoozed", async () => {
  const s = playing();
  s.events = [{ id: "polish-990-zone-1", tick: 990, kind: "info", text: "Growth slowing · 70% of max or more." }, { id: "polish-995-2", tick: 995, kind: "allianceRequest", text: "Alliance formed with Ember." }];
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store(l => { l.decision.hidden = false; l.events.hidden = false; })} />));
  const events = () => host.querySelector('[data-panel="events"]')!.textContent ?? "";
  expect(events()).toContain("Alliance formed"); expect(events()).not.toContain("Growth slowing");
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store(l => { l.decision.hidden = true; l.events.hidden = false; })} />));
  expect(events()).toContain("Growth slowing");
});

it("item 1: practice goal shows progress, never a mid-match verdict", async () => {
  const s = playing(); s.practiceGoal = { id: "under70", status: "pending" };
  await act(async () => root.render(<GoalPanel goal={s.practiceGoal} snapshot={s} />));
  expect(host.textContent).toContain("Under 70% so far");
  s.self!.troops = 800000; s.practiceGoal = { id: "under70", status: "miss" };
  for (let i = 0; i < 4; i++) { s.tick += 10; s.elapsedSec++; await act(async () => root.render(<GoalPanel goal={s.practiceGoal} snapshot={s} />)); }
  expect(host.textContent).toContain("70% cap: 0:04 over"); expect(host.textContent).not.toMatch(BANNED);
  const port = renderToStaticMarkup(<GoalPanel goal={{ id: "port180", status: "pending" }} snapshot={{ ...s, elapsedSec: 108 }} />);
  expect(port).toContain("Port by 3:00 · 1:12 left");
  for (const status of ["pending", "hit", "miss", "unknown"] as const) for (const id of ["under70", "port180", "reserve35"] as const)
    expect(renderToStaticMarkup(<GoalPanel goal={{ id, status }} snapshot={s} />)).not.toMatch(BANNED);
});

it("mock and field-report event strings state facts, never commands", () => {
  vi.useFakeTimers();
  const source = new MockDataSource({ speed: 20 }); const texts = new Set<string>();
  const off = source.subscribeGame(s => s.events.forEach(e => texts.add(e.text)));
  vi.advanceTimersByTime(45000); off(); vi.useRealTimers();
  const feed = new InsightFeed(); const s = playing(); const me = s.self!;
  const observe = (patch: Partial<typeof me>) => { s.tick += 10; s.elapsedSec++; Object.assign(me, patch); feed.observe(s).forEach(e => texts.add(e.text)); };
  observe({}); observe({ troops: 900000 }); observe({ troops: 100000 }); observe({ incomingAttacks: [{ from: "x", troops: 50000 }] });
  observe({ alliances: [] }); observe({ troops: 500000, incomingAttacks: [] }); observe({ troops: 200000 });
  for (const text of texts) { expect(text, text).not.toMatch(BANNED); expect(text, text).not.toMatch(COMMAND); }
  expect(texts.size).toBeGreaterThan(8);
});

it("practice goal and growth gauge share one truncated 70% threshold", async () => {
  const s = playing(); s.practiceGoal = { id: "under70", status: "pending" };
  s.self!.troops = 0.69999 * s.self!.maxTroops;
  for (let i = 0; i < 4; i++) { s.tick += 10; s.elapsedSec++; await act(async () => root.render(<GoalPanel goal={s.practiceGoal} snapshot={s} />)); }
  expect(renderToStaticMarkup(<GrowthGauge self={s.self} />)).toContain("<strong>69%</strong>");
  expect(host.textContent).toContain("Under 70% so far");
  s.self!.troops = 0.7 * s.self!.maxTroops;
  for (let i = 0; i < 2; i++) { s.tick += 10; s.elapsedSec++; await act(async () => root.render(<GoalPanel goal={s.practiceGoal} snapshot={s} />)); }
  expect(renderToStaticMarkup(<GrowthGauge self={s.self} />)).toContain("<strong>70%</strong>");
  expect(host.textContent).toContain("70% cap: 0:02 over");
});

it("attack preview leads with the send, then reserve, and compares sizes in one compact table", () => {
  const self = playing().self!; Object.assign(self, { troops: 3070000, maxTroops: 3810000, attackRatio: 0.2 });
  host.innerHTML = renderToStaticMarkup(<AttackPreview self={self} />);
  expect(host.querySelector(".attack-headline")?.textContent).toBe("Send 20% 61.4K troops");
  expect(host.querySelector(".send-readout")?.textContent).toContain("Leaves 245K (64%)");
  const table = host.querySelector("table.attack-sizes")!;
  expect([...table.querySelectorAll("th")].map(th => th.textContent)).toEqual(["Send", "Left", "State"]);
  expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(table.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  expect(table.querySelector('[aria-current="true"]')?.textContent).toContain("64%");
  expect(host.textContent).not.toMatch(/\bhigh\b|How attacks resolve|Common causes/i);
});

it("item 4: the gauge labels the now and after markers instead of a legend sentence", () => {
  const self = playing().self!; self.troops = 600000; self.attackRatio = 0.3;
  host.innerHTML = renderToStaticMarkup(<GrowthGauge self={self} />);
  expect(host.textContent).not.toContain("Solid: now");
  expect([...host.querySelectorAll(".gauge-marker-label")].map(el => el.textContent).sort()).toEqual(["after", "now"]);
});

it("item 5: build planner leads with one building and at most two alternatives outside edit mode", async () => {
  const s = playing(); Object.assign(s.self!, { gold: 0, goldPerSec: 1000, troops: 900000 });
  await act(async () => root.render(<BuildPlanner compact self={s.self} elapsedSec={s.elapsedSec} gameId={s.gameId} map={s.map} />));
  expect(host.querySelector(".next-build")?.textContent).toMatch(/^Next: City · affordable in \d+:\d\d · \+25K max/);
  expect(host.querySelectorAll(".build-alt").length).toBeLessThanOrEqual(2);
  expect(host.querySelector(".build-list")).toBeNull();
  await act(async () => root.render(<BuildPlanner compact editing self={s.self} elapsedSec={s.elapsedSec} gameId={s.gameId} map={s.map} />));
  expect(host.querySelector(".build-list")).not.toBeNull();
});

it("item 5: trade leads with income, breakdown on request, one line at zero", () => {
  const compact = renderToStaticMarkup(<TradePanel breakdown={false} status={{ last60: 1220000, ship60: 1000000, train60: 220000, prev60: 900000, share: 0.594, noIncome: false }} />);
  expect(compact).toContain("1.22M"); expect(compact).toContain("last 60s"); expect(compact).toContain("59% of match gold");
  expect(compact).not.toContain("Trade ships");
  const zero = document.createElement("div"); zero.innerHTML = renderToStaticMarkup(<TradePanel breakdown={false} status={{ last60: 0, share: 0, noIncome: true }} />);
  expect(zero.querySelector(".trade-monitor")?.children).toHaveLength(1);
});

it("item 6: spawn heat legend is a docked module with labelled swatches; empty modules hide during spawn", async () => {
  const s = playing(); s.phase = "spawn";
  const html = renderToStaticMarkup(<SpawnHeatmap snapshot={s} held />);
  host.innerHTML = html;
  const legend = host.querySelector("[data-heat-legend]")!;
  expect(legend.classList.contains("hud-panel")).toBe(true);
  expect(legend.querySelector(".panel-title")?.textContent).toBe("Spawn heat");
  host.innerHTML = renderToStaticMarkup(<SpawnHeatmap snapshot={s} held={false} />);
  expect(host.querySelector("[data-heat-legend] kbd")?.textContent).toBe("Space");
  expect(host.querySelector("[data-heat-legend]")?.textContent).toBe("Hold Space: spawn heat");
  s.practiceGoal = { id: "under70", status: "pending" };
  host.innerHTML = renderToStaticMarkup(<HudRoot snapshot={s} layoutStore={store()} />);
  for (const id of ["alliances", "trade", "goal"]) expect((host.querySelector(`[data-panel="${id}"]`) as HTMLElement).hidden, id).toBe(true);
});

it("item 7: outside edit mode the decision card shows the snooze keycap, not a disabled button", () => {
  const decision = { kind: "noAlly" as const, tone: "muted" as const, text: "No ally yet." };
  host.innerHTML = renderToStaticMarkup(<DecisionCard decision={decision} editing={false} onSnooze={() => {}} snoozeHotkey="Ctrl+Alt+J" />);
  expect(host.querySelector("button")).toBeNull();
  expect([...host.querySelectorAll(".ff-keys kbd")].map(k => k.textContent)).toEqual(["Ctrl", "Alt", "J"]);
  host.innerHTML = renderToStaticMarkup(<DecisionCard decision={decision} editing onSnooze={() => {}} snoozeHotkey="Ctrl+Alt+J" />);
  expect(host.querySelector("button:not([disabled])")?.textContent).toContain("Snooze 2 min");
});

it("item 3: reports how far a live column runs past its bound", () => {
  expect(columnOverflow({ decision: 100, gauge: 180, attack: 260 }, 1920, 1080)).toBeLessThanOrEqual(0);
  // Left column 284-940: 300 + 12 + 400 = 712 > 656.
  expect(columnOverflow({ gauge: 300, attack: 400 }, 1920, 1080)).toBe(284 + 712 - 940);
  expect(columnOverflow({ gauge: 150, attack: 200 }, 960, 540)).toBe((284 + 712 - 940) / 2);
});

it("item 13: HUD panels are always opaque; edit mode has no opacity control and loads normalise it", async () => {
  const s = playing();
  await act(async () => root.render(<HudRoot snapshot={s} layoutStore={store(l => { l.gauge.opacity = 0.4; })} editMode />));
  expect(host.querySelector('input[type="range"]')).toBeNull(); expect(host.textContent).not.toContain("Opacity");
  expect((host.querySelector('[data-panel="gauge"]') as HTMLElement).style.opacity).toBe("");
  const saved = defaultLayout(1920, 1080); saved.attack.opacity = 0.5;
  localStorage.setItem("flashfront.hud.v5.1920x1080", JSON.stringify(saved));
  expect(new LocalStorageLayoutStore(1920, 1080).load()?.attack.opacity).toBe(1);
  localStorage.clear();
});
