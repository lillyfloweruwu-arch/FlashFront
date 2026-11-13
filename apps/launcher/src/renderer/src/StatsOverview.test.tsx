// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type LauncherApi } from "../../shared";
import { StatsOverview } from "./StatsTabs";

let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const recording = (n: number, map: string, outcome: "won" | "eliminated") => ({ file: `r${n}`, gameId: `g${n}`, outcome, map, mode: "FFA", type: "Public",
  startedAt: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`, durationSec: 400, finalRank: 3, sparkline: [], notes: [] });

it("shows trend, record, streaks, best and worst maps and personal bests, without jargon or an ELO chart", async () => {
  const list = [recording(1, "Alps", "won"), recording(2, "Alps", "won"), recording(3, "Alps", "eliminated"),
    recording(4, "World", "eliminated"), recording(5, "World", "eliminated"), recording(6, "World", "won")];
  const stats = vi.fn(async () => ({ status: 200, body: { results: [{ gameId: "g7", map: "World", mode: "FFA", result: "victory", start: "2026-10-20T00:00:00Z" }], nextCursor: "more" } }));
  const api = { listMatches: vi.fn(async () => list), stats } as unknown as LauncherApi;
  await act(async () => root.render(<StatsOverview api={api} settings={{ ...DEFAULT_SETTINGS, publicId: "OWN12345" }} />));
  const text = host.textContent!;
  expect(host.querySelector("[data-trend-hero]")).not.toBeNull();
  expect(text).toContain("Loaded games"); expect(text).toContain("4 won · 3 eliminated · 0 incomplete");
  expect(text).toContain("2 now · best 2");
  expect(text).toContain("Best map"); expect(text).toContain("Alps"); expect(text).toContain("Worst map");
  expect(text).toContain("Personal bests by mode"); expect(text).toContain("FFA");
  for (const jargon of ["Coverage", "s/min", "samples", "ELO"]) expect(text).not.toContain(jargon);
  expect(host.querySelector("svg")).toBeNull();
});

it("says unavailable with no games", async () => {
  const api = { listMatches: vi.fn(async () => []) } as unknown as LauncherApi;
  await act(async () => root.render(<StatsOverview api={api} settings={DEFAULT_SETTINGS} />));
  expect(host.textContent).toContain("Unavailable"); expect(host.textContent).toContain("Your trend appears after your first recorded match.");
});
