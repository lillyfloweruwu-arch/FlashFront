import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { selectPublicFiles, trackedFiles } from "./allowlist.ts";
import { readExportManifest } from "./check.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

it("selects only allowlisted paths", () => {
  const tracked = ["README.md", "docs/BUILD-LOG-v0.md", "docs/RELEASE-NOTES-FORMAT.md", "tools/probes/cdp-probe.mjs",
    "tools/spawn/build.ts", "scripts/brand-icons.mjs", "scripts/sub/x.mjs", ".claude/launch.json", "PRODUCT.md"];
  expect(selectPublicFiles(tracked)).toEqual(["README.md", "docs/RELEASE-NOTES-FORMAT.md", "scripts/brand-icons.mjs", "tools/spawn/build.ts"]);
});

it("the real repo's selection excludes every private area and keeps the build inputs", () => {
  const files = existsSync(join(repoRoot, ".flashfront-export")) ? readExportManifest(repoRoot) : selectPublicFiles(trackedFiles(repoRoot));
  for (const bad of [/^docs\/(BUILD-LOG-|codex-|SPEC-|superpowers\/|promo\/)/, /^\.(impeccable|superpowers|claude)\//,
    /^tools\/probes\//, /^tools\/capture-playtest/, /^PRODUCT\.md$/, /\.local\.json$/, /^playtest\//])
    expect(files.filter(f => bad.test(f))).toEqual([]);
  expect(files).toEqual(expect.arrayContaining(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "apps/launcher/build/icon.ico", "packages/core/src/spawn/LICENSE-MAPDATA.md", "docs/brand/mark.svg"]));
});

it("normalises backslashes from git", () => {
  expect(selectPublicFiles(["tools\\spawn\\maps.ts"])).toEqual(["tools/spawn/maps.ts"]);
});
it("never selects the local personal config even with a custom allowlist", () => {
  expect(selectPublicFiles(["tools/public/personal.local.json"], ["**"])).toEqual([]);
});
