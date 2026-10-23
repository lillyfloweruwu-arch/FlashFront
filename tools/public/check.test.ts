import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("CLI fails closed, scans tracked files or marker, and supports repeated notes", () => {
  const root = mkdtempSync(join(tmpdir(), "public-cli-"));
  try {
    const dir = join(root, "tools/public"); mkdirSync(dir, { recursive: true });
    for (const file of ["check.ts", "personal.ts", "allowlist.ts"]) cpSync(fileURLToPath(new URL(file, import.meta.url)), join(dir, file));
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "pipe" });
    const run = (...args: string[]) => spawnSync(process.execPath, [join(dir, "check.ts"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, APPDATA: root } });
    expect(run().status).toBe(2);
    writeFileSync(join(dir, "personal.local.json"), JSON.stringify({ names: ["Fixtureperson", "Wren"], emails: [], playerIds: [], vaultMarkers: [], releaseNoteCredits: ["- Wren"] }));
    writeFileSync(join(root, "README.md"), "clean");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    expect(run().status).toBe(0);
    writeFileSync(join(root, "README.md"), "Fixtureperson");
    const dirty = run(); expect(dirty.status).toBe(1); expect(dirty.stdout).toContain("F***"); expect(dirty.stdout).not.toContain("Fixtureperson");
    writeFileSync(join(root, "README.md"), "clean");
    writeFileSync(join(root, ".flashfront-export"), JSON.stringify(["README.md"]));
    writeFileSync(join(root, "notes.md"), "Hold Space - Wren");
    writeFileSync(join(root, "other.md"), "Fixtureperson");
    expect(run("--dir", root, "--notes", join(root, "notes.md")).status).toBe(0);
    expect(run("--notes", join(root, "notes.md"), "--notes", join(root, "other.md")).status).toBe(1);
    expect(run("--unknown").status).toBe(2);
    writeFileSync(join(root, ".flashfront-export"), JSON.stringify(["../outside"]));
    expect(run().status).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
