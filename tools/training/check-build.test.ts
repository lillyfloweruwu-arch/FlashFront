import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { expect, it } from "vitest";
import { checkChunks, checkMainChunks, checkMaps, ENGINE_MARKER } from "./check-build.ts";

function tree(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), "ff-check-"));
  for (const [path, body] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); }
  return root;
}
const raw = Buffer.from("tiles".repeat(100));
const entry = (packed: Buffer, body = raw) => ({ key: "onion", id: "Onion", files: { "map.bin": { bytes: body.length, sha256: createHash("sha256").update(body).digest("hex"), packedBytes: packed.length } } });

it("map packs must unpack to the manifest's exact bytes", () => {
  const packed = brotliCompressSync(raw);
  expect(checkMaps({ maps: [entry(packed)] }, tree({ "onion/map.bin.br": packed }))).toEqual([]);
  expect(checkMaps({ maps: [entry(packed)] }, tree({}))).toEqual(["missing onion/map.bin.br"]);
  const other = brotliCompressSync(Buffer.from("other"));
  expect(checkMaps({ maps: [entry(other, raw)] }, tree({ "onion/map.bin.br": other }))).toEqual(["onion/map.bin does not match the manifest"]);
  expect(checkMaps({ maps: [] }, tree({}))).toEqual(["manifest lists no maps"]);
});

const html = (src: string) => `<script type="module" src="./assets/${src}"></script>`;
it("engine code may only sit in the Training worker, behind a dynamic import", () => {
  const good = tree({
    "end-review.html": html("nudge-a.js"), "training.html": html("TrainingHost-a.js"), "review.html": html("TrainingHost-a.js"),
    "index.html": html("index-a.js"), "obs.html": html("obs-a.js"), "nudge.html": html("nudge-a.js"),
    "assets/index-a.js": `import{x}from"./style-a.js";const T=()=>import("./TrainingHost-a.js");`,
    "assets/style-a.js": "export const x=1;", "assets/obs-a.js": `import"./style-a.js";`, "assets/nudge-a.js": "",
    "assets/TrainingHost-a.js": `import{c}from"./client-a.js";`, "assets/client-a.js": `import("./SnapshotWorker.worker-a.js")`,
    "assets/SnapshotWorker.worker-a.js": `function ${ENGINE_MARKER}(){}`,
  });
  expect(checkChunks(good)).toEqual([]);
  const leaked = tree({
    "end-review.html": html("obs-a.js"), "training.html": html("TrainingHost-a.js"), "review.html": html("TrainingHost-a.js"),
    "assets/TrainingHost-a.js": `import("./SnapshotWorker.worker-a.js")`,
    "index.html": html("index-a.js"), "obs.html": html("obs-a.js"), "nudge.html": html("nudge-a.js"),
    "assets/index-a.js": `import{c}from"./client-a.js";`, "assets/client-a.js": "", "assets/obs-a.js": "", "assets/nudge-a.js": `var a="${ENGINE_MARKER}"`,
    "assets/SnapshotWorker.worker-a.js": `function ${ENGINE_MARKER}(){}`,
  });
  expect(checkChunks(leaked)).toEqual([
    "engine code should be in exactly the SnapshotWorker chunk, found in: SnapshotWorker.worker-a.js, nudge-a.js",
    "index.html statically loads Training code: assets/client-a.js",
    "nudge.html statically loads Training code: assets/nudge-a.js",
  ]);
});

it("keeps engine code out of main startup while both Node workers reach it", () => {
  const root = tree({ "index.js": 'import "./common.js";const worker="./review.worker.js";', "common.js": "export const x=1;",
    "record-drill.worker.js": 'import("./chunks/engine.js");', "review.worker.js": 'import { runner } from "./chunks/engine.js";',
    "chunks/engine.js": `export function ${ENGINE_MARKER}(){}; export const runner=1;` });
  expect(checkMainChunks(root)).toEqual([]);
  writeFileSync(join(root, "common.js"), 'export { runner } from "./chunks/engine.js";');
  expect(checkMainChunks(root)).toContain("main/index.js statically loads engine code: chunks/engine.js");
});

it("rejects missing Node workers instead of accepting a stale renderer-only build", () => {
  expect(checkMainChunks(tree({ "index.js": "" }))).toEqual(["missing main/record-drill.worker.js", "missing main/review.worker.js"]);
});


it("rejects workspace imports that work in the repo but crash in an installed app", () => {
  for (const statement of ['import { RECORD_COMMITS } from "@flashfront/training-engine/protocol";', 'const engine = import("@openfront/engine");', 'const engine = require("@flashfront/training-engine/protocol");']) {
    const root = tree({ "index.js": statement, "record-drill.worker.js": `function ${ENGINE_MARKER}(){}`, "review.worker.js": `function ${ENGINE_MARKER}(){}` });
    expect(checkMainChunks(root)).toContain("main/index.js imports an unpackaged workspace dependency");
  }
});
