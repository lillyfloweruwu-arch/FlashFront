import type { CdpStatus } from "@flashfront/cdp";
import { VERSION_PATTERN, type Settings } from "../../shared";
export { releaseNotesUrl } from "../../shared";

/**
 * In-app What's new (docs/RELEASE-NOTES-FORMAT.md, Layer 2): the 1-3 highlights of each release,
 * bundled with the launcher so they show offline. Copy states what the player gets; no commands.
 */
export interface WhatsNewEntry { headline: string; highlights: { title: string; text: string }[] }
export const WHATS_NEW: Record<string, WhatsNewEntry> = {
  "0.2.2": {
    headline: "Fixes for settings, setup and your desktop shortcut.",
    highlights: [
      { title: "Settings keep what you changed", text: "Saving Settings no longer undoes a text size, HUD preset, stream option or practice goal you changed somewhere else." },
      { title: "Updates keep your desktop shortcut", text: "Auto-updates put the FlashFront shortcut back on your desktop and Start menu if it went missing." },
      { title: "Safer match history", text: "Deleting a match now asks first, so one stray click can't remove a recording." },
    ],
  },
  "0.2.1": {
    headline: "A calmer HUD, a smoother heat map, and one launcher look.",
    highlights: [
      { title: "The HUD says each thing once", text: "Troop growth owns your growth state, and the attack preview leads with what stays home after the send." },
      { title: "Smooth spawn heat", text: "Hold Space and the heat map follows your camera about 60 times a second, and only works while you hold it." },
      { title: "One launcher look", text: "Labelled tabs, one connection status, the same buttons everywhere and a simpler Play screen." },
    ],
  },
};

/** Numeric x.y.z comparison; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => { const dash = v.indexOf("-"); const core = dash < 0 ? v : v.slice(0, dash); return { parts: core.split(".").map(Number), pre: dash < 0 ? undefined : v.slice(dash + 1) }; };
  const x = split(a), y = split(b);
  for (let i = 0; i < 3; i++) { const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0); if (d) return d; }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/**
 * "show": the panel appears (once, until Got it). "record": store the version silently.
 * First runs belong to the setup wizard, which records the version on Finish or Skip. Settings
 * from 0.2.0 have no lastSeenVersion but setupDone is true: those players updated, so they see it.
 */
export function whatsNewAction(settings: Settings, appVersion: string | undefined, status: CdpStatus): "show" | "record" | "none" {
  if (!appVersion || !VERSION_PATTERN.test(appVersion) || !settings.setupDone) return "none";
  if (settings.lastSeenVersion && compareVersions(appVersion, settings.lastSeenVersion) <= 0) return "none";
  if (!WHATS_NEW[appVersion]) return "record";
  return status === "connected-game" ? "none" : "show";
}
