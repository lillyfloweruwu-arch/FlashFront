import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";

const root = resolve("apps/launcher/out/renderer");
async function initial(entry) {
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const text = await readFile(file, "utf8");
    assert(!/H4sI|gzip-u8-v1|heatmaps\.json/.test(text), `Eager heat data in ${file}`);
    const imports = file.endsWith(".html") ? [...text.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(m => m[1])
      : [...text.matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s*)?|\bexport\s+[^;]*?\s+from\s*)["']([^"']+)["']/g)].map(m => m[1]);
    for (const path of imports) if (path.startsWith(".")) await visit(resolve(dirname(file), path));
  }
  await visit(resolve(root, entry));
  const bytes = (await Promise.all([...visited].filter(f => f.endsWith(".js")).map(async f => (await stat(f)).size))).reduce((a, b) => a + b, 0);
  console.log(`${entry}: ${bytes} initial JS bytes; no compressed heat data in static import graph (${visited.size} files)`);
}
await initial("index.html"); await initial("obs.html");
for (const file of await readdir(resolve(root, "assets"))) if (/heat-(?:data|worker).*\.js$/.test(file) || /^heat\.worker.*\.js$/.test(file)) console.log(`${file}: ${(await stat(resolve(root, "assets", file))).size} lazy bytes`);
