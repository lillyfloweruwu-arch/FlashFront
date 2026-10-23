import { execFileSync } from "node:child_process";
import { posix } from "node:path";

export const PUBLIC_ALLOWLIST: readonly string[] = [
  ".gitignore",
  "README.md",
  "LICENSE",
  "DESIGN.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "docs/RELEASE-NOTES-FORMAT.md",
  "docs/SPAWN-SPOTS-v0.34.25.md",
  "docs/brand/mark.svg",
  "docs/brand/mark-16.svg",
  "apps/gallery/**",
  "apps/launcher/**",
  "packages/cdp/**",
  "packages/core/**",
  "packages/ui/**",
  "scripts/*.mjs",
  "tools/spawn/**",
  "tools/public/**",
];

export function selectPublicFiles(
  tracked: readonly string[],
  allow: readonly string[] = PUBLIC_ALLOWLIST,
): string[] {
  const normalized = tracked.map((p) => p.replace(/\\/g, "/"));
  const result: string[] = [];
  for (const path of normalized) {
    if (path.endsWith(".local.json")) continue;
    for (const pattern of allow) {
      if (posix.matchesGlob(path, pattern)) {
        result.push(path);
        break;
      }
    }
  }
  return result.sort();
}

export function trackedFiles(repoRoot: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const ignored = new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--ignored", "--exclude-standard"], { cwd: repoRoot, encoding: "utf8" }).split("\0"));
  const files = output.split("\0").filter((f) => f.length > 0 && !ignored.has(f));
  return files;
}

