// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type LauncherApi, type LauncherState } from "../../shared";
import { SetupWizard } from "./SetupWizard";

let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label));
  expect(button, label).toBeDefined(); await act(async () => button!.click());
};
const state = { status: "disconnected", settings: DEFAULT_SETTINGS, snapshot: null, raw: null, editing: false, hudEnabled: true, launching: false, setupNeeded: true, errors: [] } as unknown as LauncherState;
const apiWith = (saveSettings: LauncherApi["saveSettings"]) => ({ saveSettings: vi.fn(saveSettings), launch: vi.fn(async () => {}), copySetup: vi.fn(async () => {}) }) as unknown as LauncherApi & { saveSettings: ReturnType<typeof vi.fn>; launch: ReturnType<typeof vi.fn> };
const toReady = async () => { await click("Start setup"); await click("Continue without checking"); await click("Continue"); };

// 0.2.2 sweep: Skip threw away ticked choices, and "Finish and launch" launched after a failed save.
it("Skip keeps a ticked Start hidden", async () => {
  const api = apiWith(async () => {});
  await act(async () => root.render(<SetupWizard api={api} state={state} />));
  await click("Start setup"); await click("Continue without checking");
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await click("Skip setup");
  expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ startHidden: true, setupDone: true }));
});
it("Finish and launch does not launch when saving fails", async () => {
  const api = apiWith(async () => { throw new Error("bad hotkey"); });
  await act(async () => root.render(<SetupWizard api={api} state={state} />));
  await toReady(); await click("Finish and launch OpenFront");
  expect(api.launch).not.toHaveBeenCalled();
  expect(host.textContent).toContain("bad hotkey");
});
it("Finish and launch launches after a good save", async () => {
  const order: string[] = [];
  const api = apiWith(async () => { order.push("save"); });
  api.launch.mockImplementation(async () => { order.push("launch"); });
  await act(async () => root.render(<SetupWizard api={api} state={state} />));
  await toReady(); await click("Finish and launch OpenFront");
  expect(api.launch).toHaveBeenCalledTimes(1);
  expect(order).toEqual(["save", "launch"]);
});
