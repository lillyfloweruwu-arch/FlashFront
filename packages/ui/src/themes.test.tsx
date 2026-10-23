// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyTheme, resolveTheme, THEMES, THEME_IDS } from "./themes";
import { ThemePreview } from "./ThemePreview";

it("scopes all four themes with no geometry tokens and retains nested preview colors", () => {
  for (const theme of THEME_IDS) {
    applyTheme(document.documentElement, theme);
    expect(document.documentElement.dataset.ffTheme).toBe(theme);
    expect(Object.keys(THEMES[theme].tokens).some(key => /width|space|radius|blur/.test(key))).toBe(false);
    const markup = renderToStaticMarkup(<ThemePreview theme={theme} />);
    expect(markup).toContain(`data-ff-theme="${theme}"`);
    expect(markup).toContain("growth-gauge"); expect(markup).toContain("attack-preview");
    expect(markup).toContain("--gain:");
  }
  expect(document.querySelectorAll("style[data-flashfront-themes]")).toHaveLength(1);
  expect(THEMES.daylight.tokens["--panel-bg"]).toBe("color-mix(in srgb, #24272D 96%, transparent)");
  expect(THEMES.signal.tokens).toMatchObject({ "--gain": "#56B4E9", "--danger": "#D55E00", "--warning": "#E69F00", "--font-scale": "1.15" });
  expect(parseFloat(THEMES.signal.tokens["--text-base"]!)).toBeCloseTo(14 * 1.15);
});
it("honors a valid OBS override and falls back to the streamed selection", () => {
  expect(resolveTheme("signal", "daylight")).toBe("signal");
  expect(resolveTheme("invalid", "ember")).toBe("ember");
  expect(resolveTheme(null, "daylight")).toBe("daylight");
  expect(resolveTheme(null, "invalid")).toBe("abyss");
});
