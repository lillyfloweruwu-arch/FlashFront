import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selectPublicFiles, trackedFiles } from "./allowlist.ts";
import { buildRules, formatFindings, loadPersonalConfig, scanFiles, scanText } from "./personal.ts";

export function readExportManifest(dir: string): string[] {
  let files: unknown;
  try { files = JSON.parse(readFileSync(join(dir, ".flashfront-export"), "utf8")); }
  catch { throw Error("not a FlashFront export: missing or invalid manifest"); }
  if (!Array.isArray(files) || !files.every(f => typeof f === "string" && f.length > 0 && !isAbsolute(f) && !/[\\:\x00-\x1f]/.test(f) && !f.split("/").some(p => !p || p === "." || p === "..") && !f.endsWith(".local.json") && selectPublicFiles([f]).length === 1) || new Set(files).size !== files.length) {
    throw Error("not a FlashFront export: invalid manifest paths");
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    let dir = repoRoot; const notes: string[] = [];
    const args = process.argv.slice(2).filter(arg => arg !== "--");
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]; const value = args[++i];
      if (!value || (flag !== "--dir" && flag !== "--notes")) throw Error("usage: public:check [--dir path] [--notes file]...");
      if (flag === "--dir") dir = resolve(value); else notes.push(value);
    }
    const config = loadPersonalConfig(repoRoot); const rules = buildRules(config);
    const files = existsSync(join(dir, ".flashfront-export")) ? readExportManifest(dir) : selectPublicFiles(trackedFiles(dir));
    const findings = scanFiles(dir, files, rules);
    for (const file of notes) findings.push(...scanText(file, readFileSync(file, "utf8"), rules, { releaseNotes: true, credits: config.releaseNoteCredits ?? [] }));
    console.log(findings.length ? formatFindings(findings) : "personal-info check: clean");
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    // System error strings can contain personal absolute paths.
    console.error(error instanceof Error && !("code" in error) ? error.message : "personal-info check could not read input files");
    process.exitCode = 2;
  }
}
