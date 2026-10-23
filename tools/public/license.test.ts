import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { selectPublicFiles, trackedFiles } from "./allowlist.ts";
import { readExportManifest } from "./check.ts";
import { buildRules, scanText } from "./personal.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const files = () => existsSync(join(repoRoot, ".flashfront-export")) ? readExportManifest(repoRoot) : selectPublicFiles(trackedFiles(repoRoot));
it("ships the AGPL-3.0 text", () => {
  const text = readFileSync(join(repoRoot, "LICENSE"), "utf8");
  expect(text).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  expect(text).toContain("Version 3, 19 November 2007");
  expect(text.length).toBeGreaterThan(30_000);
});
it("every package declares AGPL-3.0-only and a neutral author", () => {
  for (const file of files().filter(f => f.endsWith("package.json"))) {
    const pkg = JSON.parse(readFileSync(join(repoRoot, file), "utf8"));
    expect(pkg.license, file).toBe("AGPL-3.0-only");
    if (pkg.author !== undefined) expect(pkg.author, file).toBe("FlashFront contributors");
  }
});
it("README credits OpenFront code and map data", () => {
  expect(readFileSync(join(repoRoot, "README.md"), "utf8")).toMatch(/## License and attribution[\s\S]*AGPL-3\.0[\s\S]*github\.com\/openfrontio\/OpenFrontIO[\s\S]*CC BY-SA 4\.0/);
});
it("community tips credit sources without naming people, including shipped data", async () => {
  const { COMMUNITY } = await import("../spawn/community.ts");
  expect(COMMUNITY["Europe Classic"]!.tips.length).toBeGreaterThan(0);
  expect(COMMUNITY["Europe Classic"]!.source.name).toBe("community guide");
  for (const entry of Object.values(COMMUNITY)) expect(["OpenFront Intel (unofficial)", "community guide"], entry.map).toContain(entry.source.name);
  const data = JSON.parse(readFileSync(join(repoRoot, "packages/core/src/spawn/spots.json"), "utf8"));
  expect(data.maps["Europe Classic"].community).toEqual(COMMUNITY["Europe Classic"]);
});
it("retains all three map-data licenses", () => {
  expect(files().filter(f => f.endsWith("LICENSE-MAPDATA.md"))).toHaveLength(3);
});
it("public docs and support fixtures pass built-in privacy rules", () => {
  const rules = buildRules({ names: ["Testname"], playerIds: [], emails: [], vaultMarkers: [] });
  for (const file of ["docs/RELEASE-NOTES-FORMAT.md", "apps/launcher/src/main/support.test.ts"]) {
    expect(scanText(file, readFileSync(join(repoRoot, file), "utf8"), rules)).toEqual([]);
  }
});
