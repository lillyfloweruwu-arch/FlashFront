import { useState } from "react";
import { normalizeHotkey, validHotkey } from "@flashfront/core";

type KeyInput = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;
const MODIFIER_KEYS = new Set(["Control", "Alt", "AltGraph", "Shift", "Meta", "OS"]);
const isModifier = (e: KeyInput) => MODIFIER_KEYS.has(e.key);
/** The physical key, so layouts where Alt or Shift change the character still name the same key. */
function keyName(e: KeyInput): string {
  const code = /^Key([A-Z])$/.exec(e.code)?.[1] ?? /^Digit([0-9])$/.exec(e.code)?.[1] ?? /^(F[0-9]{1,2})$/.exec(e.code)?.[1];
  return code ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
}
/** A valid normalized chord, "reserved" for F8 (Flash clipping), or undefined for anything else. */
export function chordFromEvent(e: KeyInput): string | "reserved" | undefined {
  if (isModifier(e)) return undefined;
  const key = keyName(e);
  if (key === "F8") return "reserved";
  const chord = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta", key].filter(Boolean).join("+");
  return validHotkey(chord) ? normalizeHotkey(chord) : undefined;
}

/** Read-only shortcut field: focus it and press the keys. It only edits the draft; Settings Save registers it. */
export function HotkeyField({ value, onChange, label, error, describedBy }: { value: string; onChange: (value: string) => void; label: string; error?: string; describedBy?: string }) {
  const [capturing, setCapturing] = useState(false);
  const [note, setNote] = useState("");
  return <>
    <label>{label}<input className="hotkey-input" readOnly value={capturing ? "Press keys…" : value} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
      aria-description="Focus, then press the new shortcut. Escape cancels."
      onFocus={() => { setCapturing(true); setNote(""); }} onBlur={() => setCapturing(false)} onClick={() => setCapturing(true)}
      onKeyDown={e => {
        if (e.key === "Tab") return;
        if (!capturing) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCapturing(true); } return; }
        if (e.key === "Escape") { e.preventDefault(); setCapturing(false); setNote(""); return; }
        if (isModifier(e.nativeEvent)) return;
        e.preventDefault();
        if (e.repeat) return;
        const chord = chordFromEvent(e.nativeEvent);
        if (chord === "reserved") { setNote("F8 is reserved."); return; }
        if (!chord) { setNote("Use Ctrl, Alt, Shift or Meta with a letter, number or function key."); return; }
        setCapturing(false); setNote(""); onChange(chord);
      }} /></label>
    {note && <p className="muted hotkey-note" role="status">{note}</p>}
  </>;
}
