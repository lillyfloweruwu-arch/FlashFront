// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar, TABS } from "./Sidebar";
import { connectionLabel } from "./launcher-status";

afterEach(() => vi.unstubAllGlobals());
it("orders and groups navigation, follows the selected page and preserves shortcut warnings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), onTab = vi.fn();
  try {
    for (const tab of TABS) {
      await act(async () => root.render(<Sidebar tab={tab} onTab={onTab} status="connected-menu" shortcutProblem />));
      expect([...host.querySelectorAll("button")].map(b => b.textContent)).toEqual(TABS);
      expect(host.querySelector(".sidebar-group")?.textContent).toBe("Make it yours");
      expect(host.querySelector(".sidebar-group")?.previousElementSibling?.textContent).toBe("Profile");
      expect(host.querySelector(".sidebar-group")?.nextElementSibling?.textContent).toBe("Customize");
      expect([...host.querySelectorAll('[aria-current="page"]')].map(b => b.textContent)).toEqual([tab]);
      const settings = host.querySelector<HTMLButtonElement>('[aria-label="Settings: a shortcut could not register"]')!;
      expect(settings.querySelector(".sidebar-dot")).not.toBeNull();
      await act(async () => settings.click());
      expect(onTab).toHaveBeenLastCalledWith("Settings");
    }
  } finally { await act(async () => root.unmount()); }
});

it("uses the existing connection labels and status colours, and only shows a known version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  try {
    for (const status of ["connected-menu", "connected-game", "searching", "disconnected", "port-closed"] as const) {
      await act(async () => root.render(<Sidebar tab="Play" onTab={() => {}} status={status} version="0.35.2" />));
      const chip = host.querySelector('[role="status"]')!;
      expect(chip.textContent).toBe(connectionLabel(status).text);
      expect(chip.classList.contains(connectionLabel(status).online ? "online" : status === "port-closed" ? "error" : "waiting")).toBe(true);
      expect(host.querySelector(".sidebar-version")?.textContent).toBe("OpenFront 0.35.2");
    }
    await act(async () => root.render(<Sidebar tab="Play" onTab={() => {}} status="searching" />));
    expect(host.querySelector(".sidebar-version")).toBeNull();
    expect(host.querySelector(".sidebar-dot")).toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it("returns to Play from the logo", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), onTab = vi.fn();
  try {
    await act(async () => root.render(<Sidebar tab="Settings" onTab={onTab} status="connected-menu" />));
    await act(async () => host.querySelector<HTMLAnchorElement>('[aria-label="FlashFront Play"]')!.click());
    expect(onTab).toHaveBeenLastCalledWith("Play");
  } finally { await act(async () => root.unmount()); }
});
