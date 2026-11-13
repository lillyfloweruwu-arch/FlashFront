import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared";
import { WHATS_NEW, compareVersions, releaseNotesUrl, whatsNewAction } from "./whats-new";

it("orders launcher versions numerically, with prereleases before the release", () => {
  expect(compareVersions("0.2.1", "0.2.0")).toBeGreaterThan(0);
  expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
  expect(compareVersions("0.2.1", "0.2.1")).toBe(0);
  expect(compareVersions("0.2.1-beta.1", "0.2.1")).toBeLessThan(0);
  expect(compareVersions("0.2.0", "0.2.1")).toBeLessThan(0);
});

it("has a bundled 0.2.1 entry with one to three highlights", () => {
  const entry = WHATS_NEW["0.2.1"]!;
  expect(entry.headline.length).toBeGreaterThan(0);
  expect(entry.highlights.length).toBeGreaterThanOrEqual(1);
  expect(entry.highlights.length).toBeLessThanOrEqual(3);
  for (const h of entry.highlights) { expect(h.title).toBeTruthy(); expect(h.text).toBeTruthy(); }
  expect(JSON.stringify(entry)).not.toMatch(/\b(always|must|you should|winners do)\b/i);
});

it("shows What's new once after an update, records first installs silently and never over a match", () => {
  const done = { ...DEFAULT_SETTINGS, setupDone: true };
  // Updated from 0.2.0 (the field did not exist yet) or from an older recorded version: show.
  expect(whatsNewAction(done, "0.2.1", "connected-menu")).toBe("show");
  expect(whatsNewAction({ ...done, lastSeenVersion: "0.2.0" }, "0.2.1", "port-closed")).toBe("show");
  // Not over the game: wait until the match ends.
  expect(whatsNewAction({ ...done, lastSeenVersion: "0.2.0" }, "0.2.1", "connected-game")).toBe("none");
  // Already seen, or a downgrade.
  expect(whatsNewAction({ ...done, lastSeenVersion: "0.2.1" }, "0.2.1", "port-closed")).toBe("none");
  expect(whatsNewAction({ ...done, lastSeenVersion: "0.3.0" }, "0.2.1", "port-closed")).toBe("none");
  // Newer version without a bundled entry (a fix release): record it silently.
  expect(whatsNewAction({ ...done, lastSeenVersion: "0.2.1" }, "0.2.3", "port-closed")).toBe("record");
  // First install: the setup wizard owns the first run and records the version when it finishes.
  expect(whatsNewAction(DEFAULT_SETTINGS, "0.2.1", "port-closed")).toBe("none");
  // Unknown app version (tests, dev without a version): nothing.
  expect(whatsNewAction(done, undefined, "port-closed")).toBe("none");
});

it("links Full notes to the GitHub release tag", () => {
  expect(releaseNotesUrl("0.2.1")).toBe("https://github.com/lillyfloweruwu-arch/FlashFront/releases/tag/v0.2.1");
  expect(() => releaseNotesUrl("0.2.1/../../evil")).toThrow();
});

it("ships matching candidate and final highlights and shows the final release after the candidate", () => {
  expect(WHATS_NEW["0.3.0-rc.1"]!.highlights).toEqual(WHATS_NEW["0.3.0"]!.highlights);
  expect(WHATS_NEW["0.3.0-rc.1"]!.headline).toContain("release candidate");
  expect(WHATS_NEW["0.3.0"]!.highlights).toHaveLength(3);
  const done = { ...DEFAULT_SETTINGS, setupDone: true, lastSeenVersion: "0.3.0-rc.1" };
  expect(whatsNewAction(done, "0.3.0", "connected-menu")).toBe("show");
  expect(whatsNewAction(done, "0.3.0", "connected-game")).toBe("none");
});
