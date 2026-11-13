// Run from any working directory: node --experimental-strip-types tools/training/drill-client.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import type { PreparedDrill } from "../../packages/core/src/training/drills.ts";

/** The CLI's serialized boundary keeps upstream types out of the tools compiler. */
export interface ClientBuild {
  data: { drillId: string; startTick: number; ownClientId: string; gameStartInfo: unknown };
  json: string; snapshot: Uint8Array; startTick: number;
  unitTypes: string[]; ownName: string | undefined; opponentNames: string[];
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const assets = new URL("../../apps/launcher/resources/training/drills/", import.meta.url);
const read = (url: URL) => JSON.parse(readFileSync(url, "utf8"));

/** Vite compiles the existing engine imports and preserves upstream's class-field semantics. */
export async function buildClients(): Promise<ClientBuild[]> {
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null },
    resolve: { alias: [{ find: /^resources\/(.*)$/, replacement: fileURLToPath(new URL("../../vendor/openfront/resources/$1", import.meta.url)) }] },
    ssr: { noExternal: [/@openfront\//, /@flashfront\//] } });
  try {
    const engine = await server.ssrLoadModule("/packages/training-engine/src/drill-client.ts") as {
      buildDrillClient(board: unknown, script: unknown, check: PreparedDrill["check"], snapshotFormat: string): Promise<ClientBuild>;
    };
    const { DRILL_CATALOG } = await server.ssrLoadModule("/packages/core/src/training/catalog.ts") as { DRILL_CATALOG: PreparedDrill[] };
    const manifest = read(new URL("../engine-manifest.json", assets));
    const results: ClientBuild[] = [];
    for (const drill of DRILL_CATALOG) {
      const board = read(new URL(`boards/${drill.boardId}.json`, assets));
      if (board.engineCommit !== manifest.upstream.commit) throw new Error(`${drill.id}: engine commit differs from manifest`);
      results.push(await engine.buildDrillClient(board, read(new URL(`scripts/${drill.boardId}.json`, assets)), drill.check, manifest.snapshotFormat));
    }
    return results;
  } finally { await server.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await buildClients();
  const output = new URL("client/", assets);
  mkdirSync(output, { recursive: true });
  let bytes = 0;
  for (const { data, json, snapshot } of results) {
    writeFileSync(new URL(`${data.drillId}.json`, output), json);
    writeFileSync(new URL(`${data.drillId}.snapshot.bin`, output), snapshot);
    bytes += Buffer.byteLength(json) + snapshot.byteLength;
  }
  console.log(`Generated ${results.length * 2} files (${bytes} bytes) in drills/client/`);
}
