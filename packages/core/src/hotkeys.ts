export const DEFAULT_HOTKEYS = Object.freeze({ toggle: "Ctrl+Alt+H", edit: "Ctrl+Alt+E" });
export const GAME_KEYS: readonly string[] = Object.freeze([
  "Q", "E", "W", "A", "S", "D", "C", "M", "T", "Y", "B", "G", "K", "L", "N", "F", "R", "U", "X", "P",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
]);
/** Small shared accelerator grammar; the clipping app's reserved key is excluded. */
export function validHotkey(value: string): boolean {
  const parts = value.split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts;
  if (modifiers.length === 0) return false;
  if (new Set(modifiers.map(p => p.toLowerCase())).size !== modifiers.length) return false;
  if (!modifiers.every(p => /^(Ctrl|Alt|Shift|Meta)$/i.test(p))) return false;
  if (!/^(?:[a-z0-9]|F(?:[1-7]|9|1[0-9]|2[0-4]))$/i.test(key)) return false;
  // Shift alone plus an OpenFront key would fire the game action too.
  if (modifiers.length === 1 && modifiers[0]!.toLowerCase() === "shift" && GAME_KEYS.includes(key.toUpperCase())) return false;
  return true;
}
/** Canonical form for comparing shortcuts: modifiers as Ctrl, Alt, Shift, Meta, then the key upper-cased. */
export function normalizeHotkey(value: string): string {
  const parts = value.split("+");
  const key = (parts.pop() ?? "").toUpperCase();
  const present = new Set(parts.map(p => p.toLowerCase()));
  return [...["Ctrl", "Alt", "Shift", "Meta"].filter(m => present.has(m.toLowerCase())), key].join("+");
}
export function matchesHotkey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">, value: string): boolean {
  if (!validHotkey(value)) return false;
  const parts = value.toLowerCase().split("+");
  return event.key.toLowerCase() === parts.at(-1) && event.ctrlKey === parts.includes("ctrl")
    && event.altKey === parts.includes("alt") && event.shiftKey === parts.includes("shift") && event.metaKey === parts.includes("meta");
}
