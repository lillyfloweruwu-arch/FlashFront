// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsLaunchOption } from "./SettingsLaunchOption";

afterEach(() => vi.unstubAllGlobals());

// 0.2.2 sweep: after editing the debug port, Settings still showed the old port's launch option.
it("editing the debug port shows the new launch option and a Steam note", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const onCopy = vi.fn();
  await act(async () => root.render(<SettingsLaunchOption savedPort={9222} draftPort={9333} onCopy={onCopy} />));
  expect(host.querySelector("code")?.textContent).toBe("%command% --remote-debugging-port=9333");
  expect(host.textContent).toContain("Paste this into OpenFront's Steam Launch Options too, then restart the game.");
  await act(async () => host.querySelector("button")!.click());
  expect(onCopy).toHaveBeenCalledWith("%command% --remote-debugging-port=9333");
  await act(async () => root.render(<SettingsLaunchOption savedPort={9222} draftPort={9222} onCopy={onCopy} />));
  expect(host.querySelector("code")?.textContent).toBe("%command% --remote-debugging-port=9222");
  expect(host.textContent).not.toContain("Steam Launch Options too");
  await act(async () => root.unmount()); host.remove();
});
