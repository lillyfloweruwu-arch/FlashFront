// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { mapToSnapshot, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi, type LauncherState } from "../../shared";

it("passes saved HUD preferences, own team and raw feature health through the overlay entry point", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.useFakeTimers(); history.replaceState({}, "", "?surface=overlay");
  const raw: RawExtract = { inGame: true, visible: true, gameId: "overlay", tick: 1000, gameVersion: "0.35.2", game: { map: "World" },
    me: { troops: 500000, maxTroops: 1000000, troopRatePerTick: 0, tiles: 1000, outgoingCount: 0, attackRatio: 0.2,
      gold: "150000", goldEarned: "150000", tradeGold: "0", trainGold: "0", portLevels: 1, cityLevels: 0, factoryLevels: 0,
      defensePosts: 0, samLaunchers: 0, silos: 0, incoming: [], alliances: [] } };
  let current: LauncherState = { feedbackAvailable: false, status: "connected-game", settings: { ...DEFAULT_SETTINGS, hudPreset: "economy", textSize: "comfortable", snoozeHotkey: "Ctrl+Alt+J" },
    raw, version: raw.gameVersion, snapshot: mapToSnapshot(raw), editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [],
    overlayViewport: { width: 1920, height: 1080, offsetX: 0, offsetY: 0 } };
  let publish = (_state: LauncherState) => {};
  vi.stubGlobal("flashfront", { getState: async () => current, subscribe: (cb: typeof publish) => { publish = cb; return () => {}; }, reportShape: vi.fn(), reportDecision: vi.fn() } as unknown as LauncherApi);
  const host = document.createElement("div"); host.id = "root"; document.body.append(host);
  let root: ReturnType<typeof createRoot> | undefined;
  vi.doMock("react-dom/client", async () => {
    const actual = await vi.importActual<typeof import("react-dom/client")>("react-dom/client");
    return { ...actual, createRoot: (element: HTMLElement) => (root = actual.createRoot(element)) };
  });
  try {
    await act(async () => { await import("./main"); });
    expect(host.querySelector<HTMLElement>(".hud-layer")?.style.getPropertyValue("--font-scale")).toBe("1.15");
    expect(host.querySelector<HTMLElement>('[data-panel="gauge"]')?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-panel="trade"]')?.hidden).toBe(false);
    // 0.2.1: outside edit mode the snooze shortcut is a keycap hint, not a disabled button.
    expect(host.querySelector(".decision-card button")).toBeNull();
    expect(host.querySelector(".decision-card .ff-keys")?.getAttribute("aria-label")).toContain("Ctrl+Alt+J");
    const missing = { ...raw, me: { ...raw.me, maxTroops: undefined } };
    current = { ...current, raw: missing, snapshot: mapToSnapshot(missing), editing: true };
    await act(async () => publish(current));
    for (const id of ["gauge", "attack", "build", "decision", "opening", "self", "events", "goal"]) {
      const body = host.querySelector(`[data-panel=${id}] .hud-panel-content`);
      if (body) expect(body.textContent).toBe("estimate paused");
      else expect(host.querySelector(`[data-panel=${id}]`)?.textContent).toContain("Hidden outside edit mode.");
    }
    expect(host.querySelector('[data-panel="trade"] .hud-panel-content')?.textContent).toContain("Trade ships");
    const spawn = { ...raw, inSpawnPhase: true, game: { map: "World", mode: "Team" }, me: { ...raw.me, team: "TEAL", teamColor: "#009E73" } };
    current = { ...current, raw: spawn, snapshot: { ...mapToSnapshot(spawn)!, mode: "Teams" }, spawnHeatHeld: false };
    await act(async () => publish(current));
    expect(host.textContent).toContain("Your team: TEAL"); expect(host.textContent).toContain("Hold Space: spawn heat"); expect(host.querySelector("canvas")).toBeNull();
  } finally {
    await act(async () => root?.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.doUnmock("react-dom/client");
    history.replaceState({}, "", "/"); document.documentElement.classList.remove("overlay", "ff-static"); document.body.classList.remove("overlay"); localStorage.clear();
  }
});
