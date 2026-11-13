// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared";
import { CoachNudgesOption } from "./CoachNudgesOption";

afterEach(() => vi.unstubAllGlobals());

it("coach nudges are on by default and unticking reports false", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () => root.render(<CoachNudgesOption checked={DEFAULT_SETTINGS.nudges} onChange={onChange} />));
  const box = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  expect(host.querySelector("label")?.textContent).toContain("Coach nudges next to the cursor");
  expect(box.checked).toBe(true);
  await act(async () => box.click());
  expect(onChange).toHaveBeenCalledWith(false);
  await act(async () => root.unmount()); host.remove();
});
