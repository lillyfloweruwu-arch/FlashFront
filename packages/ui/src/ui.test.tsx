import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MockDataSource } from "@flashfront/core";
import { SelfStatsBar } from "./hud/SelfStatsBar";
import { GrowthGauge } from "./hud/GrowthGauge";
import { BuildPlanner } from "./hud/BuildPlanner";
import { HudRoot } from "./hud/HudRoot";
import { LocalStorageLayoutStore, defaultLayout, isHudLayout, snapPosition } from "./hud/layout";
import { parseStreamOptions, StreamRoot } from "./stream/StreamRoot";
import { MatchDetail } from "./stats/MatchDetail";
import { sortMatches } from "./stats/MatchList";
import { LineChart } from "./charts/LineChart";

afterEach(() => vi.unstubAllGlobals());
describe("HUD persistence", () => {
  it("rejects malformed state and tolerates unavailable storage", () => {
    expect(isHudLayout({})).toBe(false);
    const layout = defaultLayout(1280); expect(isHudLayout(layout)).toBe(true);
    layout.self.opacity = 8; expect(isHudLayout(layout)).toBe(false);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } });
    const store = new LocalStorageLayoutStore(); expect(store.load()).toBeNull();
    expect(() => store.save(defaultLayout(1280))).not.toThrow();
  });
  it("roundtrips and handles invalid JSON", () => {
    let stored = "{";
    vi.stubGlobal("localStorage", { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const store = new LocalStorageLayoutStore(); expect(store.load()).toBeNull();
    const layout = defaultLayout(1200); store.save(layout); expect(store.load()).toEqual(layout);
  });
  it("snaps and bounds panel positions", () => {
    expect(snapPosition(12, 795, 1000, 1000, 200, 200)).toEqual({ x: 0, y: 800 });
    expect(snapPosition(-100, 1500, 1000, 1000, 200, 200)).toEqual({ x: 0, y: 800 });
  });
});
it("parses OBS parameters, filters unknown widgets and bounds scale", () => {
  expect(parseStreamOptions("?widgets=card,unknown,top&scale=2&anchor=br")).toEqual({ widgets: ["card", "top"], scale: 2, anchor: "br" });
  expect(parseStreamOptions("scale=NaN&anchor=nope").scale).toBe(1);
  expect(parseStreamOptions("scale=99").scale).toBe(3);
  expect(parseStreamOptions("widgets=").widgets).toEqual([]);
});
it("renders spectator-safe HUD and SVG charts", () => {
  const snapshot = new MockDataSource().getSnapshot(); snapshot.self = null;
  expect(renderToStaticMarkup(<SelfStatsBar self={null} />)).toContain("Spectating");
  expect(renderToStaticMarkup(<GrowthGauge self={null} />)).toContain("spectating");
  expect(renderToStaticMarkup(<BuildPlanner self={null} elapsedSec={0} gameId="test" />)).toContain("spectating");
  expect(renderToStaticMarkup(<HudRoot snapshot={snapshot} />)).toContain("Field reports");
  expect(renderToStaticMarkup(<LineChart points={[]} label="Empty" />)).toContain("No chart data");
  expect(renderToStaticMarkup(<LineChart points={[{ x: 0, y: 5 }]} label="One point" />)).not.toContain("NaN");
});
it("sorts matches without mutating history and renders all stream/detail surfaces", async () => {
  const source = new MockDataSource(); const profile = (await source.getProfile("self"))!;
  const matches = await source.getMatches("self"); const first = matches[0]!.gameId;
  expect(sortMatches(matches, "placement", "asc")[0]!.placement).toBe(1);
  expect(sortMatches(matches, "date", "asc")[0]!.gameId).toBe(matches.at(-1)!.gameId);
  expect(matches[0]!.gameId).toBe(first);
  const html = renderToStaticMarkup(<StreamRoot snapshot={source.getSnapshot()} profile={profile} lobby={(await source.getLobbies())[0]} result={matches[0]} preview />);
  for (const widget of ["card", "stats", "top", "lobby", "result"]) expect(html).toContain(`data-widget="${widget}"`);
  const detail = renderToStaticMarkup(<MatchDetail match={matches[0]!} />);
  expect(detail).toContain("Buildings constructed"); expect(detail).not.toContain("NaN");
});
