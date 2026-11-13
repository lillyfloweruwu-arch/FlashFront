import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./theme.css", import.meta.url)), "utf8");
const root = css.match(/:root\s*\{([^}]+)\}/)![1];
const tokens = {
  glass: "rgba(14,16,19,.8)", "glass-strong": "rgba(14,16,19,.78)",
  "glass-solid": "rgba(14,16,19,.94)", "glass-edge": "rgba(255,255,255,.08)",
  "glass-blur": "16px", "glass-blur-side": "14px",
  lift: "inset 0 1px 0 rgba(255,255,255,.07)", float: "0 20px 50px rgba(0,0,0,.5)",
  "hud-shadow": "0 6px 18px rgba(0,0,0,.5)",
  "radius-control": "8px", "radius-button": "10px", "radius-hud": "12px", "radius-panel": "14px", "radius-pill": "999px",
  "primary-top": "#F02236", "primary-bottom": "#C61224",
  "primary-glow": "0 10px 24px rgba(232,25,44,.3)", "primary-glow-hero": "0 14px 34px rgba(232,25,44,.42)",
  "map-filter": "saturate(.9) brightness(.55) contrast(1.05)", "map-filter-dim": "saturate(.6) brightness(.32)",
  "topo-ring": "rgba(242,243,245,.045)", "grid-line": "rgba(242,243,245,.03)",
  "title-shadow": "0 4px 24px rgba(0,0,0,.7)",
  "scrim-art": "linear-gradient(0deg, rgba(12,14,17,.97) 40%, rgba(12,14,17,.35))",
};

describe("War table theme contract", () => {
  it.each(Object.entries(tokens))("defines --%s on the shared root", (name, value) => {
    expect(root).toContain(`--${name}: ${value};`);
  });

  it.each([
    css.slice(css.indexOf(':root[data-fx="lite"]'), css.indexOf('@media (prefers-reduced-transparency: reduce)')),
    css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'), css.indexOf('html.launcher[data-fx="lite"]')),
  ])("removes glass effects for explicit Lite and reduced transparency", (fallback) => {
    expect(fallback).toContain("--glass: var(--glass-solid)");
    expect(fallback).toContain("--glass-strong: var(--glass-solid)");
    for (const name of ["primary-glow", "primary-glow-hero", "float"]) {
      expect(fallback).toContain(`--${name}: 0 0 0 transparent`);
    }
    expect(fallback).toContain("--topo-ring: transparent");
    expect(fallback).toContain("backdrop-filter: none !important");
    expect(fallback).toContain("*::before");
    expect(fallback).toContain("*::after");
  });

  it("disables launcher motion in Lite and reduced-motion modes", () => {
    const lite = css.slice(css.indexOf('html.launcher[data-fx="lite"]'));
    expect(lite).toMatch(/html\.launcher\[data-fx="lite"\][^{]+\{\s*transition: none !important; animation: none !important;/);
    expect(lite).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]+html\.launcher \*[^{]+\{\s*transition: none !important; animation: none !important;/);
  });

  it("shares button styling without changing the static overlay", () => {
    expect(css).toContain('.ff-btn-primary, html:not(.ff-static) .ff-button-primary {');
    expect(css).toContain('.ff-btn-secondary, html:not(.ff-static) .ff-button-default {');
    expect(css).toContain('html.ff-static *, html.ff-static *::before, html.ff-static *::after { animation: none !important; transition: none !important; backdrop-filter: none !important; box-shadow: none !important; }');
    expect(root).toContain('--panel-radius: 6px; --panel-blur: 0px;');
  });
});
