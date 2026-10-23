import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selectPublicFiles, trackedFiles } from "./allowlist.ts";
import { readExportManifest } from "./check.ts";
import { buildRules, formatFindings, loadPersonalConfig, scanFiles, type Finding, type PersonalConfig } from "./personal.ts";

export const EXPORT_MARKER = ".flashfront-export";
export interface ExportResult { out: string; files: string[]; findings: Finding[] }
const within = (parent: string, child: string) => {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
};
function canonical(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw Error("output root does not exist");
  return join(canonical(parent), basename(path));
}
export function exportPublicTree(opts: { repoRoot: string; out: string; config: PersonalConfig }): ExportResult {
  const repoRoot = realpathSync(opts.repoRoot);
  const requested = resolve(opts.out); const out = canonical(requested);
  if (within(repoRoot, out)) throw Error("output is inside the private repo");
  if (within(out, repoRoot)) throw Error("output contains the private repo");
  if (existsSync(requested) && lstatSync(requested).isSymbolicLink()) throw Error("output must not use symbolic links");
  if (existsSync(out)) {
    if (!lstatSync(out).isDirectory()) throw Error("output is not a directory");
    if (readdirSync(out).length) readExportManifest(out);
  }
  const files = selectPublicFiles(trackedFiles(repoRoot));
  // Inspect every source component before any destructive re-export step.
  for (const file of files) {
    let path = repoRoot;
    for (const part of file.split("/")) {
      path = join(path, part);
      if (!within(repoRoot, path) || lstatSync(path).isSymbolicLink()) throw Error("export sources must not use symbolic links");
    }
    if (!lstatSync(path).isFile()) throw Error("export sources must be regular files");
  }
  // Export bytes must equal committed content: refuse staged or unstaged edits to public paths.
  const status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=no", "--no-renames"], { cwd: repoRoot, encoding: "utf8" });
  const dirty = selectPublicFiles(status.split("\0").filter(Boolean).map(entry => entry.slice(3)));
  if (dirty.length) throw Error(`uncommitted changes in ${dirty.length} public file(s): commit them before exporting`);
  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(out)) {
    const path = resolve(out, entry);
    if (entry === ".git") continue;
    if (!within(out, path) || path === out) throw Error("unsafe export cleanup path");
    rmSync(path, { recursive: true, force: true });
  }
  for (const file of files) {
    const destination = join(out, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(repoRoot, file), destination);
  }
  writeFileSync(join(out, EXPORT_MARKER), JSON.stringify(files, null, 2) + "\n");
  return { out, files, findings: scanFiles(out, files, buildRules(opts.config)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const args = process.argv.slice(2).filter(arg => arg !== "--");
    if (args.length && (args.length !== 2 || args[0] !== "--out" || !args[1])) throw Error("usage: public:export [--out path]");
    const result = exportPublicTree({ repoRoot, out: args[1] ?? resolve(repoRoot, "../FlashFront-public"), config: loadPersonalConfig(repoRoot) });
    console.log(`exported ${result.files.length} files to ${result.out}`);
    console.log(result.findings.length ? formatFindings(result.findings) : "personal-info check: clean");
    process.exitCode = result.findings.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error && !("code" in error) ? error.message : "public export could not read or write files");
    process.exitCode = 2;
  }
}
