import tailwindcss from "@tailwindcss/vite";
import { trainingRedirect, trainingAssets, trainingAliases } from "./src/training-client/vite-training";
import { defineConfig } from "electron-vite";
import { normalizePath, transformWithOxc, type Plugin } from "vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const scheduler = require.resolve("scheduler", { paths: [dirname(require.resolve("react-dom/package.json"))] });
// Import workspace packages by their real source path. Through preserveSymlinks they were served as
// /node_modules/@flashfront/* module ids, so edits in packages/* never invalidated them (stale UI,
// 2026-10-17). Exact aliases keep module ids and files on disk the same.
const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages");
const workspaceAliases = ["ui", "core", "cdp", "training-engine"].flatMap(name => [
  { find: new RegExp(`^@flashfront/${name}$`), replacement: resolve(packages, name, "src/index.ts") },
  { find: new RegExp(`^@flashfront/${name}/(.+)$`), replacement: resolve(packages, name, "src") + "/$1" },
]);
// The vendored OpenFront engine (Training only) imports its JSON data as `resources/...`.
const engineResources = { find: /^resources\/(.+)$/, replacement: resolve(packages, "../vendor/openfront/resources") + "/$1" };
// The engine is deterministic only as upstream compiles it: legacy decorators and no define
// semantics for class fields (vendor/openfront/tsconfig.json). Bundled builds do not pick up that
// nested tsconfig on their own, so vendored files are compiled with it explicitly.
const vendorDir = normalizePath(resolve(packages, "../vendor/openfront"));
// Real paths, not node_modules links (the renderer preserves symlinks), so the transform below matches.
const engineAliases = [
  { find: "@openfront/engine-api/worker/WorkerMessages", replacement: `${vendorDir}/client/packages/engine-api/src/worker/WorkerMessages.ts` },
  { find: /^@openfront\/zbin$/, replacement: `${vendorDir}/packages/zbin/src/index.ts` },
  { find: /^@openfront\/(engine|engine-api|engine-lib|zbin)\/(.+)$/, replacement: `${vendorDir}/packages/$1/src/$2` },
];
const engineTransform = (): Plugin => ({
  name: "flashfront:openfront-engine",
  enforce: "pre",
  async transform(code, id) {
    const file = id.split("?")[0]!;
    if (!file.startsWith(vendorDir) || !file.endsWith(".ts")) return;
    const out = await transformWithOxc(code, file, { lang: "ts", target: "es2020", tsconfig: `${vendorDir}/tsconfig.json` });
    return { code: out.code, map: out.map, moduleType: "js" };
  },
});
export default defineConfig(({ mode }) => ({
  // Production bundles koffi and ws; koffi's native binary ships per platform as resources/koffi/<platform>_x64/koffi.node.
  // Dev keeps koffi external so it loads its binary from node_modules (bundled, dev could not find it).
  // @flashfront/ui is bundled only for its theme tokens (title-bar colors).
  main: { plugins: [engineTransform()], resolve: { alias: [...workspaceAliases, ...engineAliases, engineResources] }, build: { rollupOptions: { input: { index: resolve("src/main/index.ts"), "record-drill.worker": resolve("src/main/record-drill.worker.ts"), "review.worker": resolve("src/main/review.worker.ts") } }, externalizeDeps: { exclude: ["@flashfront/cdp", "@flashfront/core", "@flashfront/ui", "@flashfront/training-engine", "ws", ...(mode === "production" ? ["koffi"] : [])] } } },
  preload: { build: { rollupOptions: { input: { index: resolve("src/preload/index.ts"), training: resolve("src/preload/training.ts"), review: resolve("src/preload/review.ts") }, output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: {
    define: { __ASSET_MANIFEST__: "{}", "process.env.WEBSOCKET_URL": JSON.stringify(""), "process.env.GAME_ENV": JSON.stringify("dev"), "process.env.API_DOMAIN": JSON.stringify("") },
    plugins: [trainingRedirect(), trainingAssets(), engineTransform(), tailwindcss()],
    // Workspace packages are source, not deps: pre-bundling them left a stale cache that served old
    // UI code after changes (seen twice on 2026-10-17).
    optimizeDeps: { exclude: ["@flashfront/ui", "@flashfront/core", "@flashfront/cdp", "@flashfront/training-engine"] },
    // The Training worker is its own ES chunk; nothing outside Training imports it.
    worker: { format: "es", plugins: () => [engineTransform()] },
    publicDir: resolve("resources"),
    resolve: { preserveSymlinks: false, dedupe: ["react", "react-dom"], alias: [...workspaceAliases, ...engineAliases, ...trainingAliases, engineResources, { find: "scheduler", replacement: scheduler }] },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    build: { rollupOptions: { input: { training: resolve("src/renderer/training.html"), review: resolve("src/renderer/review.html"), index: resolve("src/renderer/index.html"), obs: resolve("src/renderer/obs.html"), nudge: resolve("src/renderer/nudge.html"), "end-review": resolve("src/renderer/end-review.html") } } },
  },
}));
