import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const client = normalizePath(resolve(here, "../../../../vendor/openfront/client"));
const require = createRequire(resolve(here, "../../package.json"));
const antonio = require.resolve("@fontsource-variable/antonio/files/antonio-latin-wght-normal.woff2", { paths: [resolve(here, "../../../../packages/ui")] });
const emptyLogo = '<svg xmlns="http://www.w3.org/2000/svg"/>';

/** Give the Training entry its own vendor module graph. Other renderer inputs can import the
 * original client without receiving these replacements; the engine graph is shared unchanged. */
export function trainingRedirect(): Plugin {
  const shims: Record<string, string> = {
    LocalServer: resolve(here, "TrainingServer.ts"), WorkerClient: resolve(here, "SnapshotWorkerClient.ts"), Auth: resolve(here, "AuthStub.ts"),
    TerrainMapFileLoader: resolve(here, "TerrainMapFileLoader.ts"),
  };
  const worker = normalizePath(resolve(here, "SnapshotWorker.worker.ts"));
  return {
    name: "flashfront:training-redirect", enforce: "pre",
    transform(code, id) {
      if (normalizePath(id).split("?")[0]!.endsWith("/client/src/client/WorkerClient.ts")) {
        return { code: `import { requestRendererTimeout } from ${JSON.stringify(normalizePath(resolve(here, "renderer-lifecycle.ts")))};\n` + code.replaceAll("setTimeout(", "requestRendererTimeout("), map: null };
      }
      if (normalizePath(id).split("?")[0]!.endsWith("/client/src/client/hud/layers/RadialMenu.ts")) {
        const init = "this.createTooltipElement();";
        if (!code.includes(init)) throw new Error("Pinned radial menu initialization changed");
        return { code: `import { registerRendererCleanup } from ${JSON.stringify(normalizePath(resolve(here, "renderer-lifecycle.ts")))};\n` + code.replace(init, `${init}\nregisterRendererCleanup(() => { this.hideRadialMenu(); this.menuElement.remove(); this.tooltipElement?.remove(); });`), map: null };
      }
      if (/\/client\/src\/client\/controllers\/(BuildPreviewController|AttackingTroopsController)\.ts$/.test(normalizePath(id).split("?")[0]!)) {
        if (!code.includes("requestAnimationFrame(")) throw new Error("Pinned controller animation loop changed");
        return { code: `import { requestRendererFrame } from ${JSON.stringify(normalizePath(resolve(here, "renderer-lifecycle.ts")))};\n` + code.replaceAll("requestAnimationFrame(", "requestRendererFrame("), map: null };
      }
      if (normalizePath(id).split("?")[0]!.endsWith("/client/src/client/ClientGameRunner.ts")) {
        const connectionTimer = /setTimeout\(\(\) => \{\s*this\.connectionCheckInterval = setInterval\(\s*\(\) => this\.onConnectionCheck\(\),\s*1000,?\s*\);\s*\}, 20000\);/;
        if (!connectionTimer.test(code)) throw new Error("Pinned client connection timer changed; review the offline lifecycle adapter");
        // This offline transport has no connection to monitor. Upstream starts the interval
        // twenty seconds later even if stop() already ran, retaining every restarted game.
        return { code: code.replace(connectionTimer, "/* FlashFront: offline transport has no connection watchdog. */"), map: null };
      }
      if (!normalizePath(id).split("?")[0]!.endsWith("/client/src/client/hud/GameRenderer.ts")) return null;
      const listener = /window\.addEventListener\("resize",\s*\(\) =>\s*this\.transformHandler\.updateCanvasBoundingRect\(\),?\s*\);/;
      if (!listener.test(code)) throw new Error("Pinned GameRenderer resize hook changed; review the Training lifecycle adapter");
      return { code: `import { installRendererResize } from ${JSON.stringify(normalizePath(resolve(here, "renderer-lifecycle.ts")))};\n` + code.replace(listener, "installRendererResize(this.transformHandler);"), map: null };
    },
    async resolveId(source, importer) {
      if (!importer) return null;
      const parent = normalizePath(importer);
      const trainingVendor = parent.startsWith(client + "/") && /[?&]fftraining(?:&|$)/.test(parent);
      const trainingEntry = parent.startsWith(normalizePath(here) + "/");
      if (!trainingVendor && !trainingEntry) return null;
      if (trainingVendor) {
        // Preserve Vite's complete worker query, including &inline, exactly as in the spike.
        if (source.startsWith("@openfront/engine/worker/Worker.worker?")) return worker + source.slice(source.indexOf("?"));
        // Vite's alias plugin can run before resolveId, so handle the equivalent aliased path too.
        const normalized = normalizePath(source);
        if (normalized.startsWith(normalizePath(resolve(client, "../packages/engine/src/worker/Worker.worker")) + "?")) return worker + source.slice(source.indexOf("?"));
        const resourcePrefix = normalizePath(resolve(client, "../resources")) + "/";
        if (normalized.startsWith(resourcePrefix)) {
          const target = `${client}/resources/${normalized.slice(resourcePrefix.length)}`;
          if (existsSync(target.split("?")[0]!)) return target;
        }
        const match = /(?:^|\/)(LocalServer|WorkerClient|Auth|TerrainMapFileLoader)(?:\.ts)?$/.exec(source);
        if (match) return shims[match[1]!];
        if (source.endsWith("/fonts/OpenFront.ttf")) return antonio;
        if (source.endsWith("/images/OpenFrontLogo.svg")) return "\0training-empty-logo";
      }
      // Bare client dependencies live with the launcher, not beside vendored sources.
      const bare = !/^(?:\.|\/|[a-zA-Z]:)/.test(source) && !source.startsWith("@openfront/") && !source.startsWith("resources/") && !source.startsWith("src/");
      const resolved = await this.resolve(source, bare ? resolve(here, "entry.ts") : importer.split("?")[0], { skipSelf: true });
      if (resolved && normalizePath(resolved.id).startsWith(client + "/") && resolved.id.endsWith(".ts")) {
        return { ...resolved, id: resolved.id + "?fftraining" };
      }
      return resolved;
    },
    load(id) { if (id === "\0training-empty-logo") return `export default ${JSON.stringify("data:image/svg+xml," + encodeURIComponent(emptyLogo))}`; },
  };
}

/** Only manifest-listed, redistributable assets are served/copied. Proprietary paths never enter the build. */
export function trainingAssets(): Plugin {
  const manifest = JSON.parse(readFileSync(resolve(client, "../client-manifest.json"), "utf8")) as { assets: { path: string }[] };
  const assets = new Map<string, string | Buffer>();
  for (const file of manifest.assets) {
    if (file.path.startsWith("resources/")) assets.set(file.path.slice("resources/".length), readFileSync(resolve(client, file.path)));
  }
  assets.set("fonts/OpenFront.ttf", readFileSync(antonio));
  assets.set("images/OpenFrontLogo.svg", emptyLogo);
  const types: Record<string, string> = { svg: "image/svg+xml", png: "image/png", webp: "image/webp", json: "application/json", ttf: "font/woff2", woff2: "font/woff2" };
  return {
    name: "flashfront:training-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname.slice(1);
        const asset = assets.get(pathname);
        if (asset === undefined) return next();
        res.setHeader("Content-Type", types[pathname.split(".").at(-1)!] ?? "application/octet-stream");
        res.end(asset);
      });
    },
    generateBundle() { for (const [fileName, source] of assets) this.emitFile({ type: "asset", fileName, source }); },
  };
}

export const trainingAliases = [
  { find: /^@openfront\/shared\/(.+)$/, replacement: `${client}/packages/shared/src/$1` },
  { find: /^src\/(.+)$/, replacement: `${client}/src/$1` },
];
