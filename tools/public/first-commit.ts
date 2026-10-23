import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readExportManifest } from "./check.ts";
import { buildRules, formatFindings, loadPersonalConfig, scanFiles, scanText, type Rule } from "./personal.ts";

export const NOREPLY = /^(\d+\+)?[A-Za-z0-9-]+@users\.noreply\.github\.com$/;
const emailAccount = (email: string) => email.split("@")[0]!.replace(/^\d+\+/, "");
export interface IdentityFinding { commit: string; field: "author" | "committer" | "message"; reason: string }
function git(dir: string, args: string[], identity: NodeJS.ProcessEnv = {}): string {
  const env = { ...process.env, ...identity };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_COUNT"]) delete env[key];
  try {
    return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  } catch { throw Error("public commit git operation failed"); }
}
export function checkCommitIdentity(repoDir: string, rules: Rule[], allowedName: string): IdentityFinding[] {
  // NUL cannot occur in a git commit message; a fixed field count keeps multiline messages intact.
  const fields = git(repoDir, ["log", "--all", "-z", "--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B"]).split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 6 !== 0) throw Error("public history could not be parsed");
  const findings: IdentityFinding[] = [];
  for (let i = 0; i < fields.length; i += 6) {
    const [commit, author, authorEmail, committer, committerEmail, message] = fields.slice(i, i + 6) as [string, string, string, string, string, string];
    for (const [field, name, email] of [["author", author, authorEmail], ["committer", committer, committerEmail]] as const) {
      if (name !== allowedName || !NOREPLY.test(email) || emailAccount(email) !== allowedName) findings.push({ commit, field, reason: "identity is not the allowed account and noreply address" });
    }
    if (scanText("commit", message, rules).length) findings.push({ commit, field: "message", reason: "personal-info rule matched (value masked)" });
  }
  return findings;
}
export function createPublicCommit(opts: { dir: string; author: { name: string; email: string }; message: string }): string {
  const { author } = opts;
  if (!NOREPLY.test(author.email)) throw Error("public author must use a GitHub noreply address");
  const account = emailAccount(author.email);
  if (author.name !== account) throw Error("public author name must be the noreply account name");
  const dir = resolve(opts.dir); const files = readExportManifest(dir); const selected = new Set(files);
  if (!files.length) throw Error("export contains no files");
  for (const file of ["", ...files]) {
    let path = dir;
    for (const part of file.split("/")) {
      path = join(path, part);
      if (lstatSync(path).isSymbolicLink()) throw Error("export must not contain symbolic links");
    }
    if (file && !lstatSync(path).isFile()) throw Error("export must contain regular files");
  }
  const gitDir = join(dir, ".git");
  if (existsSync(gitDir) && (!lstatSync(gitDir).isDirectory() || lstatSync(gitDir).isSymbolicLink())) throw Error("export requires its own git directory");
  if (!existsSync(gitDir)) git(dir, ["init", "-b", "main"]);
  if (git(dir, ["rev-list", "--all", "--count"]).trim() !== "0") throw Error("first public commit requires empty local history; choose a fresh export folder");
  const inventory = git(dir, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
  if (inventory.some(f => f !== ".flashfront-export" && !selected.has(f) && existsSync(join(dir, f)))) throw Error("export contains unlisted files; re-export before committing");
  git(dir, ["config", "--local", "user.name", author.name]);
  git(dir, ["config", "--local", "user.email", author.email]);
  git(dir, ["add", "-A"]);
  const staged = git(dir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  if (staged.length !== files.length || staged.some(f => !selected.has(f))) throw Error("export index contains unlisted or missing files");
  const date = `${Math.floor(Date.now() / 1000)} +0000`; // UTC, so the local timezone is not published
  git(dir, ["commit", "-m", opts.message], { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const args = process.argv.slice(2).filter(arg => arg !== "--");
    if (args.length && (args.length !== 2 || args[0] !== "--dir" || !args[1])) throw Error("usage: public:commit [--dir path]");
    const dir = resolve(args[1] ?? resolve(repoRoot, "../FlashFront-public"));
    const config = loadPersonalConfig(repoRoot); const author = config.publicAuthor;
    if (!author) throw Error("set publicAuthor in the local personal-info config before committing");
    const rules = buildRules(config); const findings = scanFiles(dir, readExportManifest(dir), rules);
    const history = existsSync(join(dir, ".git")) ? checkCommitIdentity(dir, rules, author.name) : [];
    if (findings.length || history.length) {
      console.log(formatFindings(findings));
      for (const finding of history) console.log(`${finding.commit} ${finding.field}: ${finding.reason}`);
      process.exitCode = 1;
    } else {
      const message = `FlashFront source (from private ${git(repoRoot, ["rev-parse", "--short", "HEAD"]).trim()})`;
      const hash = createPublicCommit({ dir, author, message });
      const identities = checkCommitIdentity(dir, rules, author.name);
      if (identities.length) {
        for (const finding of identities) console.log(`${finding.commit} ${finding.field}: ${finding.reason}`);
        process.exitCode = 1;
      } else console.log(`public commit ${hash} ready, not pushed`);
    }
  } catch (error) {
    console.error(error instanceof Error && !("code" in error) ? error.message : "public commit could not read export files");
    process.exitCode = 2;
  }
}
