// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { formatMatchDate } from "./shared";
import { THEMES, applyTheme } from "./themes";

const here = dirname(fileURLToPath(import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

it("reserves signature red and its aliases for branding and interaction, never data or charts", () => {
  for (const folder of ["charts", "stream", "hud"]) {
    for (const file of walk(join(here, folder)).filter(f => /\.(tsx?|css)$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/--ff-red|var\(--(?:primary|accent)\)|className="(?:accent|primary)"/);
    }
  }
  const css = readFileSync(join(here, "theme.css"), "utf8");
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    // Red initials tile is explicit branding in the approved 0.3.0 stream design.
    if (rule[1]!.trim() === ".stream-root .avatar") continue;
    if (/\.(?:chart|bar-fill|avatar|spawn-(?:marker|pick-number|chip)|player-card|lobby-count)/.test(rule[1]!)) {
      expect(rule[2], rule[1]).not.toMatch(/--ff-red|var\(--(?:primary|accent|accent-soft)\)/);
    }
  }
  expect(css.match(/--chart-area:[^;]+/)?.[0]).not.toContain("--ff-red");
});

it("has no colored side stripes wider than one pixel", () => {
  const roots = [here, join(here, "../../../apps/launcher/src/renderer/src"), join(here, "../../../apps/gallery/src")];
  for (const file of roots.flatMap(walk).filter(f => /\.(css|tsx)$/.test(f) && !f.includes(".test."))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/border-(?:left|right|top|bottom|inline(?:-start|-end)?)(?:-width)?\s*:\s*([\d.]+)px/g)) {
      expect(Number(match[1]), `${file}: ${match[0]}`).toBeLessThanOrEqual(1);
    }
    expect(source, file).not.toMatch(/border(?:Left|Right|InlineStart|InlineEnd)(?:Width)?\s*:\s*["']?[2-9]/);
  }
});

it("formats all match dates without seconds as Oct 17 · 12:43 AM", () => {
  expect(formatMatchDate(new Date(2026, 9, 17, 0, 43, 59))).toBe("Oct 17 · 12:43 AM");
  expect(formatMatchDate(new Date(2026, 9, 17, 12, 43, 1))).toBe("Oct 17 · 12:43 PM");
  expect(formatMatchDate("invalid")).toBe("Date unavailable");
});

it("keeps Front and saved Ember on the exact Flash neutral tokens", () => {
  for (const id of ["abyss", "ember"] as const) {
    applyTheme(document.documentElement, id);
    expect(THEMES[id].tokens).toMatchObject({ "--ff-bg": "#0A0A0B", "--ff-surface": "#121316", "--ff-surface-2": "#1B1D22" });
    expect(getComputedStyle(document.documentElement).getPropertyValue("--ff-bg").trim()).toBe("#0A0A0B");
  }
});

it("keeps fallback fonts and compact data independent of fonts.css", () => {
  const css = readFileSync(join(here, "theme.css"), "utf8");
  expect(css).toContain('--font-body: "Inter", "Segoe UI", system-ui, sans-serif');
  expect(css).toContain('--font-number: "Antonio Variable", "Bahnschrift", "Arial Narrow", sans-serif');
  expect(css).toContain("font-variant-numeric: tabular-nums");
  expect(css).toMatch(/\.build-row \{[^}]*display: grid;[^}]*min-height: 28px;[^}]*var\(--font-body\)[^}]*white-space: nowrap/);
  expect(css).toMatch(/\.chart-label \{[^}]*var\(--font-body\)/);
  expect(css).toMatch(/\.chart-value \{[^}]*var\(--font-body\)/);
  expect(css).not.toContain("@import");
});

it("sets HUD state lines and table rows at 13px Compact / 14px Comfortable, keeping 11px for headers and labels", () => {
  const css = readFileSync(join(here, "theme.css"), "utf8");
  const hud = css.match(/\.hud-layer\[aria-label\] \{([^}]+)\}/)![1]!;
  expect(hud).toMatch(/--text-sm: min\(calc\(13px \* var\(--font-scale\)\), 14px\)/);
  expect(hud).toMatch(/--text-xs: calc\(11px \* var\(--font-scale\)\)/);
  const rows = css.match(/\/\* HUD state lines[^*]*\*\/\s*([^{]+)\{([^}]+)\}/)!;
  for (const selector of [".event", ".zone-chip", ".last-push", ".goal-strip small", ".trade-monitor small", ".idle-gold-note", ".snooze-hint"])
    expect(rows[1], selector).toContain(`.hud-layer ${selector}`);
  expect(rows[2]).toContain("font-size: var(--text-sm)");
  expect(css).toMatch(/\.attack-sizes th \{[^}]*font-size: var\(--text-xs\)/);
});
