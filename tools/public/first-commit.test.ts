import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkCommitIdentity, createPublicCommit } from "./first-commit.ts";
import { buildRules } from "./personal.ts";

const author = { name: "tester", email: "999+tester@users.noreply.github.com" };
const config = { names: ["Fixtureperson"], emails: [], playerIds: [], vaultMarkers: [], publicAuthor: author };
let root: string; let dir: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "public-commit-")); dir = join(root, "export"); mkdirSync(dir);
  writeFileSync(join(dir, "README.md"), "safe");
  writeFileSync(join(dir, ".gitignore"), ".flashfront-export\nnode_modules/\n");
  writeFileSync(join(dir, ".flashfront-export"), JSON.stringify([".gitignore", "README.md"]));
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
it("creates only the noreply identity despite global config and environment", () => {
  const global = join(root, "global.gitconfig"); writeFileSync(global, "[user]\nname = wrong\nemail = dev@example.test\n");
  vi.stubEnv("GIT_CONFIG_GLOBAL", global); vi.stubEnv("GIT_AUTHOR_EMAIL", "wrong@example.test"); vi.stubEnv("GIT_COMMITTER_NAME", "wrong");
  const hash = createPublicCommit({ dir, author, message: "FlashFront source" });
  expect(hash).toMatch(/^[0-9a-f]{40}$/);
  expect(git("log", "-1", "--format=%ae|%ce|%an|%cn")).toBe(`${author.email}|${author.email}|tester|tester`);
  expect(git("remote")).toBe("");
  expect(git("ls-files")).toBe(".gitignore\nREADME.md");
  expect(readFileSync(global, "utf8")).toContain("dev@example.test");
});
it("records commit dates in UTC so the local timezone is not published", () => {
  vi.stubEnv("TZ", "Asia/Kolkata"); vi.stubEnv("GIT_AUTHOR_DATE", "2001-02-03T04:05:06+0530"); vi.stubEnv("GIT_COMMITTER_DATE", "2001-02-03T04:05:06+0530");
  const before = Math.floor(Date.now() / 1000);
  createPublicCommit({ dir, author, message: "FlashFront source" });
  const [authorDate, committerDate, authorTime] = git("log", "-1", "--format=%ai|%ci|%at").split("|");
  expect(authorDate).toMatch(/\+0000$/); expect(committerDate).toMatch(/\+0000$/);
  expect(Number(authorTime)).toBeGreaterThanOrEqual(before - 5);
});
it("refuses non-noreply and non-account author identities before git initialization", () => {
  for (const invalid of [{ name: "tester", email: "dev@example.test" }, { name: "Other Name", email: author.email }]) {
    expect(() => createPublicCommit({ dir, author: invalid, message: "m" })).toThrow(/noreply|account/);
    expect(existsSync(join(dir, ".git"))).toBe(false);
  }
});
it("refuses a folder that is not an export", () => {
  expect(() => createPublicCommit({ dir: root, author, message: "m" })).toThrow(/export/);
});
it("refuses unlisted files rather than committing unscanned content", () => {
  writeFileSync(join(dir, "unexpected.txt"), "Fixtureperson");
  expect(() => createPublicCommit({ dir, author, message: "m" })).toThrow(/unlisted/);
  expect(spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: dir, stdio: "pipe" }).status).not.toBe(0);
});
it("refuses existing history even with clean current files and noreply metadata", () => {
  git("init", "-b", "main"); git("config", "user.name", author.name); git("config", "user.email", author.email);
  writeFileSync(join(dir, "README.md"), "Fixtureperson"); git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-m", "safe message");
  const previous = git("rev-parse", "HEAD"); writeFileSync(join(dir, "README.md"), "safe");
  expect(() => createPublicCommit({ dir, author, message: "source" })).toThrow(/empty.*history|fresh.*history/);
  expect(git("rev-parse", "HEAD")).toBe(previous);
});
it("flags a noreply email belonging to another account", () => {
  git("init", "-b", "main"); git("config", "user.name", "tester"); git("config", "user.email", "another-account@users.noreply.github.com");
  git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "safe");
  expect(checkCommitIdentity(dir, buildRules(config), "tester").map(f => f.field)).toEqual(["author", "committer"]);
});
it("flags personal emails, different names and personal messages across all refs", () => {
  git("init", "-b", "main"); git("config", "user.name", "tester"); git("config", "user.email", "dev@example.test");
  git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture");
  git("config", "user.email", author.email);
  git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Fixtureperson");
  const rules = buildRules(config);
  const findings = checkCommitIdentity(dir, rules, "tester");
  expect(findings.map(f => f.field).sort()).toEqual(["author", "committer", "message"]);
  expect(JSON.stringify(findings)).not.toMatch(/dev@example|Fixtureperson/);
  git("checkout", "-b", "other"); git("config", "user.name", "another-account");
  git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "safe"); git("checkout", "main");
  expect(checkCommitIdentity(dir, rules, "tester").map(f => f.field).sort()).toEqual(["author", "author", "committer", "committer", "message"]);
});
it("CLI scans before committing and verifies local history without a remote", () => {
  const privateRoot = join(root, "private"); const toolDir = join(privateRoot, "tools/public"); mkdirSync(toolDir, { recursive: true });
  for (const file of ["first-commit.ts", "export.ts", "check.ts", "personal.ts", "allowlist.ts"]) cpSync(fileURLToPath(new URL(file, import.meta.url)), join(toolDir, file));
  execFileSync("git", ["init", "-b", "main"], { cwd: privateRoot, stdio: "pipe" });
  execFileSync("git", ["-c", "user.name=tester", "-c", `user.email=${author.email}`, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture"], { cwd: privateRoot, stdio: "pipe" });
  writeFileSync(join(toolDir, "personal.local.json"), JSON.stringify(config));
  const run = () => spawnSync(process.execPath, [join(toolDir, "first-commit.ts"), "--dir", dir], { encoding: "utf8", env: { ...process.env, APPDATA: root } });
  writeFileSync(join(dir, "README.md"), "Fixtureperson");
  const dirty = run(); expect(dirty.status).toBe(1); expect(dirty.stdout + dirty.stderr).not.toContain("Fixtureperson");
  expect(existsSync(join(dir, ".git"))).toBe(false);
  writeFileSync(join(dir, "README.md"), "safe");
  const clean = run(); expect(clean.status, clean.stderr).toBe(0); expect(clean.stdout).toMatch(/public commit [0-9a-f]{40} ready, not pushed/);
  expect(git("remote")).toBe(""); expect(checkCommitIdentity(dir, buildRules(config), "tester")).toEqual([]);
});
