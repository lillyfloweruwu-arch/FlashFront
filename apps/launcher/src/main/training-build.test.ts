import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const viteConfig = readFileSync(new URL("../../electron.vite.config.mts", import.meta.url), "utf8");

it("every installer ships the packed maps outside the app archive, per platform", () => {
  for (const platform of ["win", "linux"]) expect(pkg.build[platform].extraResources).toContainEqual({ from: "build/training-maps", to: "training/maps" });
  // The engine is bundled into the Training worker chunk; its workspace links never ship.
  expect(pkg.build.files).toContain("!node_modules/@openfront/**");
});

it("no installer is built without the Training check between the renderer build and packaging", () => {
  for (const script of [pkg.scripts.dist, pkg.scripts["dist:linux"]]) {
    const steps = script.split("&&").map((s: string) => s.trim());
    const check = steps.findIndex((s: string) => s.includes("tools/training/check-build.ts"));
    expect(check).toBeGreaterThan(steps.findIndex((s: string) => s.startsWith("electron-vite build")));
    expect(check).toBeLessThan(steps.findIndex((s: string) => s.startsWith("electron-builder")));
  }
});

it("the renderer compiles vendored engine files with upstream's settings, for the page and the worker", () => {
  expect(viteConfig).toMatch(/plugins: \[[^\]]*engineTransform\(\)/);
  expect(viteConfig).toMatch(/worker: \{ format: "es", plugins: \(\) => \[engineTransform\(\)\] \}/);
  expect(viteConfig).toContain("tsconfig: `${vendorDir}/tsconfig.json`");
});
