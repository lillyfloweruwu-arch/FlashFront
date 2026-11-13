// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { presetJson, type PresetId } from "@flashfront/core";
import { DEFAULT_SETTINGS, type LauncherApi } from "../../shared";
import { ThemesTab } from "./ThemesTab";

it("previews each theme, saves against current settings, and copies catalog IDs only", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const latest = { ...DEFAULT_SETTINGS, reserveFloor: 55 };
  const saveSettings = vi.fn(async () => {});
  const copyPreset = vi.fn(async (_id: PresetId) => {});
  const api = { getState: async () => ({ settings: latest }), saveSettings, copyPreset } as unknown as LauncherApi;
  try {
    await act(async () => root.render(<ThemesTab api={api} settings={DEFAULT_SETTINGS} />));
    expect(host.querySelectorAll(".theme-preview")).toHaveLength(4);
    expect(host.querySelectorAll(".preset-steps")).toHaveLength(5);
    for (const id of ["abyss", "daylight", "ember", "signal"] as const) {
      const article = host.querySelector(`[data-ff-theme="${id}"]`)!.closest("article")!;
      await act(async () => (article.querySelector('[aria-pressed]') as HTMLButtonElement).click());
      expect(saveSettings).toHaveBeenLastCalledWith({ ...latest, theme: id });
      await act(async () => (article.querySelector(".map-preset button") as HTMLButtonElement).click());
      expect(copyPreset).toHaveBeenLastCalledWith(id);
      expect(article.querySelector("pre")!.textContent).toBe(presetJson(id));
    }
    await act(async () => (host.querySelector(".builtin-preset button") as HTMLButtonElement).click());
    expect(copyPreset).toHaveBeenLastCalledWith("colorblind");
    copyPreset.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await act(async () => (host.querySelector(".builtin-preset button") as HTMLButtonElement).click());
    expect(host.querySelector('[role="status"]')!.textContent).toContain("Clipboard unavailable");
    await act(async () => root.render(<ThemesTab api={api} settings={{ ...DEFAULT_SETTINGS, theme: "signal" }} compact />));
    expect(host.querySelector("h1")).toBeNull();
    expect(host.querySelectorAll(".theme-palette")).toHaveLength(4);
    expect(host.querySelectorAll(".theme-active")).toHaveLength(1);
    expect(host.querySelector(".theme-active")!.getAttribute("aria-label")).toBe("Signal");
    await act(async () => (host.querySelector('.theme-active [aria-pressed]') as HTMLButtonElement).click());
    expect(saveSettings).toHaveBeenLastCalledWith({ ...latest, theme: "signal" });
    expect(host.textContent).not.toMatch(/\balways\b|\bmust\b|winners do|betray/i);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
