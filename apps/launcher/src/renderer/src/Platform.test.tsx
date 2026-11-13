// @vitest-environment jsdom
import { act } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mapToSnapshot, type RawExtract } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi, type LauncherState } from "../../shared";
import { SetupWizard } from "./SetupWizard";

vi.mock("./StatsTabs", () => ({ NextMatchPlate: () => null, MatchesTab: () => null, ProfileTab: () => null }));
let cleanup = async () => {};
// jsdom has no dialog API; the What's new modal calls showModal and close.
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close"); });
const state: LauncherState = { feedbackAvailable: false, status: "connected-game", settings: { ...DEFAULT_SETTINGS, setupDone: true, snoozeHotkey: "Ctrl+Alt+J" }, raw: null, snapshot: null, editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [] };

it("bounds launcher and setup scrolling inside the floating shell", () => {
  const style = document.createElement("style"); style.textContent = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8"); document.head.append(style);
  const host = document.createElement("div"); document.body.append(host);
  try {
    for (const setup of [false, true]) {
      host.innerHTML = `<div class="launcher-shell${setup ? " setup-shell" : ""}"><main class="launcher-content"></main></div>`;
      const shell = getComputedStyle(host.firstElementChild!);
      expect(shell.height).toBe("100vh"); expect(shell.overflow).toBe("hidden");
      expect(shell.position).toBe("relative");
      const content = getComputedStyle(host.querySelector("main")!);
      expect(content.left).toBe(setup ? "18px" : "224px"); expect(content.top).toBe("18px"); expect(content.right).toBe("18px"); expect(content.bottom).toBe("18px"); expect(content.minHeight).toBe("0"); expect(content.overflowY).toBe("auto");
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

it("Play floats a hero, secondary cards and live diagnostics over the map", async () => {
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
  expect(host.querySelectorAll(".play-status")).toHaveLength(1);
  expect(host.querySelector(".launch-button")?.className).toContain("ff-button-primary");
  expect([...host.querySelectorAll(".launcher-tabs button")].map(label => label.textContent)).toEqual(["Play", "Matches", "Profile", "Customize", "Stream", "Settings"]);
  expect(host.textContent).not.toContain("Copy support report");
  expect(host.querySelector(".live-preview")).toBeNull();
  expect(host.querySelectorAll(".play-view .ff-button-primary")).toHaveLength(1);
  expect(host.querySelector(".play-controls.ff-glass")).toBeNull();
  expect(host.querySelector(".play-footer .data-health")).not.toBeNull();
  expect(host.querySelector('[aria-label="Your last spawn"]')).toBeNull();
  await act(async () => publish({ ...current, feedbackAvailable: true, update: { version: "0.2.0", notes: "Spawn alerts", ready: true } }));
  const click = async (text: string) => { const button = [...host.querySelectorAll("button"), ...document.querySelectorAll<HTMLButtonElement>(".whats-new button")].find(b => b.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()); };
  await click("Restart to update"); expect(restartToUpdate).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  await click("Suggest an idea"); expect(suggestIdea).toHaveBeenCalledTimes(1);
  await click("Copy support report"); expect(copySupportReport).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Support report preview"]')?.textContent).toContain("No identifiers.");
  expect([...host.querySelectorAll(".settings-form .ff-button-primary")].map(b => b.textContent)).toEqual(["Save settings"]);
  await click("Copy report"); expect(copySupportReport).toHaveBeenCalledTimes(1);
  for (const name of ["Matches", "Profile", "Settings"]) {
    await act(async () => host.querySelector<HTMLButtonElement>(`.launcher-tabs [aria-label="${name}"]`)!.click());
    expect(host.querySelector(".launcher-backdrop.is-dim")).not.toBeNull();
  }
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  for (const [tab, page] of [["Customize", "Customize"], ["Stream", "Stream studio"]]) {
    content.scrollTop = 350;
    await act(async () => host.querySelector<HTMLButtonElement>(`.launcher-tabs [aria-label="${tab}"]`)!.click());
    expect(content.scrollTop).toBe(0);
    expect(host.querySelector(".launcher-backdrop")?.classList.contains("is-dim")).toBe(tab === "Stream");
    if (tab === "Customize") {
      expect(host.querySelector('[aria-label="Themes"]')).not.toBeNull();
      expect([...host.querySelectorAll(".launcher-content h1")].map(h => h.textContent)).toEqual(["Customize"]);
    }
    expect(host.querySelector(`[aria-label="${page}"]`)).not.toBeNull();
    expect(host.querySelector(`.launcher-tabs [aria-label="${tab}"]`)?.getAttribute("aria-current")).toBe("page");
  }
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  const hotkeys = [...host.querySelectorAll<HTMLLabelElement>('.settings-section label')];
  expect(hotkeys.find(label => label.textContent === "Snooze")?.querySelector("input")?.value).toBe("Ctrl+Alt+J");
  expect(hotkeys.find(label => label.textContent === "Bookmark")?.querySelector("input")?.value).toBe(DEFAULT_SETTINGS.bookmarkHotkey);
  // A shortcut that failed to register: message under its field and a dot on the Settings sidebar icon.
  await act(async () => publish({ ...current, errors: [`Shortcut ${DEFAULT_SETTINGS.bookmarkHotkey} could not register. Choose a different key in Settings.`] }));
  expect(host.querySelector(".launcher-tabs .sidebar-dot")?.closest("button")?.getAttribute("aria-label")).toMatch(/^Settings/);
  expect(host.querySelector('[data-invalid="true"] .field-error')?.textContent).toContain("Could not register");
  expect(host.querySelector('[data-invalid="true"] label')?.textContent).toBe("Bookmark");
  expect(host.querySelector(".tab-notice")).toBeNull();
  await act(async () => publish({ ...current, errors: [] }));
  expect(host.querySelector(".launcher-tabs .sidebar-dot")).toBeNull();
  // What's new: once after an update, Full notes and Got it, re-openable from Settings.
  await act(async () => publish({ ...current, status: "connected-menu", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  expect(document.querySelector("#whats-new-version")?.textContent).toBe("What's new in 0.2.1");
  await click("Release notes"); expect(openReleaseNotes).toHaveBeenCalledWith("0.2.1");
  await click("Got it");
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ lastSeenVersion: "0.2.1" }));
  expect(document.querySelector(".whats-new")).toBeNull();
  await act(async () => publish({ ...current, status: "connected-menu", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.1" } }));
  expect(document.querySelector(".whats-new")).toBeNull();
  await click("What's new in 0.2.1"); expect(document.querySelector(".whats-new")).not.toBeNull();
  // Not over the game: an unseen update waits while a match is live.
  await act(async () => publish({ ...current, status: "connected-game", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  await click("Got it");
  await act(async () => publish({ ...current, status: "connected-game", appVersion: "0.2.1", settings: { ...current.settings, lastSeenVersion: "0.2.0" } }));
  expect(host.querySelector(".whats-new")).toBeNull();
  // Idle readiness and problems keep the hero separate from setup details.
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Play"]')!.click());
  await act(async () => publish({ ...current, status: "port-closed", raw: null, snapshot: null, version: undefined }));
  expect(host.querySelector(".connection-status")?.textContent).toBe("Not connected");
  expect(host.querySelector(".play-controls h1")?.textContent).toBe("Ready for the next match");
  expect(host.querySelector(".play-status")?.textContent).toContain("ready to launch");
  expect(host.querySelector(".play-notice")).toBeNull();
  expect(host.querySelector(".play-footer")).toBeNull();
  expect(host.querySelector(".todays-drill")).toBeNull();
  await act(async () => publish({ ...current, status: "port-closed", raw: null, snapshot: null, setupNeeded: true }));
  expect(host.querySelector(".play-notice.ff-glass .setup-code code")?.textContent).toContain("--remote-debugging-port=");
  expect(host.querySelector(".setup-why summary")?.textContent).toContain("About Launch Options");
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  expect([...host.querySelectorAll(".settings-index a")].map(a => a.textContent)).toEqual(["Coaching", "Overlay", "Hotkeys", "Performance", "Game", "About"]);
  const scrollIntoView = vi.fn();
  host.querySelector("#settings-performance")!.scrollIntoView = scrollIntoView;
  await act(async () => host.querySelector<HTMLAnchorElement>('.settings-index a[href="#settings-performance"]')!.click());
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  expect(host.querySelector('.settings-index [aria-current="location"]')?.textContent).toBe("Performance");
  expect([...host.querySelectorAll(".settings-form .ff-button-primary")].map(b => b.textContent)).toEqual(["Save settings"]);
  expect(host.querySelector('.settings-header button')?.getAttribute("type")).toBe("submit");
  expect(host.querySelectorAll('.settings-form input[type="checkbox"][role="switch"]')).toHaveLength(3);
  expect(document.documentElement.hasAttribute("data-fx")).toBe(false);
  await click("Lite");
  expect(document.documentElement.hasAttribute("data-fx")).toBe(false);
  await click("Save settings");
  expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ visualEffects: "lite" }));
  for (const [lite, visualEffects, expected] of [[false, "lite", "lite"], [true, "full", "lite"], [true, "lite", "lite"], [false, "full", undefined]] as const) {
    await act(async () => publish({ ...current, feedbackAvailable: true, lite, settings: { ...current.settings, visualEffects } }));
    expect(document.documentElement.dataset.fx).toBe(expected);
  }
  await act(async () => publish({ ...current, settings: { ...current.settings, setupDone: false } }));
  expect(host.querySelector(".launcher-backdrop")).not.toBeNull();
  expect(host.querySelector(".launcher-sidebar")).toBeNull();
  const setupContent = host.querySelector(".setup-shell .launcher-content")!;
  expect(setupContent).not.toBeNull(); expect(setupContent.contains(host.querySelector(".launcher-topbar"))).toBe(false);
});

it("aligns Settings hotkey fields to the top and reserves room for the inline error", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "style.css"), "utf8");
  expect(css).toMatch(/\.settings-grid \{[^}]*align-items: start/);
  expect(css).toMatch(/\.settings-field \{[^}]*grid-template-rows: auto minmax\(34px, auto\)/);
});

it("Settings shows Lite mode with what Auto means on this PC", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("flashfront", {});
  const saveSettings = vi.fn(async () => {});
  let publish: (state: LauncherState) => void = () => {};
  window.flashfront = { getState: async () => ({ ...state, weakPc: true }), subscribe: (callback: typeof publish) => { publish = callback; return () => {}; }, saveSettings } as unknown as LauncherApi;
  const host = document.createElement("div"); host.id = "root"; document.body.append(host);
  let root: ReturnType<typeof createRoot> | undefined;
  vi.doMock("react-dom/client", async () => {
    const actual = await vi.importActual<typeof import("react-dom/client")>("react-dom/client");
    return { ...actual, createRoot: (element: HTMLElement) => (root = actual.createRoot(element)) };
  });
  cleanup = async () => { await act(async () => root?.unmount()); host.remove(); vi.doUnmock("react-dom/client"); };
  await act(async () => { await import("./main"); });
  await act(async () => host.querySelector<HTMLButtonElement>('.launcher-tabs [aria-label="Settings"]')!.click());
  const label = [...host.querySelectorAll("label")].find(label => label.textContent?.startsWith("Lite mode"));
  expect(label).toBeDefined();
  const select = label!.querySelector("select")!;
  expect([...select.options].map(option => option.textContent)).toEqual(["Auto", "On", "Off"]);
  expect(host.textContent).toContain("Auto is on for this PC.");
  await act(async () => { select.value = "off"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Save settings")!.click());
  expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ liteMode: "off" }));
  await act(async () => publish({ ...state, weakPc: false }));
  expect(host.textContent).toContain("Auto is off for this PC.");
});
