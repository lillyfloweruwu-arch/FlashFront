import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
// Preserve workspace symlinks without probing Windows network drives. Resolve
// React DOM's private dependency from its real package location under pnpm.
const scheduler = require.resolve("scheduler", { paths: [dirname(require.resolve("react-dom/package.json"))] });
// Import workspace packages by their real source path. Through preserveSymlinks they were served as
// /node_modules/@flashfront/* module ids, so edits in packages/* never invalidated them (stale UI,
// 2026-10-17). Exact aliases keep module ids and files on disk the same.
const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages");
const workspaceAliases = ["ui", "core"].flatMap(name => [
  { find: new RegExp(`^@flashfront/${name}$`), replacement: resolve(packages, name, "src/index.ts") },
  { find: new RegExp(`^@flashfront/${name}/(.+)$`), replacement: resolve(packages, name, "src") + "/$1" },
]);
export default defineConfig({
  // Workspace packages are source, not deps: pre-bundling them left a stale cache that served old
  // UI code after changes (seen twice on 2026-10-17).
  optimizeDeps: { exclude: ["@flashfront/ui", "@flashfront/core"] },
  plugins: [tailwindcss()],
  resolve: { preserveSymlinks: true, dedupe: ["react", "react-dom"], alias: [...workspaceAliases, { find: "scheduler", replacement: scheduler }] },
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
