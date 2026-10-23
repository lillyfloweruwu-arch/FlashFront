// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coachMatch, MatchRecorder, mapToSnapshot, PRACTICE_GOALS, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, parseSettings, type LauncherApi } from "../../shared";
import { MatchesTab, ProfileTab, NextMatchPlate, MatchRecordingDetail } from "./StatsTabs";
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const click = async (label: string) => { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label)); expect(button).toBeDefined(); await act(async () => button!.click()); };

it("teaches the next match from the newest recording and the currently selected goal", async () => {
  const recorder = new MatchRecorder();
  const raw: RawExtract = { inGame: true, visible: true, tick: 0, gameId: "next", game: { map: "World" }, me: { troops: 800000, maxTroops: 1000000 } };
  recorder.consume(raw, mapToSnapshot(raw)); const match = recorder.finish()!;
  const api = { listMatches: vi.fn(async () => [{ file: "older", startedAt: "2026-10-16T00:00:00Z" }, { file: "latest", startedAt: "2026-10-17T00:00:00Z" }]), getMatch: vi.fn(async () => match) } as unknown as LauncherApi;
  await act(async () => root.render(<NextMatchPlate api={api} settings={{ ...DEFAULT_SETTINGS, practiceGoal: "under70" }} />));
  expect(api.getMatch).toHaveBeenCalledWith("latest");
  expect(host.textContent).toContain(coachMatch(match)[0]!.text);
  expect(host.textContent).toContain(PRACTICE_GOALS.under70);
  await act(async () => root.render(<NextMatchPlate api={api} settings={DEFAULT_SETTINGS} recordings={[]} />));
  expect(host.textContent).toContain("Your first coaching note will appear here.");
});

it("omits unrecorded rank and result columns", async () => {
  const api = { listMatches: vi.fn(async () => [{ file: "one", map: "World", mode: "FFA", startedAt: "2026-10-17T00:00:00Z", durationSec: 12, sparkline: [] }]), getMatch: vi.fn(async () => { throw new Error("Unavailable"); }) } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={DEFAULT_SETTINGS} />));
  const headings = [...host.querySelectorAll("th")].map(el => el.textContent);
  expect(headings).not.toContain("Final rank"); expect(headings).not.toContain("Result");
  expect(host.textContent).not.toContain("Rank unknown"); expect(host.textContent).not.toContain("Not recorded");
});
it("uses compact list metrics without fetching full histories", async () => {
  const api = { listMatches: vi.fn(async () => [{ file: "one", map: "World", mode: "FFA", startedAt: "2026-10-17T00:00:00Z", durationSec: 12, sparkline: [], notes: [], coverage: 0.5 }]), getMatch: vi.fn() } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={DEFAULT_SETTINGS} />));
  expect(api.getMatch).not.toHaveBeenCalled(); expect(host.textContent).toContain("50%");
});
it("picks one next-match goal through persisted settings and lists previous goal outcomes", async () => {
  const r = new MatchRecorder();
  const raw: RawExtract = { inGame: true, visible: true, tick: 0, gameId: "goal-fixture", game: { map: "World" }, me: { troops: 800000, maxTroops: 1000000 } };
  r.consume(raw, mapToSnapshot(raw), "under70"); raw.tick = 100; r.consume(raw, mapToSnapshot(raw));
  const match = r.finish()!; let settings = { ...DEFAULT_SETTINGS };
  const api = { getState: vi.fn(async () => ({ settings })),
    saveSettings: vi.fn(async (value: unknown) => { settings = parseSettings(JSON.parse(JSON.stringify(value))); }),
    getMatch: vi.fn(async () => match),
    listMatches: vi.fn(async () => ["hit", "miss", "unknown"].map(status => ({ file: status, map: "World", mode: "FFA", startedAt: match.startedAt, durationSec: 10, sparkline: [], practiceGoal: { id: "under70", status } }))),
  } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={settings} />));
  // A compact Goal column instead of a per-row sub-line.
  const headers = [...host.querySelectorAll(".recordings-table th")].map(th => th.textContent);
  expect(headers).toContain("Goal");
  expect([...host.querySelectorAll(".recordings-table td.goal-cell")].map(td => td.textContent)).toEqual(["hit", "missed", "n/a"]);
  expect(host.querySelector(".recordings-table small")).toBeNull();
  await click("World"); await click("Stay under 70% of max");
  expect(settings.practiceGoal).toBe("under70"); expect(host.textContent).toContain("Saved for next match");
  await act(async () => root.render(<MatchesTab api={api} settings={settings} />));
  expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Stay under 70% of max");
});
it("lists local matches, opens charts and coach notes, reveals JSON, and deletes through the bridge", async () => {
  const r = new MatchRecorder();
  const raw: RawExtract = { inGame: true, visible: true, tick: 0, gameId: "fixture1", game: { map: "World" }, me: { troops: 480_000, maxTroops: 1_000_000, tiles: 1234 } };
  r.consume(raw, mapToSnapshot(raw)); const match = r.finish()!;
  const file = "2026-10-16_000000_World_fixture1.json";
  const api = { listMatches: vi.fn().mockResolvedValueOnce([{ file, map: "World", mode: "FFA", startedAt: match.startedAt, durationSec: 0, sparkline: [{ t: 0, value: 48 }] }]).mockResolvedValue([]),
    getMatch: vi.fn(async () => match), deleteMatch: vi.fn(async () => {}), showMatch: vi.fn(async () => {}) } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} />));
  await click("World"); expect(api.getMatch).toHaveBeenCalledWith(file);
  expect(host.textContent).toContain("Coach notes"); expect(host.querySelector('[aria-label="Land in tiles over time"]')).not.toBeNull();
  expect(host.querySelectorAll("svg rect")).toHaveLength(2);
  await click("Export JSON"); expect(api.showMatch).toHaveBeenCalledWith(file);
  // 0.2.2: Delete asks for confirmation and Cancel keeps the match.
  await click("Delete"); expect(api.deleteMatch).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Delete this match? This can't be undone.");
  await click("Cancel"); expect(api.deleteMatch).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Delete this match?");
  await click("Delete"); await click("Delete match");
  expect(api.deleteMatch).toHaveBeenCalledTimes(1); expect(api.deleteMatch).toHaveBeenCalledWith(file); expect(host.textContent).toContain("No recordings yet");
});
it("loads profile counts and games, finds own ELO on page 2 and follows an opaque cursor", async () => {
  const stats = vi.fn(async (path: string) => ({ status: 200, body:
    path === "/api/player/OWN12345" ? { username: "Own player", clans: [{ tag: "FF" }], stats: { Public: { total: "5", wins: "2" } } }
      : path.includes("page=2") ? { ffa: [{ public_id: "OWN12345", elo: 1337, rank: 51 }] }
        : path.includes("games?") ? { results: [{ gameId: "game222", map: "Europe", result: "defeat" }] }
          : path.endsWith("games") ? { results: [{ gameId: "game111", map: "World", result: "victory" }], nextCursor: "opaque+=" } : {} }));
  const api = { stats, saveSettings: vi.fn(async () => {}) } as unknown as LauncherApi;
  await act(async () => root.render(<ProfileTab api={api} settings={{ ...DEFAULT_SETTINGS, publicId: "OWN12345" }} />));
  expect(host.textContent).toContain("Own player"); expect(host.textContent).toContain("1337 ELO"); expect(host.textContent).toContain("World · victory");
  await click("Load more games"); expect(stats).toHaveBeenCalledWith("/api/player/OWN12345/games?cursor=opaque%2B%3D"); expect(host.textContent).toContain("Europe · defeat");
  await act(async () => root.render(<ProfileTab api={api} settings={DEFAULT_SETTINGS} />));
  expect(host.textContent).toContain("openfront.io/player/<id>"); expect(host.textContent).not.toContain("Own player");
});

it("refreshes the matches list and standalone next-match plate on saved recordings, then unsubscribes", async () => {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null); const match = r.finish()!;
  const listeners = new Set<() => void>(); const unsubscribe = vi.fn();
  const api = { listMatches: vi.fn(async () => []), getMatch: vi.fn(async () => match),
    onMatchesChanged: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); unsubscribe(); }; } } as unknown as LauncherApi;
  await act(async () => root.render(<><MatchesTab api={api} /><NextMatchPlate api={api} /></>));
  vi.mocked(api.listMatches).mockClear(); await act(async () => listeners.forEach(cb => cb()));
  expect(api.listMatches).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null)); expect(listeners.size).toBe(0); expect(unsubscribe).toHaveBeenCalled();
});
it("opens every review section for legacy data without bookmarks, spawn, rankedType or outcome", async () => {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null); const match = r.finish()!;
  delete match.spawn; delete match.rankedType; delete match.outcome; match.events = [];
  await act(async () => root.render(<MatchRecordingDetail match={match} />));
  expect(host.querySelectorAll('[data-track]')).toHaveLength(4);
  expect(host.textContent).toContain("Coach notes"); expect(host.textContent).not.toContain("Death debrief");
  expect(host.textContent).not.toContain("Your spawn");
});

const listItem = (n: number, patch: Record<string, unknown> = {}) => ({ file: `m${n}`, map: n % 2 ? "Europe" : "World", mode: "FFA", type: "Public", startedAt: `2026-10-${String(30 - n).padStart(2, "0")}T00:00:00Z`, durationSec: 200, sparkline: [], notes: [], ...patch });
it("leads Matches with title, filters and Refresh, then one hero trend, the recordings and the briefing once", async () => {
  const list = Array.from({ length: 14 }, (_, n) => listItem(n, { durationSec: n < 10 ? (n < 4 ? 400 : 200) : (n < 13 ? 400 : 100) }));
  const api = { listMatches: vi.fn(async () => list), getMatch: vi.fn() } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={DEFAULT_SETTINGS} />));
  const order = (el: Element | null | undefined) => { expect(el).toBeTruthy(); return [...host.querySelectorAll("*")].indexOf(el!); };
  const title = order(host.querySelector("h1")), filters = order(host.querySelector('[role="radiogroup"][aria-label="Mode"]'));
  const refresh = order([...host.querySelectorAll("button")].find(b => b.textContent === "Refresh"));
  const hero = order(host.querySelector("[data-trend-hero]")), table = order(host.querySelector("table.recordings-table"));
  const briefing = order(host.querySelector('[aria-label="Next match"]'));
  expect(host.querySelector("h1")!.textContent).toBe("Matches");
  expect(title).toBeLessThan(filters); expect(title).toBeLessThan(refresh); expect(filters).toBeLessThan(hero); expect(hero).toBeLessThan(table); expect(table).toBeLessThan(briefing);
  expect(host.querySelectorAll('[aria-label="Next match"]')).toHaveLength(1);
  expect(host.querySelectorAll("[data-trend-hero]")).toHaveLength(1);
  expect(host.querySelector("[data-trend-hero]")!.textContent).toContain("4/10");
  expect(host.querySelector("[data-trend-hero]")!.textContent).toContain("previously 3/4");
  expect(host.querySelector("select")).toBeNull();
  // Secondary trends live behind one disclosure, not as a grid of equal tiles.
  expect(host.querySelector("details.trend-details")?.hasAttribute("open")).toBe(false);
});
it("filters the recordings and the trend by mode and map without native selects", async () => {
  const list = [listItem(1, { mode: "Teams" }), listItem(2), listItem(4)];
  const api = { listMatches: vi.fn(async () => list), getMatch: vi.fn() } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={DEFAULT_SETTINGS} />));
  const radio = (scope: string, text: string) => [...host.querySelectorAll<HTMLButtonElement>(`${scope} [role="radio"]`)].find(b => b.textContent === text)!;
  expect(host.querySelectorAll(".recordings-table tbody tr")).toHaveLength(3);
  await act(async () => radio('[aria-label="Mode"]', "Teams").click());
  expect(host.querySelectorAll(".recordings-table tbody tr")).toHaveLength(1); expect(host.querySelector(".recordings-table tbody")!.textContent).toContain("Europe");
  await act(async () => radio('[aria-label="Mode"]', "All modes").click());
  await act(async () => host.querySelector<HTMLButtonElement>(".map-filter > button")!.click());
  await act(async () => radio(".map-filter-menu", "World").click());
  expect(host.querySelectorAll(".recordings-table tbody tr")).toHaveLength(2); expect(host.querySelector(".recordings-table tbody")!.textContent).not.toContain("Europe");
  expect(host.querySelector(".map-filter-menu")).toBeNull();
});
it("makes the practice goal the hero once it has evaluated matches", async () => {
  const list = ["hit", "miss", "hit"].map((status, n) => listItem(n, { practiceGoal: { id: "under70", status } }));
  const api = { listMatches: vi.fn(async () => list), getMatch: vi.fn() } as unknown as LauncherApi;
  await act(async () => root.render(<MatchesTab api={api} settings={{ ...DEFAULT_SETTINGS, practiceGoal: "under70" }} />));
  const hero = host.querySelector("[data-trend-hero]")!.textContent!;
  expect(hero).toContain("2/3"); expect(hero).toContain("Practice goal hit");
});
