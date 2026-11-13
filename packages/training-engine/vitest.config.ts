import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The vendored engine imports its JSON data as `resources/...`.
export const resourcesAlias = { find: /^resources\/(.*)$/, replacement: fileURLToPath(new URL("../../vendor/openfront/resources/$1", import.meta.url)) };

export default defineConfig({
  resolve: { alias: [resourcesAlias] },
  test: { include: ["src/**/*.test.ts"], testTimeout: 120000 },
});
