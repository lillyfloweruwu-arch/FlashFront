// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HotkeyField, chordFromEvent } from "./HotkeyField";

let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const input = () => host.querySelector("input")!;
const press = async (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => { input().dispatchEvent(event); });
  return event;
};
async function mount(value = "Ctrl+Alt+H", error?: string) {
  const onChange = vi.fn();
  await act(async () => root.render(<HotkeyField label="Toggle HUD" value={value} onChange={onChange} error={error} />));
  await act(async () => input().focus());
  return onChange;
}

it("captures one chord in Ctrl/Alt/Shift/Meta order from key presses", async () => {
  const onChange = await mount();
  expect(input().readOnly).toBe(true);
  await press({ key: "Control", code: "ControlLeft", ctrlKey: true });
  await press({ key: "Alt", code: "AltLeft", ctrlKey: true, altKey: true });
  expect(onChange).not.toHaveBeenCalled();
  const event = await press({ key: "k", code: "KeyK", ctrlKey: true, altKey: true });
  expect(onChange).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledWith("Ctrl+Alt+K"); expect(event.defaultPrevented).toBe(true);
  await press({ key: "j", code: "KeyJ", ctrlKey: true, altKey: true });
  expect(onChange).toHaveBeenCalledTimes(1);
});

it("ignores repeats, cancels on Escape, keeps Tab for focus and refuses F8", async () => {
  const onChange = await mount();
  await press({ key: "k", code: "KeyK", ctrlKey: true, altKey: true, repeat: true });
  expect(onChange).not.toHaveBeenCalled();
  await press({ key: "Escape", code: "Escape" });
  expect(input().value).toBe("Ctrl+Alt+H");
  await press({ key: "k", code: "KeyK", ctrlKey: true, altKey: true }); expect(onChange).not.toHaveBeenCalled();
  await act(async () => input().blur()); await act(async () => input().focus());
  const tab = await press({ key: "Tab", code: "Tab" }); expect(tab.defaultPrevented).toBe(false); expect(onChange).not.toHaveBeenCalled();
  for (const mods of [{}, { ctrlKey: true }, { ctrlKey: true, altKey: true, shiftKey: true }]) await press({ key: "F8", code: "F8", ...mods });
  expect(onChange).not.toHaveBeenCalled(); expect(host.textContent).toContain("F8 is reserved.");
});

it("marks an error for screen readers and reads Windows and Linux Ctrl/Meta events alike", async () => {
  await mount("Ctrl+Alt+H", "Already used by Edit layout.");
  expect(input().getAttribute("aria-invalid")).toBe("true");
  expect(chordFromEvent({ key: "M", code: "KeyM", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe("Ctrl+Shift+M");
  expect(chordFromEvent({ key: "1", code: "Digit1", ctrlKey: false, altKey: false, shiftKey: false, metaKey: true })).toBe("Meta+1");
  expect(chordFromEvent({ key: "F5", code: "F5", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe("Alt+F5");
  // Alt changes the character on some layouts; the physical key decides.
  expect(chordFromEvent({ key: "å", code: "KeyA", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe("Alt+A");
  expect(chordFromEvent({ key: "a", code: "KeyA", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined();
});
