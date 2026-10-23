import { buildCost, GOLD_PER_TICK, maxTroops, MockDataSource, normalizeHotkey, RULES_VERSION, TICKS_PER_SECOND, troopGrowthPerSec, validHotkey, type GameSnapshot } from "@flashfront/core";
import type { StatusTone } from "@flashfront/ui";
import type { CdpStatus } from "@flashfront/cdp";
import type { LauncherState, Settings } from "../../shared";
import type { Diagnosis } from "../../main/health";

/**
 * One status system for the launcher (0.2.1 polish, spec item 8): the top bar says one of three
 * things, Play's headline follows state, and Play shows at most one notice. Copy states facts.
 */
export function connectionLabel(status: CdpStatus): { text: "Not connected" | "Connected · Menu" | "Connected · Match"; online: boolean } {
  if (status === "connected-game") return { text: "Connected · Match", online: true };
  if (status === "connected-menu") return { text: "Connected · Menu", online: true };
  return { text: "Not connected", online: false };
}

export function playHeadline(state: Pick<LauncherState, "status" | "launching" | "setupNeeded">): string {
  if (state.status === "connected-game") return "IN MATCH";
  if (state.status === "connected-menu") return "IN MENU";
  if (state.launching || state.status === "searching" || state.status === "disconnected") return "WAITING FOR OPENFRONT";
  if (state.setupNeeded) return "SETUP REQUIRED";
  return "READY TO LAUNCH";
}

/**
 * `setup` marks SETUP REQUIRED. `launchOption` says how Play shows the copyable launch option: "open" next to the
 * explanation (setup required), or "disclosure" folded inside "About Launch Options" (OpenFront simply not running).
 */
export interface PlayNotice { tone: StatusTone; title: string; detail?: string; setup?: boolean; launchOption?: "open" | "disclosure"; note?: string }
export const isShortcutError = (error: string) => error.startsWith("Shortcut ");
export const hasShortcutProblem = (errors: string[]) => errors.some(isShortcutError);
/** State-phrased details where the diagnosis fix reads as an instruction. */
const DETAIL: Partial<Record<Diagnosis["code"], string>> = {
  hotkey: "Settings → Hotkeys marks the shortcut.",
  "not-focused": "The HUD shows while OpenFront is in front.",
};
export function playNotice(state: LauncherState, diagnosis: Diagnosis, message?: { text: string; error?: boolean }): PlayNotice {
  const errors = state.errors.filter(e => !isShortcutError(e));
  if (message?.error) return { tone: "danger", title: message.text };
  if (errors.length) return { tone: "danger", title: errors.at(-1)!, ...(errors.length > 1 ? { detail: `${errors.length - 1} earlier ${errors.length === 2 ? "message" : "messages"} in the support report.` } : {}) };
  if (!state.status.startsWith("connected")) {
    if (state.launching) return { tone: "neutral", title: "Waiting for OpenFront…", detail: "Steam is starting the game. FlashFront connects on its own." };
    const note = message ? { note: message.text } : {};
    if (state.setupNeeded) return { tone: "caution", setup: true, launchOption: "open", title: "OpenFront started without the FlashFront launch option.", ...note };
    return { tone: "neutral", title: "OpenFront is not running.", launchOption: "disclosure", ...note };
  }
  if (diagnosis.code === "hotkey") return { tone: "caution", title: diagnosis.text, detail: DETAIL.hotkey };
  if (state.version && state.version.replace(/^v/, "") !== RULES_VERSION) return { tone: "caution", title: `Formulas were written for OpenFront ${RULES_VERSION}; the game reports ${state.version}.`, detail: "Estimates pause where the numbers no longer match." };
  if (message) return { tone: "neutral", title: message.text };
  if (diagnosis.code === "ok" && !state.hudEnabled) return { tone: "neutral", title: "Connected. HUD is switched off.", detail: `HUD switch below or ${state.settings.toggleHotkey}.` };
  if (diagnosis.code === "ok") return { tone: "success", title: diagnosis.text };
  const detail = DETAIL[diagnosis.code] ?? diagnosis.fix;
  return { tone: "neutral", title: diagnosis.text, ...(detail ? { detail } : {}) };
}

export const HOTKEY_FIELDS = [["toggleHotkey", "Toggle HUD"], ["editHotkey", "Edit HUD"], ["snoozeHotkey", "Snooze"], ["bookmarkHotkey", "Bookmark"]] as const;
export type HotkeyField = typeof HOTKEY_FIELDS[number][0];
/** Per-field shortcut problems: invalid, duplicate of an earlier field, or failed to register when saved. */
export function hotkeyFieldErrors(draft: Settings, saved: Settings, errors: string[]): Partial<Record<HotkeyField, string>> {
  const result: Partial<Record<HotkeyField, string>> = {};
  const seen: { key: string; label: string }[] = [];
  for (const [field, label] of HOTKEY_FIELDS) {
    const value = draft[field];
    if (!validHotkey(value)) { result[field] = "Needs Ctrl, Alt, Shift or Meta plus a letter, number or function key. F8 is reserved."; continue; }
    const key = normalizeHotkey(value);
    const twin = seen.find(s => s.key === key);
    if (twin) { result[field] = `Same as ${twin.label}.`; continue; }
    seen.push({ key, label });
    const failed = errors.some(e => {
      const match = /^Shortcut (.+?) could not register/.exec(e);
      return !!match && validHotkey(match[1]!) && normalizeHotkey(match[1]!) === key && normalizeHotkey(saved[field]) === key;
    });
    if (failed) result[field] = "Could not register: another program may be using it.";
  }
  return result;
}

/**
 * The launcher preview's stand-in when no match is live: a representative mid-game moment
 * (troops at 48% of max, 12 minutes in), labelled "Example", instead of spawn-phase zeros.
 */
export function exampleSnapshot(): GameSnapshot {
  const base = new MockDataSource().getSnapshot();
  const tiles = 2400, cityLevels = 2;
  const max = maxTroops(tiles, cityLevels); const troops = Math.ceil(max * 0.48); // ceil: HUD percentages truncate, so 47.99% would read 47%
  const counts = { City: 2, Port: 1, Factory: 0, DefensePost: 1, MissileSilo: 0, SAMLauncher: 0 } as const;
  return { ...base, gameId: "example", tick: 7200, elapsedSec: 720, phase: "playing", events: [],
    self: { ...base.self!, troops, maxTroops: max, troopGrowthPerSec: troopGrowthPerSec(troops, max), gold: 182_000, goldPerSec: GOLD_PER_TICK * TICKS_PER_SECOND,
      goldEarned: 1_240_000, attackRatio: 0.2, outgoingAttacks: 0, cityLevels, portLevels: 1, factoryLevels: 0, defensePosts: 1, samLaunchers: 0,
      tilesOwned: tiles, tilesOwnedPct: 3.1, rank: 6, incomingAttacks: [], alliances: [],
      buildings: base.self!.buildings.map(b => ({ ...b, count: counts[b.type as keyof typeof counts] ?? 0, nextCost: buildCost(b.type, counts[b.type as keyof typeof counts] ?? 0) })) } };
}

/** Layer 2 rule: the restart prompt shows the incoming release's headline line only. */
export function updateHeadline(notes: string): string | undefined {
  const line = notes.split(/\r?\n/).map(l => l.trim()).find(Boolean);
  if (!line) return undefined;
  // GitHub hands electron-updater the notes as HTML (<p><strong>Headline.</strong> ...</p>), Markdown elsewhere.
  const bold = /^(?:<p>)?(?:\*\*(.+?)\*\*|<strong>(.+?)<\/strong>)/.exec(line);
  const text = (bold ? bold[1] ?? bold[2]! : line).replace(/<[^>]*>/g, "").replace(/^#+\s*/, "");
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").trim() || undefined;
}
