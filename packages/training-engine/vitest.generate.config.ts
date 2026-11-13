import { defineConfig } from "vitest/config";
import { resourcesAlias } from "./vitest.config.ts";

// Regenerates src/fixtures/synthetic-record.json: pnpm exec vitest run --config vitest.generate.config.ts
export default defineConfig({ resolve: { alias: [resourcesAlias] }, test: { include: ["src/fixtures/generate.ts", "src/drills/author.gen.ts"], testTimeout: 1800000 } });
