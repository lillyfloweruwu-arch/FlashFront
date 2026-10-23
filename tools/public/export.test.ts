import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EXPORT_MARKER, exportPublicTree } from "./export.ts";
import { trackedFiles } from "./allowlist.ts";

const config = { names: ["Fixtureperson"], playerIds: [], emails: [], vaultMarkers: [] };
let root: string; let repoRoot: string; let out: string;
function write(file: string, text = "safe") { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
function git(...args: string[]) { return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }); }
function commit() { git("-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture"); }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "public-export-")); repoRoot = join(root, "private"); out = join(root, "public");
  mkdirSync(repoRoot); git("init", "-b", "main");
  for (const file of ["README.md", "packages/core/src/a.ts", "docs/BUILD-LOG-v0.md"]) write(join(repoRoot, file));
  git("add", "."); commit(); write(join(repoRoot, "packages/core/src/untracked.ts"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("copies only allowlisted tracked files and writes the marker", () => {
  const result = exportPublicTree({ repoRoot, out, config });
  expect(result.files).toEqual(["README.md", "packages/core/src/a.ts"]);
  expect(existsSync(join(out, "docs/BUILD-LOG-v0.md"))).toBe(false);
  expect(existsSync(join(out, "packages/core/src/untracked.ts"))).toBe(false);
  expect(readFileSync(join(out, "README.md"))).toEqual(readFileSync(join(repoRoot, "README.md")));
  expect(JSON.parse(readFileSync(join(out, EXPORT_MARKER), "utf8"))).toEqual(result.files);
  expect(result.findings).toEqual([]);
});
it("refuses an output folder inside the repo or equal to it", () => {
  for (const target of [repoRoot, join(repoRoot, "pub")]) expect(() => exportPublicTree({ repoRoot, out: target, config })).toThrow(/inside the private repo/);
  expect(readFileSync(join(repoRoot, "README.md"), "utf8")).toBe("safe");
});
it("refuses a parent output even if it has a marker", () => {
  write(join(root, EXPORT_MARKER), "[]");
  expect(() => exportPublicTree({ repoRoot, out: root, config })).toThrow(/contains the private repo/);
  expect(existsSync(repoRoot)).toBe(true);
});
it("refuses non-export folders and malformed markers without deleting anything", () => {
  write(join(out, "keep.txt"));
  expect(() => exportPublicTree({ repoRoot, out, config })).toThrow(/not a FlashFront export/);
  write(join(out, EXPORT_MARKER), "{}");
  expect(() => exportPublicTree({ repoRoot, out, config })).toThrow(/not a FlashFront export/);
  expect(existsSync(join(out, "keep.txt"))).toBe(true);
});
it("re-export keeps .git and removes stale files", () => {
  exportPublicTree({ repoRoot, out, config }); write(join(out, ".git/x")); write(join(out, "stray.txt"));
  git("rm", "--cached", "packages/core/src/a.ts"); commit();
  const result = exportPublicTree({ repoRoot, out, config });
  expect(result.files).toEqual(["README.md"]);
  expect(existsSync(join(out, ".git/x"))).toBe(true);
  expect(existsSync(join(out, "stray.txt"))).toBe(false);
  expect(existsSync(join(out, "packages/core/src/a.ts"))).toBe(false);
});
it("returns masked findings for copied content", () => {
  write(join(repoRoot, "packages/core/src/a.ts"), "Fixtureperson"); git("add", "."); commit();
  expect(exportPublicTree({ repoRoot, out, config }).findings).toEqual([{ file: "packages/core/src/a.ts", line: 1, rule: "name", masked: "F***" }]);
});
it("excludes even force-tracked ignored files", () => {
  write(join(repoRoot, ".gitignore"), "tools/public/personal.local.json\npackages/core/ignored.bin\n");
  write(join(repoRoot, "tools/public/personal.local.json"), "Fixtureperson");
  write(join(repoRoot, "packages/core/ignored.bin"));
  git("add", ".gitignore"); git("add", "-f", "tools/public/personal.local.json", "packages/core/ignored.bin"); commit();
  expect(trackedFiles(repoRoot)).not.toContain("tools/public/personal.local.json");
  const result = exportPublicTree({ repoRoot, out, config });
  expect(result.files).toEqual([".gitignore", "README.md", "packages/core/src/a.ts"]);
  expect(result.findings).toEqual([]);
});
it("refuses junction aliases of the private repo", () => {
  const alias = join(root, "alias"); symlinkSync(repoRoot, alias, "junction");
  expect(() => exportPublicTree({ repoRoot, out: join(alias, "pub"), config })).toThrow(/inside the private repo/);
});
it("refuses linked source directories before clearing an earlier export", () => {
  exportPublicTree({ repoRoot, out, config }); write(join(out, "keep.txt"));
  const source = join(repoRoot, "packages/core/src"); rmSync(source, { recursive: true });
  const outside = join(root, "outside"); write(join(outside, "a.ts"), "Fixtureperson");
  symlinkSync(outside, source, "junction");
  expect(() => exportPublicTree({ repoRoot, out, config })).toThrow(/symbolic links/);
  expect(existsSync(join(out, "keep.txt"))).toBe(true);
});
it("CLI reports clean, findings and setup failure without committing", () => {
  const toolDir = join(repoRoot, "tools/public"); mkdirSync(toolDir, { recursive: true });
  for (const file of ["export.ts", "check.ts", "personal.ts", "allowlist.ts"]) cpSync(fileURLToPath(new URL(file, import.meta.url)), join(toolDir, file));
  const run = () => spawnSync(process.execPath, [join(toolDir, "export.ts"), "--", "--out", out], { encoding: "utf8", env: { ...process.env, APPDATA: root } });
  expect(run().status).toBe(2);
  write(join(toolDir, "personal.local.json"), JSON.stringify(config));
  const clean = run(); expect(clean.status).toBe(0); expect(clean.stdout).toContain("exported 2 files");
  write(join(repoRoot, "README.md"), "Fixtureperson");
  expect(run().status).toBe(2);
  git("add", "README.md"); commit();
  expect(run().status).toBe(1); expect(existsSync(join(out, ".git"))).toBe(false);
});
it("refuses uncommitted changes in public files before touching the output", () => {
  write(join(repoRoot, "README.md"), "edited, not committed");
  expect(() => exportPublicTree({ repoRoot, out, config })).toThrow(/uncommitted changes/);
  expect(existsSync(out)).toBe(false);
  git("add", "README.md");
  expect(() => exportPublicTree({ repoRoot, out, config })).toThrow(/uncommitted changes/);
  write(join(repoRoot, "docs/BUILD-LOG-v0.md"), "private and uncommitted");
  git("reset", "-q", "README.md"); git("checkout", "--", "README.md");
  expect(exportPublicTree({ repoRoot, out, config }).files).toEqual(["README.md", "packages/core/src/a.ts"]);
});
