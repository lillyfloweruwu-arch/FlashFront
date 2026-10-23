import { expect, it } from "vitest";
import { DEFAULT_HOTKEYS, GAME_KEYS, matchesHotkey, validHotkey, normalizeHotkey } from "./hotkeys";
it("uses the same safe defaults in both hosts", () => {
  expect(DEFAULT_HOTKEYS).toEqual({ toggle: "Ctrl+Alt+H", edit: "Ctrl+Alt+E" });
  expect(Object.values(DEFAULT_HOTKEYS).join()).not.toMatch(/F8/i);
  expect(validHotkey("Ctrl+F8")).toBe(false);
  expect(validHotkey("Shift+F8")).toBe(false);
  expect(validHotkey("F8")).toBe(false);
});
it("requires exact modifiers and supports configurable keys", () => {
  const event = { key: "H", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
  expect(matchesHotkey(event, DEFAULT_HOTKEYS.toggle)).toBe(true);
  expect(matchesHotkey({ ...event, shiftKey: true }, DEFAULT_HOTKEYS.toggle)).toBe(false);
  expect(matchesHotkey({ ...event, key: "j" }, "Ctrl+Alt+J")).toBe(true);
  expect(validHotkey("Ctrl+Ctrl+H")).toBe(false);
});
it("normalizes modifier order and uppercases keys", () => {
  expect(normalizeHotkey("alt+ctrl+h")).toBe("Ctrl+Alt+H");
  expect(normalizeHotkey("shift+f9")).toBe("Shift+F9");
});
it("rejects Shift-only for game keys", () => {
  expect(validHotkey("Shift+R")).toBe(false);
  expect(validHotkey("Ctrl+Alt+R")).toBe(true);
  expect(validHotkey("Ctrl+F8")).toBe(false);
  expect(GAME_KEYS).toContain("R");
  expect(GAME_KEYS).toContain("5");
});
