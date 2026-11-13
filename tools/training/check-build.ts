// Release gate for Training, run by `dist` between the renderer build and electron-builder:
//   node --experimental-strip-types tools/training/check-build.ts
// 1. Every packed map file exists and unpacks to the manifest's bytes and SHA-256.
// 2. Renderer engine code lives in SnapshotWorker; ordinary surfaces and main startup never
//    statically reach the client or engine. Record/review Node workers load the engine separately.
// 3. The vendored OpenFront client under vendor/openfront/client is byte-identical to its manifest.
// 4. The built worker rebuilds the synthetic record and matches its recorded hashes, which catches
//    a bundler compiling the engine with the wrong class-field semantics.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { brotliDecompressSync } from "node:zlib";
import { checkClient, type ClientManifest, type EngineManifest } from "./vendor.ts";

export const ENGINE_MARKER = "createGameRunnerFromSnapshot";
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function checkMaps(manifest: Pick<EngineManifest, "maps">, mapsDir: string): string[] {
  const problems: string[] = [];
  if (manifest.maps.length === 0) problems.push("manifest lists no maps");
  for (const map of manifest.maps) for (const [name, want] of Object.entries(map.files)) {
    const path = join(mapsDir, map.key, `${name}.br`);
    if (!existsSync(path)) { problems.push(`missing ${map.key}/${name}.br`); continue; }
    const packed = readFileSync(path);
    if (packed.length !== want.packedBytes) problems.push(`${map.key}/${name}.br is ${packed.length} bytes, manifest says ${want.packedBytes}`);
    const raw = brotliDecompressSync(packed);
    if (raw.length !== want.bytes || sha256(raw) !== want.sha256) problems.push(`${map.key}/${name} does not match the manifest`);
  }
  return problems;
}

/** Scripts an HTML entry loads, plus every chunk they import statically (dynamic imports excluded). */
export function staticChunks(rendererDir: string, html: string): Set<string> {
  const queue = [...readFileSync(join(rendererDir, html), "utf8").matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
  return chunks(rendererDir, queue);
}

/** Walk emitted relative ES imports and re-exports, resolving nested chunk directories. */
function chunks(root: string, queue: string[], dynamic = false): Set<string> {
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(join(root, file), "utf8");
    const imports = [...code.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w$*{}\s,]+from\s*)?["'](\.[^"']+\.js)["']/g)];
    if (dynamic) imports.push(...code.matchAll(/\bimport\s*\(\s*["'](\.[^"']+\.js)["']\s*\)/g));
    for (const m of imports) {
      const target = relative(root, resolve(root, dirname(file), m[1]!)).replaceAll("\\", "/");
      if (target.startsWith("../")) throw new Error(`chunk escapes build directory: ${file}`);
      queue.push(target);
    }
  }
  return seen;
}

export function checkChunks(rendererDir: string): string[] {
  const problems: string[] = [];
  const assets = readdirSync(join(rendererDir, "assets")).filter((f) => f.endsWith(".js")).sort();
  const engine = assets.filter((f) => readFileSync(join(rendererDir, "assets", f), "utf8").includes(ENGINE_MARKER));
  if (engine.length !== 1 || !engine[0]!.startsWith("SnapshotWorker.worker-")) problems.push(`engine code should be in exactly the SnapshotWorker chunk, found in: ${engine.join(", ") || "none"}`);
  for (const html of ["index.html", "obs.html", "nudge.html", "end-review.html"]) {
    if (!existsSync(join(rendererDir, html))) { problems.push(`missing renderer/${html}`); continue; }
    const reached = [...staticChunks(rendererDir, html)].filter((f) => engine.includes(f.replace("assets/", "")) || /(?:SnapshotWorker|training\.worker|TrainingHost|\/client-|\/upstream-entry-)/.test(f) || /\bfunction (?:joinLobby|createGameWorker)\b/.test(readFileSync(join(rendererDir, f), "utf8")));
    if (reached.length > 0) problems.push(`${html} statically loads Training code: ${reached.join(", ")}`);
  }
  for (const html of ["training.html", "review.html"]) {
    if (!existsSync(join(rendererDir, html))) { problems.push(`missing renderer/${html}`); continue; }
    const reached = chunks(rendererDir, [...staticChunks(rendererDir, html)], true);
    if (!engine.some(file => reached.has(`assets/${file}`))) problems.push(`${html} does not reach SnapshotWorker`);
  }
  return problems;
}

export function checkMainChunks(mainDir: string): string[] {
  const problems: string[] = [];
  // Workspace source packages are deliberately excluded from the installer.
  // Check every emitted chunk, including lazy workers, before packaging.
  for (const file of readdirSync(mainDir, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith(".js"))) {
    const code = readFileSync(join(mainDir, file), "utf8");
    if (/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']@(?:flashfront|openfront)\//.test(code)) {
      problems.push(`main/${file} imports an unpackaged workspace dependency`);
    }
  }
  const hasEngine = (file: string) => readFileSync(join(mainDir, file), "utf8").includes(ENGINE_MARKER);
  if (!existsSync(join(mainDir, "index.js"))) problems.push("missing main/index.js");
  else {
    const leaked = [...chunks(mainDir, ["index.js"])].filter(hasEngine);
    if (leaked.length) problems.push(`main/index.js statically loads engine code: ${leaked.join(", ")}`);
  }
  for (const worker of ["record-drill.worker.js", "review.worker.js"]) {
    if (!existsSync(join(mainDir, worker))) problems.push(`missing main/${worker}`);
    else if (![...chunks(mainDir, [worker], true)].some(hasEngine)) problems.push(`main/${worker} does not reach the built engine`);
  }
  return problems;
}

type BuiltReply = { status: string; reason?: string; value?: { snapshot?: Uint8Array } };
async function workerReply(path: string, input: unknown, tick?: number): Promise<BuiltReply> {
  const worker = new Worker(path, { workerData: input, stdout: true, stderr: true });
  worker.stdout?.resume(); worker.stderr?.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<BuiltReply>((resolveReply, reject) => {
      timer = setTimeout(() => reject(new Error("built worker timed out")), 60_000);
      worker.once("error", reject);
      worker.once("exit", code => reject(new Error(`built worker exited before replying (${code})`)));
      worker.once("message", message => resolveReply(tick === undefined ? message : message.result));
      if (tick !== undefined) worker.postMessage({ id: 1, tick });
    });
  } finally { clearTimeout(timer); await worker.terminate(); }
}

/** Exercise the actual emitted Node engine, including a corrupt-hash negative control. */
export async function checkBuiltWorker(mainDir: string, fixturesDir: string): Promise<string[]> {
  const problems: string[] = [];
  const record = JSON.parse(readFileSync(join(fixturesDir, "synthetic-record.json"), "utf8"));
  const read = (n: string) => new Uint8Array(brotliDecompressSync(readFileSync(join(fixturesDir, "maps/onion", `${n}.br`))));
  const map = { mapId: "Onion", mapSize: "Normal", manifest: JSON.parse(new TextDecoder().decode(read("manifest.json"))), mapBin: read("map.bin"), map4xBin: read("map4x.bin") };
  const corrupt = structuredClone(record);
  const hash = corrupt.turns.find((turn: { hash?: number }) => turn.hash !== undefined);
  if (!hash) return ["synthetic record has no hashes to verify"];
  hash.hash += 1;
  for (const name of ["record-drill.worker.js", "review.worker.js"]) {
    const path = join(mainDir, name);
    if (!existsSync(path)) { problems.push(`missing main/${name}`); continue; }
    const review = name === "review.worker.js";
    for (const [source, expected] of [[record, "ready"], [corrupt, "desync"]] as const) {
      try {
        const reply = await workerReply(path, { record: source, ownClientId: "Me00000A", map, tick: review ? 880 : 580, mistake: "sendSize", check: { kind: "send", minSendPct: 20, maxSendPct: 30, minReservePct: 35 } }, review ? 880 : undefined);
        if (expected === "ready" ? reply.status !== "ready" || !reply.value?.snapshot?.byteLength : reply.status !== "unavailable" || reply.reason !== "desync") problems.push(`${name}: expected ${expected}, got ${reply.status}/${reply.reason ?? "no reason"}`);
      } catch (error) { problems.push(`${name}: ${(error as Error).message}`); }
    }
  }
  return problems;
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === "") {
  const launcher = join(repoRoot, "apps/launcher");
  const manifest = JSON.parse(readFileSync(join(launcher, "resources/training/engine-manifest.json"), "utf8")) as EngineManifest;
  const mapsDir = join(launcher, "build/training-maps");
  const problems = existsSync(mapsDir) && statSync(mapsDir).isDirectory()
    ? checkMaps(manifest, mapsDir)
    : ["apps/launcher/build/training-maps is missing: run `pnpm training:maps <OpenFrontIO checkout at the pinned commit> apps/launcher/build/training-maps`"];
  try { checkClient(JSON.parse(readFileSync(join(repoRoot, "vendor/openfront/client-manifest.json"), "utf8")) as ClientManifest, join(repoRoot, "vendor/openfront")); }
  catch (e) { problems.push((e as Error).message); }
  const renderer = join(launcher, "out/renderer");
  const main = join(launcher, "out/main");
  problems.push(...checkChunks(renderer), ...checkMainChunks(main), ...(await checkBuiltWorker(main, join(repoRoot, "packages/training-engine/src/fixtures"))));
  if (problems.length > 0) { console.error(`Training build check failed:\n- ${problems.join("\n- ")}`); process.exit(1); }
  console.log(`Training build check passed: ${manifest.maps.length} maps, lazy SnapshotWorker and Node workers, both built Node workers match recorded hashes and reject corruption.`);
}
