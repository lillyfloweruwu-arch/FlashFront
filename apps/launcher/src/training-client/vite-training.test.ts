import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { trainingAssets, trainingRedirect } from "./vite-training";

const root = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\\/g, "/");
const vendor = root + "vendor/openfront/client/src/client/";
const call = (source: string, importer: string) => (trainingRedirect().resolveId as Function).call({ resolve: async () => null }, source, importer);
it("adapts pinned upstream loops for complete renderer teardown without changing vendor bytes", () => {
  const transform = trainingRedirect().transform as Function;
  for (const file of ["controllers/BuildPreviewController.ts", "controllers/AttackingTroopsController.ts"]) {
    const code = readFileSync(resolve(vendor, file), "utf8");
    const result = transform(code, vendor + file + "?fftraining");
    expect(result.code).toContain("requestRendererFrame(");
    expect(result.code).not.toContain("requestAnimationFrame(");
  }
  const runner = readFileSync(resolve(vendor, "ClientGameRunner.ts"), "utf8");
  const radial = readFileSync(resolve(vendor, "hud/layers/RadialMenu.ts"), "utf8");
  expect(transform(radial, vendor + "hud/layers/RadialMenu.ts?fftraining").code).toContain("this.menuElement.remove(); this.tooltipElement?.remove();");
  expect(transform(runner, vendor + "ClientGameRunner.ts?fftraining").code).not.toContain("this.connectionCheckInterval = setInterval(");
  expect(() => transform("changed pin", vendor + "ClientGameRunner.ts?fftraining")).toThrow("Pinned");
});
it("redirects only the Training instance of vendored modules, preserving the worker query", async () => {
  expect(await call("./LocalServer", vendor + "Transport.ts?fftraining")).toContain("TrainingServer.ts");
  expect(await call("./WorkerClient", vendor + "ClientGameRunner.ts?fftraining")).toContain("SnapshotWorkerClient.ts");
  expect(await call("./Auth.ts", vendor + "Api.ts?fftraining")).toContain("AuthStub.ts");
  expect(await call("./TerrainMapFileLoader", vendor + "ClientGameRunner.ts?fftraining")).toMatch(/training-client[/\\]TerrainMapFileLoader\.ts$/);
  expect(await call("./TerrainMapFileLoader", vendor + "ClientGameRunner.ts")).toBeNull();
  expect(await call("@openfront/engine/worker/Worker.worker?worker&inline", vendor + "WorkerClient.ts?fftraining")).toMatch(/SnapshotWorker\.worker\.ts\?worker&inline$/);
  expect(await call("./LocalServer", vendor + "Transport.ts")).toBeNull();
  expect(await call("./Auth", root + "apps/launcher/src/renderer/src/main.tsx")).toBeNull();
  expect(await call("./WorkerClient", root + "apps/launcher/src/training-client/SnapshotWorkerClient.ts")).toBeNull();
});
it("ships the two stand-ins and no proprietary or audio assets", () => {
  const emitted: { fileName: string; source: string | Buffer }[] = [];
  (trainingAssets().generateBundle as Function).call({ emitFile: (asset: any) => emitted.push(asset) });
  expect(emitted.find(a => a.fileName === "images/OpenFrontLogo.svg")?.source).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const font = emitted.find(a => a.fileName === "fonts/OpenFront.ttf")?.source as Buffer;
  expect(font.subarray(0, 4).toString()).toBe("wOF2");
  expect(emitted.some(a => /proprietary|sounds\//.test(a.fileName))).toBe(false);
});
it("keeps the offline Auth export surface synchronized with upstream", async () => {
  const upstream = readFileSync(resolve(vendor, "Auth.ts"), "utf8");
  const names = [...upstream.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]);
  const stub = await import("./AuthStub");
  expect(Object.keys(stub).sort()).toEqual(names.sort());
  expect(await stub.userAuth()).toBe(false);
  expect(await stub.isLoggedIn()).toBe(false);
  expect(await stub.getAuthHeader()).toBe("");
});
