// @vitest-environment jsdom
import { act } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { mapToSnapshot, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi, type LauncherState } from "../../shared";
import { SetupWizard } from "./SetupWizard";

vi.mock("./StatsTabs", () => ({ NextMatchPlate: () => null, MatchesTab: () => null, ProfileTab: () => null }));
let cleanup = async () => {};
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); });
const state: LauncherState = { feedbackAvailable: false, status: "connected-game", settings: { ...DEFAULT_SETTINGS, setupDone: true, snoozeHotkey: "Ctrl+Alt+J" }, raw: null, snapshot: null, editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };

it("bounds launcher and setup scrolling below the 48px drag bar", () => {
  const style = document.createElement("style"); style.textContent = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8"); document.head.append(style);
  const host = document.createElement("div"); document.body.append(host);
  try {
    for (const setup of [false, true]) {
      host.innerHTML = `<div class="launcher-shell${setup ? " setup-shell" : ""}"><header class="launcher-topbar"></header><main class="launcher-content"></main></div>`;
      const shell = getComputedStyle(host.firstElementChild!);
      expect(shell.height).toBe("100vh"); expect(shell.overflow).toBe("hidden");
      expect(shell.gridTemplateRows).toBe("48px minmax(0, 1fr)");
      const content = getComputedStyle(host.querySelector("main")!);
      expect(content.minHeight).toBe("0"); expect(content.overflowY).toBe("auto");
    }
  } finally { host.remove(); style.remove(); }
});

it("shows the setup diagnosis in step two and the local-data copy", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(<SetupWizard api={{} as LauncherApi} state={{ ...state, status: "port-closed" }} />));
  const click = async (text: string) => { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.includes(text))!.click()); };
  await click("Start setup"); expect(host.querySelector('[data-diagnosis="port-closed"]')).not.toBeNull();
  await click("Continue without checking");
  expect([...host.querySelectorAll(".setup-keys .ff-keys")].map(keys => keys.textContent)).toContain("CtrlAltJ");
  await click("Continue");
  expect(host.textContent).toContain("Nothing uploaded unless you send feedback");
  expect([...host.querySelectorAll("button")].every(button => button.classList.contains("ff-button"))).toBe(true);
});

it("records the running version when setup finishes, so a first install opens no What's new", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  const saveSettings = vi.fn(async () => {});
  await act(async () => root.render(<SetupWizard api={{ saveSettings } as unknown as LauncherApi} state={{ ...state, appVersion: "0.2.1", settings: { ...state.settings, setupDone: false } }} />));
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Skip setup")!.click());
  expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ setupDone: true, lastSeenVersion: "0.2.1" }));
});

it("the live preview follows the last push and the build planner's map and spawn context", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  let publish: (state: LauncherState) => void = () => {};
  const raw: RawExtract = { inGame: true, visible: true, gameId: "preview", game: { map: "World" }, tick: 1000, gameVersion: "0.35.2",
    me: { troops: 500000, maxTroops: 1000000, troopRatePerTick: 0, tiles: 1000, outgoingCount: 0, attackRatio: 0.2,
      gold: "150000", goldEarned: "150000", portLevels: 0, cityLevels: 0, factoryLevels: 0, defensePosts: 0, samLaunchers: 0, silos: 0, incoming: [], alliances: [] } };
  let current = { ...state, version: "0.35.2", raw, snapshot: mapToSnapshot(raw) };
  vi.stubGlobal("flashfront", {});
  const restartToUpdate = vi.fn(async () => {}); const suggestIdea = vi.fn(async () => {}); const saveSettings = vi.fn(async () => {}); const openReleaseNotes = vi.fn(async () => {});
  const previewSupportReport = vi.fn(async () => "FlashFront: 0.2.0\nNo identifiers."); const copySupportReport = vi.fn(async () => {});
  window.flashfront = { getState: async () => current, subscribe: (callback: typeof publish) => { publish = callback; return () => {}; }, restartToUpdate, suggestIdea, previewSupportReport, copySupportReport, saveSettings, openReleaseNotes } as unknown as LauncherApi;
  const host = document.createElement("div"); host.id = "root"; document.body.append(host);
  // The entry point owns its initial root. Capture it so the test can unmount cleanly.
  let root: ReturnType<typeof createRoot> | undefined;
  vi.doMock("react-dom/client", async () => {
    const actual = await vi.importActual<typeof import("react-dom/client")>("react-dom/client");
    return { ...actual, createRoot: (element: HTMLElement) => (root = actual.createRoot(element)) };
  });
  cleanup = async () => { await act(async () => root?.unmount()); host.remove(); vi.doUnmock("react-dom/client"); };
  await act(async () => { await import("./main"); });
  const content = host.querySelector<HTMLElement>(".launcher-content")!;
  expect(content.contains(host.querySelector(".launcher-topbar"))).toBe(false);
  expect(content.contains(host.querySelector(".launcher-rail"))).toBe(false);
  // One status system: three top-bar states, a state headline, one notice.
  expect(host.querySelector(".connection-status")?.textContent).toBe("Connected · Match");
  expect(host.querySelector(".play-controls h1")?.textContent).toBe("IN MATCH");
  expect(host.querySelectorAll(".play-controls .ff-status")).toHaveLength(1);
  expect(host.querySelector(".launch-button")?.className).toContain("ff-button-primary");
  expect([...host.querySelectorAll(".launcher-tabs .rail-label")].map(label => label.textContent)).toEqual(["Play", "Matches", "Profile", "Themes", "Layout", "Stream", "Training", "Settings"]);
  // Play is a launch surface: support actions live in Settings; two instruments preview the HUD.
  expect(host.textContent).not.toContain("Copy support report");
  expect(host.querySelector(".preview-chip")?.textContent).toBe("Live");
  expect(host.querySelectorAll(".live-preview .module")).toHaveLength(2);
  expect(host.querySelector(".play-briefing .review-last")).not.toBeNull();
  const update = async (tick: number, troops: number, outgoingCount: number, tiles: number, inSpawnPhase = false) => {
    const next = { ...raw, tick, inSpawnPhase, me: { ...raw.me, troops, outgoingCount, tiles } };
    current = { ...current, raw: next, snapshot: mapToSnapshot(next) }; await act(async () => publish(current));
  };
  await update(1010, 400000, 1, 1000); await update(1020, 410000, 0, 1200);
  expect(host.querySelector(".last-push")?.textContent).toContain("Last push");
  const missing = { ...raw, me: { ...raw.me, maxTroops: undefined } };
  await act(async () => publish({ ...current, raw: missing, snapshot: mapToSnapshot(missing) }));
  expect(host.querySelector(".live-preview")?.textContent).toContain("estimate paused");
  expect(host.querySelector(".attack-preview")).toBeNull();
  await act(async () => publish({ ...current, feedbackAvailable: true, update: { version: "0.2.0", notes: "Spawn alerts", ready: true } }));
  const click = async (text: string) => { const button = [...host.querySelectorAll("button")].find(b => b.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); };
  await click("Restart to update"); expect(restartToUpdate).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  await click("Suggest an idea"); expect(suggestIdea).toHaveBeenCalledTimes(1);
  await click("Copy support report"); expect(copySupportReport).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Support report preview"]')?.textContent).toContain("No identifiers.");
  await click("Copy report"); expect(copySupportReport).toHaveBeenCalledTimes(1);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  for (const [tab, page] of [["Layout", "HUD layout editor"], ["Stream", "Stream studio"], ["Training", "Training room"]]) {
    content.scrollTop = 350;
    await act(async () => host.querySelector<HTMLButtonElement>(`.launcher-tabs [aria-label="${tab}"]`)!.click());
    expect(content.scrollTop).toBe(0);
    expect(host.querySelector(`[aria-label="${page}"]`)).not.toBeNull();
    expect(host.querySelector(`.launcher-tabs [aria-label="${tab}"]`)?.getAttribute("aria-current")).toBe("page");
  }
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  const hotkeys = [...host.querySelectorAll<HTMLLabelElement>('.settings-section label')];
  expect(hotkeys.find(label => label.textContent === "Snooze")?.querySelector("input")?.value).toBe("Ctrl+Alt+J");
  expect(hotkeys.find(label => label.textContent === "Bookmark")?.querySelector("input")?.value).toBe(DEFAULT_SETTINGS.bookmarkHotkey);
  // A shortcut that failed to register: message under its field and a dot on the Settings rail icon.
  await act(async () => publish({ ...current, errors: [`Shortcut ${DEFAULT_SETTINGS.bookmarkHotkey} could not register. Choose a different key in Settings.`] }));
  expect(host.querySelector(".launcher-tabs .rail-dot")?.closest("button")?.getAttribute("aria-label")).toMatch(/^Settings/);
  expect(host.querySelector('[data-invalid="true"] .field-error')?.textContent).toContain("Could not register");
  expect(host.querySelector('[data-invalid="true"] label')?.textContent).toBe("Bookmark");
  expect(host.querySelector(".tab-notice")).toBeNull();
  await act(async () => publish({ ...current, errors: [] }));
  expect(host.querySelector(".launcher-tabs .rail-dot")).toBeNull();
  // What's new: once after an update, Full notes and Got it, re-openable from Settings.
  await act(async () => publish({ ...current, status: "connected-menu", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  expect(host.querySelector(".whats-new h2")?.textContent).toBe("What's new in 0.2.1");
  await click("Full notes"); expect(openReleaseNotes).toHaveBeenCalledWith("0.2.1");
  await click("Got it");
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ lastSeenVersion: "0.2.1" }));
  expect(host.querySelector(".whats-new")).toBeNull();
  await act(async () => publish({ ...current, status: "connected-menu", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.1" } }));
  expect(host.querySelector(".whats-new")).toBeNull();
  await click("What's new in 0.2.1"); expect(host.querySelector(".whats-new")).not.toBeNull();
  // Not over the game: an unseen update waits while a match is live.
  await act(async () => publish({ ...current, status: "connected-game", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  await click("Got it");
  await act(async () => publish({ ...current, status: "connected-game", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  expect(host.querySelector(".whats-new")).toBeNull();
  // No match: the preview shows a labelled mid-game example instead of zero-state alarms.
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Play"]')!.click());
  await act(async () => publish({ ...current, status: "port-closed", raw: null, snapshot: null, version: undefined }));
  expect(host.querySelector(".preview-chip")?.textContent).toBe("Example");
  expect(host.querySelector(".live-preview .growth-headline strong")?.textContent).toBe("48%");
  expect(host.querySelector(".connection-status")?.textContent).toBe("Not connected");
  expect(host.querySelector(".play-controls h1")?.textContent).toBe("READY TO LAUNCH");
  expect(host.querySelectorAll(".play-controls .ff-status")).toHaveLength(1);
  expect(host.querySelector(".play-notice .setup-code code")?.textContent).toContain("--remote-debugging-port=");
  await act(async () => publish({ ...current, settings: { ...current.settings, setupDone: false } }));
  const setupContent = host.querySelector(".setup-shell .launcher-content")!;
  expect(setupContent).not.toBeNull(); expect(setupContent.contains(host.querySelector(".launcher-topbar"))).toBe(false);
});

it("aligns Settings hotkey fields to the top and reserves room for the inline error", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
  expect(css).toMatch(/\.settings-grid \{[^}]*align-items: start/);
  expect(css).toMatch(/\.settings-field \{[^}]*grid-template-rows: auto minmax\(34px, auto\)/);
});
