import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildRules, loadPersonalConfig, scanText, scanFiles, formatFindings } from "./personal.ts";

const creditName = "Wren";
const credits = ["- Wren"];
const config = { names: ["Testname", creditName], emails: ["someone@example.test"], playerIds: ["Zq7Xk2Pw"], vaultMarkers: ["private-notes"] };
const rules = buildRules(config);
const roots: string[] = [];
function temp() { const root = mkdtempSync(join(tmpdir(), "public-test-")); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("finds user paths in every spelling", () => {
  for (const sep of ["\\", "\\\\", "/"]) {
    const path = ["c:", "users", "x", "a"].join(sep);
    expect(scanText("f", path, rules).map(f => f.rule)).toEqual(["user-path"]);
  }
  expect(scanText("f", ["", "c", "Users", "x"].join("/"), rules).map(f => f.rule)).toEqual(["user-path"]);
});
it("finds vault references", () => {
  for (const text of ["One" + "Drive", ["Documents", "Brain"].join("\\"), "Ob" + "sidian", "private-notes"]) {
    expect(scanText("f", text, rules).map(f => f.rule)).toContain("vault");
  }
});
it("finds configured emails, IDs and every token family", () => {
  expect(scanText("f", "mail someone@example.test", rules)[0]!.rule).toBe("email");
  expect(scanText("f", 'publicId: "Zq7Xk2Pw"', rules)[0]!.rule).toBe("player-id");
  expect(scanText("f", "prefixZq7Xk2PwSuffix", rules)).toEqual([]);
  for (const token of ["ghp_" + "a".repeat(36), "github_pat_" + "a".repeat(22), "sk-" + "b".repeat(24), "AKIA" + "A".repeat(16), "xoxb-" + "c".repeat(12), "-----BEGIN " + "RSA PRIVATE KEY-----"]) {
    expect(scanText("f", token, rules).map(f => f.rule)).toEqual(["token"]);
  }
});
it("matches token prefixes case-sensitively, so base64 data is not a token", () => {
  for (const text of ["AkIA" + "bC9dE8fG7hI6jK5l", "akia" + "A".repeat(16), "GHP_" + "a".repeat(36)]) {
    expect(scanText("f", text, rules)).toEqual([]);
  }
});
it("matches names on unicode word boundaries, any case", () => {
  expect(scanText("f", "thanks " + creditName.toUpperCase(), rules)).toHaveLength(1);
  expect(scanText("f", "generic Erica éTestname Testname界 Testname_", rules)).toEqual([]);
  const literal = buildRules({ ...config, names: ["Test.name"] });
  expect(scanText("f", "TestXname Test.name", literal)).toHaveLength(1);
});
it("takes the permitted credit from config, never from source", () => {
  const line = "Hold Space to see spawn heat - " + creditName;
  expect(scanText("notes.md", line, rules, { releaseNotes: true })).toHaveLength(1);
  expect(scanText("notes.md", line, rules, { releaseNotes: true, credits })).toEqual([]);
  const file = join(temp(), "c.json"); writeFileSync(file, JSON.stringify({ ...config, releaseNoteCredits: credits }));
  const repo = temp(); execFileSync("git", ["init", "-q"], { cwd: repo });
  expect(loadPersonalConfig(repo, { file, settingsFile: join(repo, "none.json") }).releaseNoteCredits).toEqual(credits);
  writeFileSync(file, JSON.stringify({ ...config, releaseNoteCredits: [""] }));
  expect(() => loadPersonalConfig(repo, { file, settingsFile: join(repo, "none.json") })).toThrow(/personal-info config missing/);
});
it("allows the credit only at line ends in release notes", () => {
  const line = "Hold Space to see spawn heat - " + creditName;
  expect(scanText("notes.md", line + "\r\nNext", rules, { releaseNotes: true, credits })).toEqual([]);
  expect(scanText("docs/x.md", line, rules)).toHaveLength(1);
  expect(scanText("notes.md", creditName + " suggested Hold Space - " + creditName, rules, { releaseNotes: true, credits })).toHaveLength(1);
  expect(scanText("notes.md", line + " extra", rules, { releaseNotes: true, credits })).toHaveLength(1);
  expect(scanText("notes.md", line.toUpperCase(), rules, { releaseNotes: true, credits })).toHaveLength(1);
  expect(scanText("notes.md", "An unrelated idea - " + creditName, rules, { releaseNotes: true, credits })).toHaveLength(1);
});
it("finds personal filenames and masks diagnostic paths", () => {
  const root = temp(); writeFileSync(join(root, "Testname.ts"), "safe");
  expect(scanFiles(root, ["Testname.ts"], rules)).toEqual([{ file: "T***.ts", line: 1, rule: "name", masked: "T***" }]);
  const findings = scanText(join(root, "Testname.txt"), "Testname", rules);
  expect(findings[0]!.file).toBe("T***.txt");
  expect(formatFindings(findings)).not.toContain(root);
  expect(formatFindings(findings)).not.toContain("Testname");
});
it("reports line numbers and masks values", () => {
  const [finding] = scanText("a.ts", "ok\nTestname here", rules);
  expect(finding).toEqual({ file: "a.ts", line: 2, rule: "name", masked: "T***" });
  expect(formatFindings([finding!])).toBe("a.ts:2 name T***");
});
it("scans binary files and UTF-8 names", () => {
  const root = temp();
  writeFileSync(join(root, "image.png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 0]), Buffer.from(["C:", "Users", "x"].join("\\"))]));
  expect(scanFiles(root, ["image.png"], rules).map(f => f.rule)).toEqual(["user-path"]);
  writeFileSync(join(root, "text.txt"), "Téstfixture");
  expect(scanFiles(root, ["text.txt"], buildRules({ ...config, names: ["Téstfixture"] }))).toHaveLength(1);
});
it("preserves unicode word boundaries when scanning UTF-8 files", () => {
  const root = temp(); writeFileSync(join(root, "text.txt"), "éTestname Testname界");
  expect(scanFiles(root, ["text.txt"], rules)).toEqual([]);
});
it("fails closed without a valid nonempty config", () => {
  const root = temp(); const file = join(root, "config.json");
  expect(() => loadPersonalConfig(root, { file })).toThrow(/personal-info config missing/);
  for (const value of ["{", "null", JSON.stringify({ ...config, names: [] }), JSON.stringify({ ...config, names: [" "] }), JSON.stringify({ ...config, emails: [4] })]) {
    writeFileSync(file, value);
    expect(() => loadPersonalConfig(root, { file })).toThrow(/personal-info config missing/);
  }
});
it("adds history and config emails and settings ID, excluding noreply", () => {
  const root = temp();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.name", "tester"); git("config", "user.email", "dev@example.test");
  git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture");
  git("config", "user.email", "other@example.test");
  const file = join(root, "config.json"); const settingsFile = join(root, "settings.json");
  writeFileSync(file, JSON.stringify({ ...config, emails: [...config.emails, "tester@users.noreply.github.com"] }));
  writeFileSync(settingsFile, JSON.stringify({ publicId: "Settings1" }));
  const result = loadPersonalConfig(root, { file, settingsFile });
  expect(result.emails).toEqual(expect.arrayContaining(["dev@example.test", "other@example.test", "someone@example.test"]));
  expect(result.emails.some(e => e.endsWith("@users.noreply.github.com"))).toBe(false);
  expect(result.playerIds).toContain("Settings1");
  expect(new Set(result.emails).size).toBe(result.emails.length);
});
it("reads the default config location and tolerates absent settings", () => {
  const root = temp(); mkdirSync(join(root, "tools/public"), { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "pipe" });
  writeFileSync(join(root, "tools/public/personal.local.json"), JSON.stringify(config));
  expect(loadPersonalConfig(root, { settingsFile: join(root, "missing.json") }).names).toEqual(config.names);
});
