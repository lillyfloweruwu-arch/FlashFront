import { defineConfig } from "electron-vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const scheduler = require.resolve("scheduler", { paths: [dirname(require.resolve("react-dom/package.json"))] });
// Import workspace packages by their real source path. Through preserveSymlinks they were served as
// /node_modules/@flashfront/* module ids, so edits in packages/* never invalidated them (stale UI,
// 2026-10-17). Exact aliases keep module ids and files on disk the same.
const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages");
const workspaceAliases = ["ui", "core", "cdp"].flatMap(name => [
  { find: new RegExp(`^@flashfront/${name}$`), replacement: resolve(packages, name, "src/index.ts") },
  { find: new RegExp(`^@flashfront/${name}/(.+)$`), replacement: resolve(packages, name, "src") + "/$1" },
]);
export default defineConfig(({ mode }) => ({
  // Production bundles koffi and ws; koffi's native binary ships as resources/koffi/win32_x64/koffi.node.
  // Dev keeps koffi external so it loads its binary from node_modules (bundled, dev could not find it).
  // @flashfront/ui is bundled only for its theme tokens (title-bar colors).
  main: { resolve: { alias: workspaceAliases }, build: { externalizeDeps: { exclude: ["@flashfront/cdp", "@flashfront/core", "@flashfront/ui", "ws", ...(mode === "production" ? ["koffi"] : [])] } } },
  preload: { build: { rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } } } },
  renderer: {
    // Workspace packages are source, not deps: pre-bundling them left a stale cache that served old
    // UI code after changes (seen twice on 2026-10-17).
    optimizeDeps: { exclude: ["@flashfront/ui", "@flashfront/core", "@flashfront/cdp"] },
    publicDir: resolve("resources"),
    resolve: { preserveSymlinks: true, dedupe: ["react", "react-dom"], alias: [...workspaceAliases, { find: "scheduler", replacement: scheduler }] },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    build: { rollupOptions: { input: { index: resolve("src/renderer/index.html"), obs: resolve("src/renderer/obs.html") } } },
  },
}));
