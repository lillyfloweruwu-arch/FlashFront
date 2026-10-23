// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mapToSnapshot, MatchRecorder, type RawExtract } from "@flashfront/core";
import { MatchRecordingDetail, NextMatchPlate } from "./StatsTabs";
import type { LauncherApi } from "../../shared";
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("consumes W1's debrief in match detail and the next-match plate, and marks only the own spawn", async () => {
  const r = new MatchRecorder();
  const raw: RawExtract = { inGame: true, visible: true, gameId: "debrief", game: { map: "World" }, tick: 1000,
    me: { alive: true, troops: 600000, maxTroops: 1000000, tiles: 100, outgoingCount: 0 } };
  r.consume(raw, mapToSnapshot(raw));
  const push = { ...raw, tick: 1010, me: { ...raw.me, troops: 200000, outgoingCount: 1, incoming: [{ from: "Incoming", troops: 12345 }] } };
  r.consume(push, mapToSnapshot(push));
  const dead = { ...raw, tick: 1020, me: { ...raw.me, alive: false, troops: 0, tiles: 75 } };
  r.consume(dead, mapToSnapshot(dead));
  const m = r.finish()!; m.spawn = { x: 100, y: 200 };
  const api = { listMatches: async () => [{ file: "one", startedAt: m.startedAt }], getMatch: async () => m } as unknown as LauncherApi;
  await act(async () => root.render(<><MatchRecordingDetail match={m} /><NextMatchPlate api={api} /></>));
  expect(host.querySelectorAll('[aria-label="Death debrief"]')).toHaveLength(2);
  expect(host.textContent).toContain("Reserve before push: 60%"); expect(host.textContent).toContain("After: 20%");
  expect(host.textContent).toContain("Peak incoming: 1.23K"); expect(host.textContent).toContain("Land lost: 25%");
  expect(host.querySelectorAll(".spawn-marker")).toHaveLength(1);
  expect(host.querySelector("img")?.getAttribute("src")).toBe("./minimaps/world.png");
  expect(host.textContent).toContain("CC BY-SA 4.0"); expect(host.textContent).toContain("Map size was not saved");
  const marker = host.querySelector<HTMLElement>(".spawn-marker")!; const before = parseFloat(marker.style.left);
  expect(host.querySelector("select")).toBeNull();
  const compact = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.textContent === "Compact")!;
  await act(async () => compact.click());
  expect(parseFloat(marker.style.left)).toBeCloseTo(before * 2);
});
