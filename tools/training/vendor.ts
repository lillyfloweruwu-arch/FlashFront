// Vendors OpenFront's engine at one pinned build and packs its maps for Training.
//   node --experimental-strip-types tools/training/vendor.ts source <upstream-checkout>
//   node --experimental-strip-types tools/training/vendor.ts maps <upstream-checkout> <out-dir>
//   node --experimental-strip-types tools/training/vendor.ts client <upstream-checkout>
// `source` copies the engine's import closure into vendor/openfront and rewrites the manifest.
// `client` copies the game client's closure (and the assets it fetches) into vendor/openfront/client.
// `maps` brotli-packs every map file into <out-dir> and checks each against the manifest.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

export const PINNED_COMMIT = "14ba82badb1e945ef2e758999238339404fdb788";
export const PINNED_TAG = "v0.35.4";
/** Earlier builds whose records replay on the pinned engine: `source` refuses to vendor unless every
 * closure file and every map file is byte-identical at each of these commits. v0.35.3 to v0.35.4
 * changed only server archiving (#6119). */
export const COMPATIBLE = [{ tag: "v0.35.3", commit: "a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7" }];
export const UPSTREAM_REPO = "https://github.com/openfrontio/OpenFrontIO";
export const PACKAGES = ["engine", "engine-api", "engine-lib", "zbin"] as const;
/** What the adapter imports; the scanner follows every import from these. */
export const ENTRIES = [
  "packages/engine/src/GameRunner.ts",
  "packages/engine-api/src/Schemas.ts",
  "packages/engine-api/src/game/GameTypes.ts",
  "packages/engine-api/src/game/GameUpdates.ts",
  "packages/engine-api/src/game/MapFiles.ts",
];
export const LICENSE_FILES = ["LICENSE", "LICENSE-ASSETS", "LICENSING.md", "CREDITS.md", "resources/LICENSE"];
export const MAP_FILES = ["manifest.json", "map.bin", "map4x.bin", "map16x.bin"] as const;
/** What Training's page boots from upstream's client (from the R2 spike's entry); the scanner follows every import. */
export const CLIENT_ENTRIES = [
  "src/client/ClientGameRunner.ts",
  "src/client/GameStartingModal.ts",
  "src/client/LangSelector.ts",
  "src/client/components/baseComponents/Button.ts",
  "src/client/components/baseComponents/Modal.ts",
  "src/client/styles.css",
  "src/client/styles/core/typography.css",
  "src/client/styles/core/variables.css",
  "packages/shared/src/EventBus.ts",
  "packages/shared/src/SharedUtil.ts",
];
/** Fetched by URL at runtime, so no import reaches them. The R2 spike's request log named these beyond what
 * `assetUrl("images|sprites|atlases|fonts/...")` literals in the closure already give. Sounds, flags other than
 * English's, and every `proprietary/` file are left out. */
export const CLIENT_RUNTIME_ASSETS = ["resources/atlases/msdf-atlas.json", "resources/flags/uk_us_flag.svg"];
/** Paths FORBIDDEN excludes from the engine that the client closure may use. */
const CLIENT_ALLOWED = [/^src\/client\//, /^packages\/shared\//];
const BINARY = /\.(png|svg|webp|jpe?g|gif|woff2?|ttf|mp3|ogg|wasm)$/;
const FORBIDDEN = [/^proprietary\//, /^src\//, /(^|\/)node_modules\//, /\.test\.ts$/, /(^|\/)(tests?|fixtures?|__mocks__)\//];

/** `id` is the map's GameMapType value as records name it ("Central America"); `key` is its folder. */
export interface MapEntry { key: string; id: string; files: Record<string, { bytes: number; sha256: string; packedBytes: number }> }

function mapId(root: string, key: string): string {
  const id = mapIds(root).get(key);
  if (!id) throw new Error(`map folder ${key} has no GameMapType entry`);
  return id;
}

/** Folder key to GameMapType value, read from upstream's generated map list. */
export function mapIds(root: string): Map<string, string> {
  const src = readFileSync(join(root, "packages/engine-api/src/game/Maps.gen.ts"), "utf8");
  const body = /export enum GameMapType \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
  return new Map([...body.matchAll(/^\s+(\w+) = "([^"]+)",/gm)].map((m) => [m[1]!.toLowerCase(), m[2]!]));
}
export interface EngineManifest {
  upstream: { repo: string; tag: string; commit: string };
  /** Every record build this engine replays exactly: the pinned commit first, then COMPATIBLE. */
  recordCommits: string[];
  snapshotFormat: string;
  sourceFiles: { path: string; bytes: number; sha256: string }[];
  licenses: string[];
  maps: MapEntry[];
}

const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");
const importRe = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** Resolves one import of `from` to an upstream-relative path, or null for third-party packages. */
export function resolveImport(from: string, spec: string, exists: (p: string) => boolean): string | null {
  let base: string;
  spec = spec.replace(/\?.*$/, "");
  if (spec.startsWith(".")) base = posix.join(posix.dirname(from), spec);
  else if (spec.startsWith("resources/") || spec.startsWith("src/")) base = spec;
  else if (spec === "@openfront/zbin") base = "packages/zbin/src/index";
  else {
    const m = /^@openfront\/([^/]+)\/(.+)$/.exec(spec);
    if (!m) return null;
    base = `packages/${m[1]}/src/${m[2]}`;
  }
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) if (exists(candidate)) return candidate;
  throw new Error(`${from}: cannot resolve ${spec}`);
}

/** What a stylesheet pulls in: `@import` and `url()` targets that are files of the checkout, not packages or data URIs. */
export function cssRefs(file: string, text: string): string[] {
  const refs = [...text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g), ...text.matchAll(/url\(\s*["']?([^"')\s]+)/g)].map((m) => m[1]!.replace(/[?#].*$/, ""));
  return refs.filter((r) => r !== "" && !/^(data:|https?:|\/\/)/.test(r)).flatMap((r) => (r.startsWith(".") ? [posix.join(posix.dirname(file), r)] : r.startsWith("/") ? [`resources${r}`] : []));
}

/** Every upstream file the entries reach, type-only imports included, sorted. `client` lets the scan through
 * the client's own sources, which the engine scan refuses. */
export function importClosure(root: string, entries: readonly string[] = ENTRIES, opts: { client?: boolean } = {}): string[] {
  const exists = (p: string) => existsSync(join(root, p)) && statSync(join(root, p)).isFile();
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    if (FORBIDDEN.some((re) => re.test(file)) && !(opts.client && CLIENT_ALLOWED.some((re) => re.test(file)))) throw new Error(`closure reaches excluded path ${file}`);
    seen.add(file);
    if (opts.client && file.endsWith(".css")) {
      for (const ref of cssRefs(file, readFileSync(join(root, file), "utf8"))) if (exists(ref)) queue.push(ref);
      continue;
    }
    if (!file.endsWith(".ts")) continue;
    for (const m of readFileSync(join(root, file), "utf8").matchAll(importRe)) {
      const target = resolveImport(file, m[1] ?? m[2] ?? m[3]!, exists);
      if (target !== null) queue.push(target);
    }
  }
  return [...seen].sort();
}

export function upstreamCommit(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function mapKeys(root: string): string[] {
  return readdirSync(join(root, "resources/maps"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export function pack(bytes: Buffer): Buffer {
  return brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } });
}

function vendorSource(root: string, repo: string, previous: EngineManifest | null): EngineManifest {
  if (upstreamCommit(root) !== PINNED_COMMIT) throw new Error(`upstream checkout is not ${PINNED_COMMIT}`);
  const out = join(repo, "vendor/openfront");
  // The client is vendored by its own subcommand; only the engine's files are rebuilt here.
  for (const name of existsSync(out) ? readdirSync(out) : []) if (name !== "client" && name !== "client-manifest.json") rmSync(join(out, name), { recursive: true, force: true });
  const files = importClosure(root);
  const mapFiles = mapKeys(root).flatMap((key) => MAP_FILES.map((name) => `resources/maps/${key}/${name}`));
  for (const c of COMPATIBLE) {
    const changed = execFileSync("git", ["diff", "--name-only", c.commit, PINNED_COMMIT, "--", ...files, ...mapFiles], { cwd: root, encoding: "utf8" }).trim();
    if (changed) throw new Error(`${c.tag} differs from ${PINNED_TAG} in engine or map files:\n${changed}`);
  }
  const sourceFiles = [];
  for (const path of [...files, ...LICENSE_FILES]) {
    const bytes = readFileSync(join(root, path));
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), bytes);
    sourceFiles.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const zod = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["node_modules/zod"].version as string;
  for (const name of PACKAGES) {
    const upstream = JSON.parse(readFileSync(join(root, `packages/${name}/package.json`), "utf8"));
    const deps = Object.fromEntries(Object.keys(upstream.dependencies ?? {}).map((d: string) => [d, d === "zod" ? zod : "workspace:*"]));
    writeFileSync(join(out, `packages/${name}/package.json`), JSON.stringify({ name: upstream.name, version: "0.0.0", private: true, license: "AGPL-3.0-only", type: "module", exports: upstream.exports, dependencies: deps }, null, 2) + "\n");
  }
  // Upstream compiles with legacy decorators and without define semantics for class fields; the
  // engine is only deterministic under those settings, so every tool reading this tree must use them.
  writeFileSync(join(out, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2020", module: "ESNext", moduleResolution: "bundler", experimentalDecorators: true, useDefineForClassFields: false,
    strictNullChecks: true, resolveJsonModule: true, skipLibCheck: true, noEmit: true, paths: { "resources/*": ["./resources/*"] },
  }, include: ["packages/*/src"] }, null, 2) + "\n");
  writeFileSync(join(out, "UPSTREAM.md"), upstreamDoc());
  return {
    upstream: { repo: UPSTREAM_REPO, tag: PINNED_TAG, commit: PINNED_COMMIT },
    recordCommits: [PINNED_COMMIT, ...COMPATIBLE.map((c) => c.commit)],
    snapshotFormat: readSnapshotFormat(root),
    sourceFiles,
    licenses: LICENSE_FILES.map((f) => `vendor/openfront/${f}`),
    maps: (previous?.maps ?? []).map((m) => ({ key: m.key, id: mapId(root, m.key), files: m.files })),
  };
}

/** The four upstream modules FlashFront replaces in the client (Vite redirects, written in R4 Task 3). */
export const CLIENT_REPLACED = [
  { path: "src/client/LocalServer.ts", why: "the singleplayer game server, replaced by a drill server that serves the recorded turns" },
  { path: "src/client/WorkerClient.ts", why: "the main-thread side of the game worker, replaced by one that restores a snapshot" },
  { path: "packages/engine/src/worker/Worker.worker.ts", why: "the worker that runs the engine, replaced by the Training worker" },
  { path: "src/client/Auth.ts", why: "sign-in and token refresh, stubbed so the client never makes its refresh call" },
] as const;

function upstreamDoc(): string {
  return `# Vendored OpenFront engine and client

Copied unmodified by \`tools/training/vendor.ts\` from ${UPSTREAM_REPO} at tag \`${PINNED_TAG}\`, commit \`${PINNED_COMMIT}\`.
Records from ${COMPATIBLE.map((c) => `${c.tag} (\`${c.commit}\`)`).join(", ")} also replay: their engine and map files are byte-identical.
Only the engine's import closure is included. Code is AGPL-3.0 (see LICENSE, including its Section 7 terms);
\`resources/\` data is CC BY-SA 4.0 (see LICENSE-ASSETS, resources/LICENSE, CREDITS.md). Package manifests are
regenerated with exact dependency versions. © OpenFront and Contributors.

## Client

\`client/\` holds OpenFront's game client at the same pin, mirroring upstream paths (for example
\`client/src/client/ClientGameRunner.ts\`), with \`client-manifest.json\` hashing every file. Training runs drills on it.
Entries: ${CLIENT_ENTRIES.map((e) => `\`${e}\``).join(", ")}.
The scan follows imports and stylesheet \`@import\`/\`url()\`; engine files already under \`packages/\` are referenced, not copied twice.
Runtime assets (images, sprites, atlases, fonts the client fetches by URL) come from \`assetUrl("images|sprites|atlases|fonts/...")\`
literals in the closure plus ${CLIENT_RUNTIME_ASSETS.map((a) => `\`${a}\``).join(", ")}. Sounds, other flags and everything under
\`proprietary/\` (All Rights Reserved) are not vendored; the manifest's \`missing\` list names assets that exist only there.
FlashFront replaces four upstream modules through build-time redirects; each replacement is a copy with the upstream AGPL header plus a
FlashFront note, and the upstream originals stay vendored unmodified:
${CLIENT_REPLACED.map((r) => `- \`${r.path}\`: ${r.why}.`).join("\n")}
`;
}

function readSnapshotFormat(root: string): string {
  const src = readFileSync(join(root, "packages/engine/src/snapshot/GameSnapshot.ts"), "utf8");
  const m = /SNAPSHOT_(?:FORMAT_)?VERSION\s*=\s*([^;\n]+)/.exec(src);
  return m ? m[1]!.trim() : "unversioned";
}

/** Packs every map file; with `expected`, any byte or hash difference throws. */
export function packMaps(root: string, outDir: string, expected?: readonly MapEntry[]): MapEntry[] {
  const want = expected ? new Map(expected.map((m) => [m.key, m])) : null;
  const maps: MapEntry[] = [];
  for (const key of mapKeys(root)) {
    const entry: MapEntry = { key, id: mapId(root, key), files: {} };
    for (const name of MAP_FILES) {
      const raw = readFileSync(join(root, "resources/maps", key, name));
      const packed = pack(raw);
      mkdirSync(join(outDir, key), { recursive: true });
      writeFileSync(join(outDir, key, `${name}.br`), packed);
      entry.files[name] = { bytes: raw.length, sha256: sha256(raw), packedBytes: packed.length };
      const prior = want?.get(key)?.files[name];
      if (want && (!prior || prior.sha256 !== entry.files[name]!.sha256)) throw new Error(`map ${key}/${name} does not match the manifest`);
    }
    maps.push(entry);
  }
  if (want && maps.length !== want.size) throw new Error("map set differs from the manifest");
  return maps;
}

export interface ClientManifest {
  upstream: { repo: string; tag: string; commit: string };
  /** Code, stylesheets and data the client's imports reach, as upstream-relative paths under `client/`. */
  sourceFiles: { path: string; bytes: number; sha256: string }[];
  /** Images, fonts and atlases fetched by URL, same layout. */
  assets: { path: string; bytes: number; sha256: string }[];
  /** `assetUrl` literals whose file is not in `resources/` (they live in `proprietary/`): need stand-ins. */
  missing: string[];
}

/** `assetUrl("images|sprites|atlases|fonts/...")` literals in the closure's code. */
function assetLiterals(root: string, files: readonly string[]): string[] {
  const found = new Set<string>();
  for (const file of files.filter((f) => f.endsWith(".ts"))) {
    for (const m of readFileSync(join(root, file), "utf8").matchAll(/assetUrl\(\s*["'`]\/?((?:images|sprites|atlases|fonts)\/[^"'`$]+)["'`]\s*\)/g)) found.add(`resources/${m[1]}`);
  }
  return [...found];
}

/** Copies the client's import closure and runtime assets to `<out>/client` and writes `<out>/client-manifest.json`.
 * Files the vendored engine already holds under `<out>/packages` are referenced, not copied. */
export function vendorClient(root: string, out: string, entries: readonly string[] = CLIENT_ENTRIES): ClientManifest {
  rmSync(join(out, "client"), { recursive: true, force: true });
  const files = importClosure(root, entries, { client: true }).filter((f) => !existsSync(join(out, f)));
  const isFile = (p: string) => existsSync(join(root, p)) && statSync(join(root, p)).isFile();
  const wanted = [...assetLiterals(root, files), ...CLIENT_RUNTIME_ASSETS];
  const missing = [...new Set(wanted.filter((p) => !isFile(p)))].sort();
  const listed = (paths: string[]) => paths.sort().map((path) => {
    const bytes = readFileSync(join(root, path));
    mkdirSync(dirname(join(out, "client", path)), { recursive: true });
    writeFileSync(join(out, "client", path), bytes);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const assetPaths = [...new Set([...files.filter((f) => BINARY.test(f)), ...wanted.filter(isFile)])];
  const manifest: ClientManifest = {
    upstream: { repo: UPSTREAM_REPO, tag: PINNED_TAG, commit: PINNED_COMMIT },
    sourceFiles: listed(files.filter((f) => !BINARY.test(f))),
    assets: listed(assetPaths),
    missing,
  };
  writeFileSync(join(out, "client-manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  return manifest;
}

/** Throws when a vendored client file is missing or differs from the manifest by a single byte. */
export function checkClient(manifest: Pick<ClientManifest, "sourceFiles" | "assets">, vendorRoot: string): void {
  for (const f of [...manifest.sourceFiles, ...manifest.assets]) {
    const path = join(vendorRoot, "client", f.path);
    if (!existsSync(path)) throw new Error(`client file missing: ${f.path}`);
    const bytes = readFileSync(path);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new Error(`client file changed: ${f.path}`);
  }
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const MANIFEST_PATH = join(repoRoot, "apps/launcher/resources/training/engine-manifest.json");

export function readManifest(path = MANIFEST_PATH): EngineManifest {
  return JSON.parse(readFileSync(path, "utf8")) as EngineManifest;
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === "") {
  const [mode, upstream, out] = process.argv.slice(2);
  if (!upstream || (mode !== "source" && mode !== "maps" && mode !== "client") || (mode === "maps" && !out)) {
    console.error("usage: vendor.ts source <upstream> | vendor.ts maps <upstream> <out-dir> | vendor.ts client <upstream>");
    process.exit(2);
  }
  const previous = existsSync(MANIFEST_PATH) ? readManifest() : null;
  if (mode === "client") {
    if (upstreamCommit(upstream) !== PINNED_COMMIT) throw new Error(`upstream checkout is not ${PINNED_COMMIT}`);
    const vendorRoot = join(repoRoot, "vendor/openfront");
    const manifest = vendorClient(upstream, vendorRoot);
    writeFileSync(join(vendorRoot, "UPSTREAM.md"), upstreamDoc());
    console.log(`vendored the client: ${manifest.sourceFiles.length} source files, ${manifest.assets.length} assets, ${manifest.missing.length} missing`);
  } else if (mode === "source") {
    const manifest = vendorSource(upstream, repoRoot, previous);
    if (manifest.maps.length === 0) manifest.maps = packMaps(upstream, join(repoRoot, "apps/launcher/build/training-maps"));
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 1) + "\n");
    console.log(`vendored ${manifest.sourceFiles.length} files, ${manifest.maps.length} maps`);
  } else {
    if (!previous) throw new Error("no manifest; run `source` first");
    if (upstreamCommit(upstream) !== previous.upstream.commit) throw new Error(`upstream checkout is not ${previous.upstream.commit}`);
    packMaps(upstream, out!, previous.maps);
    console.log(`packed ${previous.maps.length} maps into ${out}`);
  }
}
