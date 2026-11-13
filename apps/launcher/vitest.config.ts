import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Training tests that drive the real engine need the vendored engine's `resources/...` JSON imports.
export default defineConfig({
  resolve: { alias: [{ find: /^resources\/(.*)$/, replacement: fileURLToPath(new URL("../../vendor/openfront/resources/$1", import.meta.url)) }] },
});
