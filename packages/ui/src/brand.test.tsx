// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AnimatedNumber } from "./shared";
import { FlashFrontMark, Icon, iconPaths, type IconName } from "./icons";

it("uses authored SVGs instead of Unicode pictograms in all app and UI source", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/^(node_modules|dist|out|build|public|resources)$/.test(e.name) ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]);
  const here = dirname(fileURLToPath(import.meta.url));
  for (const root of [here, join(here, "../../../apps")]) {
    for (const file of walk(root).filter(f => /\.(tsx?|css|html)$/.test(f))) {
      // Copyright and trademark characters are textual attribution, not icons.
      const text = readFileSync(file, "utf8").replace(/[\u00A9\u00AE\u2122]/g, "");
      expect(text, file).not.toMatch(/[\u2316\u25A3\u25A5\u03DF\u2713\u25CB\u24D8\u2197\u2191\u2193\u2195\u2190]|\p{Extended_Pictographic}/u);
    }
  }
});
it("uses the approved bolt and drops the white stroke at 16px", () => {
  expect(renderToStaticMarkup(<FlashFrontMark size={16} />)).not.toContain('stroke="#F2F3F5"');
  for (const size of [32, 64]) expect(renderToStaticMarkup(<FlashFrontMark size={size} />)).toContain('stroke="#F2F3F5"');
  for (const name of Object.keys(iconPaths) as IconName[]) {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toContain('viewBox="0 0 16 16"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('stroke-linecap="square"');
  }
});
it("keeps ff-static free of compositor effects and number animation frames", async () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "theme.css"), "utf8");
  const rule = css.match(/html\.ff-static \*[^}]+}/)?.[0];
  for (const property of ["animation", "transition", "backdrop-filter", "box-shadow"]) expect(rule).toContain(`${property}: none !important`);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const frame = vi.fn(); vi.stubGlobal("requestAnimationFrame", frame);
  document.documentElement.classList.add("ff-static");
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(<AnimatedNumber value={1} format={String} />));
    await act(async () => root.render(<AnimatedNumber value={42} format={String} />));
    expect(host.textContent).toBe("42"); expect(frame).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); document.documentElement.classList.remove("ff-static"); vi.unstubAllGlobals(); }
});

it("finishes an in-flight number immediately when ff-static is enabled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const frame = vi.fn(() => 7); const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", frame); vi.stubGlobal("cancelAnimationFrame", cancel);
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(<AnimatedNumber value={1} format={String} />));
    await act(async () => root.render(<AnimatedNumber value={42} format={String} />));
    expect(host.textContent).toBe("1");
    await act(async () => { document.documentElement.classList.add("ff-static"); });
    expect(host.textContent).toBe("42"); expect(cancel).toHaveBeenCalledWith(7);
  } finally { await act(async () => root.unmount()); document.documentElement.classList.remove("ff-static"); vi.unstubAllGlobals(); }
});

it("uses a solid hinted tile below 20px and includes every Windows small frame", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const small = renderToStaticMarkup(<FlashFrontMark size={16} />);
  expect(small).toContain('viewBox="0 0 16 16"');
  expect(small).toContain('fill="#FFFFFF"'); expect(small).not.toContain("stroke=");
  const ico = readFileSync(join(here, "../../../apps/launcher/build/icon.ico"));
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
  expect(sizes).toEqual([16, 24, 32, 48, 256]);
});
