// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type LauncherState } from "../../shared";
import { exampleSnapshot } from "./launcher-status";
import { PlaySpawnPin } from "./PlayPage";

it("plots only known own spawn coordinates on the matching backdrop", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); host.className = "launcher-shell"; document.body.append(host);
  const root = createRoot(host);
  const state: LauncherState = { settings: DEFAULT_SETTINGS, status: "port-closed", snapshot: null, raw: null,
    feedbackAvailable: false, editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };
  try {
    await act(async () => root.render(<PlaySpawnPin state={state} />));
    expect(host.querySelector("svg")).toBeNull();
    const snapshot = { ...exampleSnapshot(), map: "Europe", spawnHeat: { others: [], own: { x: 400, y: 300 },
      camera: { mapWidth: 1000, mapHeight: 800, scale: 1, offsetX: 0, offsetY: 0, left: 0, top: 0, width: 1000, height: 800, viewportWidth: 1000, viewportHeight: 800 } } };
    await act(async () => root.render(<PlaySpawnPin state={{ ...state, snapshot }} />));
    expect(host.querySelector('[aria-label="Your last spawn"]')).not.toBeNull();
    expect(host.querySelector("g")?.getAttribute("transform")).toBe("translate(400 300)");
    expect(host.querySelectorAll(".spawn-halo")).toHaveLength(2);
    for (const invalid of [{ ...snapshot, map: "World" }, { ...snapshot, spawnHeat: { ...snapshot.spawnHeat, own: undefined } },
      { ...snapshot, spawnHeat: { ...snapshot.spawnHeat, own: { x: -1, y: 20 } } }]) {
      await act(async () => root.render(<PlaySpawnPin state={{ ...state, snapshot: invalid }} />));
      expect(host.querySelector("svg")).toBeNull();
    }
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
