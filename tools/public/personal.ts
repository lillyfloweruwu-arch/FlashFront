import { execFileSync } from "node:child_process";
import { isUtf8 } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { join, posix, resolve, win32 } from "node:path";

export interface PersonalConfig {
  names: string[];
  playerIds: string[];
  emails: string[];
  vaultMarkers: string[];
  publicAuthor?: { name: string; email: string };
  releaseNoteCredits?: string[]; // permitted end-of-line credits on hold-Space release-notes lines
}
export interface Rule { id: "email" | "user-path" | "vault" | "player-id" | "name" | "token"; pattern: RegExp; skip?: (file: string) => boolean }
export interface Finding { file: string; line: number; rule: Rule["id"]; masked: string }
export const CONFIG_PATH = "tools/public/personal.local.json";
const SETUP = "personal-info config missing: copy tools/public/personal.example.json to tools/public/personal.local.json and fill it in";
const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function loadPersonalConfig(repoRoot: string, opts: { file?: string; settingsFile?: string } = {}): PersonalConfig {
  let config: PersonalConfig;
  try {
    config = JSON.parse(readFileSync(resolve(repoRoot, opts.file ?? CONFIG_PATH), "utf8"));
    for (const key of ["names", "playerIds", "emails", "vaultMarkers"] as const) {
      if (!Array.isArray(config?.[key]) || !config[key].every(v => typeof v === "string" && v.trim().length > 0)) throw Error();
    }
    if (!config.names.length) throw Error();
    if (config.releaseNoteCredits !== undefined && (!Array.isArray(config.releaseNoteCredits) || !config.releaseNoteCredits.every(v => typeof v === "string" && v.trim().length > 0))) throw Error();
    if (config.publicAuthor !== undefined && (!config.publicAuthor || typeof config.publicAuthor.name !== "string" || typeof config.publicAuthor.email !== "string")) throw Error();
  } catch { throw Error(SETUP); }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let history: string;
  try { history = git("log", "--all", "--format=%ae%n%ce"); }
  catch { throw Error("personal-info check could not read git history"); }
  let current = "";
  try { current = git("config", "user.email"); } catch { /* No configured email is valid. */ }
  const emails = [...config.emails, ...history.split(/\r?\n/), current].filter(e => e && !/@users\.noreply\.github\.com$/i.test(e));
  const playerIds = [...config.playerIds];
  const settingsFile = opts.settingsFile ?? (process.env.APPDATA ? join(process.env.APPDATA, "@flashfront/launcher/settings.json") : undefined);
  if (settingsFile && existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
      if (typeof settings.publicId === "string" && settings.publicId.trim()) playerIds.push(settings.publicId);
    } catch { throw Error("personal-info check could not read launcher settings"); }
  }
  return { ...config, emails: [...new Set(emails)], playerIds: [...new Set(playerIds)] };
}

export function buildRules(config: PersonalConfig): Rule[] {
  const rules: Rule[] = [];
  const add = (id: Rule["id"], pattern: string, flags = "gi", skip?: Rule["skip"]) => rules.push({ id, pattern: new RegExp(pattern, flags), skip });
  for (const email of config.emails) add("email", literal(email));
  add("user-path", "[a-z]:[\\\\/]+users[\\\\/]+|/[a-z]/users/");
  add("vault", "one" + "drive|documents[\\\\/]+brain", "gi");
  // Upstream OpenFront data names things after the stone; only first-party files must avoid the word.
  add("vault", "ob" + "sidian", "gi", file => file.replace(/\\/g, "/").startsWith("vendor/openfront/"));
  for (const marker of config.vaultMarkers) add("vault", literal(marker));
  for (const id of config.playerIds) add("player-id", `\\b${literal(id)}\\b`);
  for (const name of config.names) add("name", `(?<![\\p{L}\\p{N}_])${literal(name)}(?![\\p{L}\\p{N}_])`, "giu");
  for (const pattern of ["ghp_[A-Za-z0-9]{20,}", "github_pat_\\w{20,}", "sk-[A-Za-z0-9_-]{20,}", "AKIA[0-9A-Z]{16}", "xox[abpr]-[\\w-]{10,}", "-----BEGIN [A-Z ]*PRIVATE KEY-----"]) add("token", pattern, "g");
  return rules;
}

export function scanText(file: string, text: string, rules: Rule[], opts: { releaseNotes?: boolean; credits?: readonly string[] } = {}): Finding[] {
  if (opts.releaseNotes) text = text.split("\n").map(line => {
    if (/\bhold[ -]space\b/i.test(line)) for (const credit of opts.credits ?? []) line = line.replace(new RegExp(` ${literal(credit)}(?=\\r?$)`), "");
    return line;
  }).join("\n");
  // Absolute diagnostic paths reveal machine usernames even when file contents do not.
  let displayFile = win32.isAbsolute(file) ? win32.basename(file) : posix.isAbsolute(file) ? posix.basename(file) : file;
  for (const { pattern } of rules) displayFile = displayFile.replace(new RegExp(pattern.source, pattern.flags), match => `${match[0]}***`);
  const findings: Finding[] = [];
  for (const { id, pattern, skip } of rules) {
    if (skip?.(file)) continue;
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      findings.push({ file: displayFile, line: text.slice(0, match.index).split("\n").length, rule: id, masked: `${match[0][0]}***` });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

export function scanFiles(root: string, files: readonly string[], rules: Rule[]): Finding[] {
  return files.flatMap(file => {
    const bytes = readFileSync(join(root, file));
    const binary = scanText(file, bytes.toString("latin1"), rules).filter(f => f.rule !== "name" || !isUtf8(bytes));
    const utf8 = scanText(file, bytes.toString("utf8"), rules);
    // Keep repeated occurrences, but do not report the same ASCII match twice.
    const counts = new Map<string, number>();
    for (const f of binary) { const key = JSON.stringify(f); counts.set(key, (counts.get(key) ?? 0) + 1); }
    // A compressed payload is random bytes, where short names match by chance; other rules still apply.
    const opaque = /\.(br|gz|zst)$/i.test(file);
    return [...scanText(file, file, rules), ...binary.filter(f => !opaque || f.rule !== "name"), ...utf8.filter(f => {
      if (opaque && f.rule === "name") return false;
      const key = JSON.stringify(f); const count = counts.get(key) ?? 0;
      if (count) { counts.set(key, count - 1); return false; }
      return true;
    })];
  });
}
export function formatFindings(findings: Finding[]): string {
  return findings.map(f => `${f.file}:${f.line} ${f.rule} ${f.masked}`).join("\n");
}
