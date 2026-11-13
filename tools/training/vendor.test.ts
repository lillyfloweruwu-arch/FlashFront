import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { checkClient, importClosure, LICENSE_FILES, MAP_FILES, PINNED_COMMIT, readManifest, vendorClient } from "./vendor.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const vendorRoot = join(repoRoot, "vendor/openfront");

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ff-vendor-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

it("follows relative, aliased, type-only and resource imports but not third-party packages", () => {
  const root = tree({
    "packages/engine/src/GameRunner.ts": `import { z } from "zod";\nimport type { T } from "@openfront/engine-api/T";\nimport { a } from "./a";\nimport q from "resources/Q.json";`,
    "packages/engine/src/a.ts": `export { b } from "@openfront/zbin";`,
    "packages/engine-api/src/T.ts": `export type T = number;`,
    "packages/zbin/src/index.ts": `export const b = 1;`,
    "resources/Q.json": `{}`,
    "packages/engine/src/unused.ts": ``,
  });
  expect(importClosure(root, ["packages/engine/src/GameRunner.ts"])).toEqual([
    "packages/engine-api/src/T.ts", "packages/engine/src/GameRunner.ts", "packages/engine/src/a.ts", "packages/zbin/src/index.ts", "resources/Q.json",
  ]);
});

it("refuses a closure that reaches proprietary or client code", () => {
  const root = tree({ "packages/engine/src/GameRunner.ts": `import "../../../proprietary/skin";`, "proprietary/skin.ts": `` });
  expect(() => importClosure(root, ["packages/engine/src/GameRunner.ts"])).toThrow(/excluded path proprietary/);
});

it("the manifest pins exactly one reviewed commit and hashes every shipped map file", () => {
  const manifest = readManifest();
  expect(manifest.upstream.commit).toBe(PINNED_COMMIT);
  expect(manifest.maps.length).toBeGreaterThan(100);
  for (const map of manifest.maps) {
    expect(map.id).toMatch(/^[A-Z]/);
    expect(Object.keys(map.files).sort()).toEqual([...MAP_FILES].sort());
    for (const f of Object.values(map.files)) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(f.bytes).toBeGreaterThan(0);
      expect(f.packedBytes).toBeGreaterThan(0);
    }
  }
});

it("vendored files are exactly the manifest's closure, unmodified, with licenses and no excluded paths", () => {
  const manifest = readManifest();
  const listed = new Map(manifest.sourceFiles.map((f) => [f.path, f]));
  const extra = new Set(["UPSTREAM.md", "tsconfig.json", ...["engine", "engine-api", "engine-lib", "zbin"].map((p) => `packages/${p}/package.json`)]);
  const onDisk = walk(vendorRoot).map((p) => relative(vendorRoot, p).replace(/\\/g, "/")).filter((p) => !extra.has(p) && !p.includes("node_modules/") && !p.startsWith("client/") && p !== "client-manifest.json");
  expect(onDisk.sort()).toEqual([...listed.keys()].sort());
  for (const [path, f] of listed) {
    expect(createHash("sha256").update(readFileSync(join(vendorRoot, path))).digest("hex"), path).toBe(f.sha256);
    expect(path).not.toMatch(/^(proprietary|src)\/|\.test\.ts$|(^|\/)(tests?|fixtures?)\//);
  }
  for (const license of LICENSE_FILES) expect(existsSync(join(vendorRoot, license)), license).toBe(true);
  expect(readFileSync(join(vendorRoot, "UPSTREAM.md"), "utf8")).toContain(PINNED_COMMIT);
});

it("the worker accepts exactly the record builds the manifest proved", () => {
  const manifest = readManifest();
  const protocol = readFileSync(join(repoRoot, "packages/training-engine/src/protocol.ts"), "utf8");
  expect(manifest.recordCommits[0]).toBe(manifest.upstream.commit);
  expect(protocol).toContain(`ENGINE_COMMIT = "${manifest.upstream.commit}"`);
  const listed = [...protocol.matchAll(/"([0-9a-f]{40})"/g)].map((m) => m[1]);
  expect(new Set(listed)).toEqual(new Set(manifest.recordCommits));
});

/** A checkout with the client's entries, its redirect targets, one engine file, a stylesheet with a font and
 * `assetUrl` images, plus things that must stay out. */
function clientUpstream(): string {
  return tree({
    "src/client/ClientGameRunner.ts": `import { LocalServer } from "./LocalServer";\nimport { WorkerClient } from "./WorkerClient";\nimport { getAuth } from "./Auth";\nimport Worker from "@openfront/engine/worker/Worker.worker?worker&inline";\nimport "./styles.css";\nimport { EventBus } from "@openfront/shared/EventBus";\nimport en from "resources/lang/en.json";\nconst icon = assetUrl("images/Sword.svg");\nconst gone = assetUrl("images/Missing.svg");\nconst song = assetUrl("sounds/effects/click.mp3");`,
    "src/client/LocalServer.ts": `import { run } from "@openfront/engine/GameRunner";`,
    "src/client/WorkerClient.ts": `export class WorkerClient {}`,
    "src/client/Auth.ts": `import { x } from "src/client/UserSettings";`,
    "src/client/UserSettings.ts": `export const x = 1;`,
    "src/client/styles.css": `@import "tailwindcss";\n@import "./extra.css";\n@font-face { src: url("../../resources/fonts/a.woff") }\n.x { background: url(data:image/png;base64,AA) }`,
    "src/client/extra.css": `.y {}`,
    "src/client/ClientGameRunner.test.ts": `export {}`,
    "packages/engine/src/worker/Worker.worker.ts": `import { run } from "../GameRunner";`,
    "packages/engine/src/GameRunner.ts": `export const run = 1;`,
    "packages/shared/src/EventBus.ts": `export class EventBus {}`,
    "resources/lang/en.json": `{}`,
    "resources/fonts/a.woff": "font",
    "resources/images/Sword.svg": "<svg/>",
    "resources/atlases/msdf-atlas.json": `{}`,
    "resources/flags/uk_us_flag.svg": "<svg/>",
    "resources/sounds/effects/click.mp3": "mp3",
    "proprietary/images/Missing.svg": "<svg/>",
  });
}
const FIXTURE_ENTRIES = ["src/client/ClientGameRunner.ts", "packages/shared/src/EventBus.ts"];

function vendorFixture() {
  const out = tree({ "packages/engine/src/GameRunner.ts": `export const run = 1;` });
  return { out, manifest: vendorClient(clientUpstream(), out, FIXTURE_ENTRIES) };
}

it("client closure excludes proprietary and tests", () => {
  const { manifest } = vendorFixture();
  const paths = [...manifest.sourceFiles, ...manifest.assets].map((f) => f.path);
  expect(paths.length).toBeGreaterThan(5);
  for (const path of paths) expect(path).not.toMatch(/^proprietary\/|\.test\.ts$|(^|\/)tests?\//);
  expect(manifest.assets.map((f) => f.path).sort()).toEqual(["resources/atlases/msdf-atlas.json", "resources/flags/uk_us_flag.svg", "resources/fonts/a.woff", "resources/images/Sword.svg"]);
  expect(manifest.missing).toEqual(["resources/images/Missing.svg"]);
});

it("client closure has the four redirect targets", () => {
  const { out, manifest } = vendorFixture();
  const paths = manifest.sourceFiles.map((f) => f.path);
  for (const target of ["src/client/LocalServer.ts", "src/client/WorkerClient.ts", "packages/engine/src/worker/Worker.worker.ts", "src/client/Auth.ts"]) {
    expect(paths, target).toContain(target);
    expect(existsSync(join(out, "client", target)), target).toBe(true);
  }
  // Engine files already vendored are referenced, not copied twice.
  expect(paths).not.toContain("packages/engine/src/GameRunner.ts");
  expect(existsSync(join(out, "client/packages/engine/src/GameRunner.ts"))).toBe(false);
});

it("client byte check", () => {
  const { out, manifest } = vendorFixture();
  expect(() => checkClient(manifest, out)).not.toThrow();
  writeFileSync(join(out, "client/src/client/Auth.ts"), "// edited");
  expect(() => checkClient(manifest, out)).toThrow("client file changed: src/client/Auth.ts");
});

it("the vendored client matches its manifest byte for byte and keeps the four redirect targets", () => {
  const manifest = JSON.parse(readFileSync(join(vendorRoot, "client-manifest.json"), "utf8"));
  expect(manifest.upstream.commit).toBe(PINNED_COMMIT);
  expect(() => checkClient(manifest, vendorRoot)).not.toThrow();
  const paths = manifest.sourceFiles.map((f: { path: string }) => f.path);
  for (const target of ["src/client/LocalServer.ts", "src/client/WorkerClient.ts", "packages/engine/src/worker/Worker.worker.ts", "src/client/Auth.ts"]) expect(paths, target).toContain(target);
  for (const f of [...manifest.sourceFiles, ...manifest.assets]) expect(f.path).not.toMatch(/^proprietary\/|\.test\.ts$|(^|\/)tests?\//);
});
