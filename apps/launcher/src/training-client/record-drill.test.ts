import { expect, it, vi } from "vitest";
import synthetic from "../../../../packages/training-engine/src/fixtures/synthetic-record.json";
import { onionMap } from "../../../../packages/training-engine/src/fixtures/maps";
import { createRecordDrillBuilder } from "../main/record-drill";
import { buildRecordDrill } from "./record-drill-build";
const loadMap = vi.fn(async () => ({ status: "ready" as const, value: onionMap() }));
const build = createRecordDrillBuilder({ loadMap, reserveFloorPct: 30, build: buildRecordDrill });
it("retry drill from the synthetic record", async () => {
  const result = await build(synthetic, "Me00000A", 300, "sendSize");
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  expect(result.value.data).toMatchObject({ startTick: 300, coach: [], ownClientId: "Me00000A" });
  expect(result.value.snapshot.byteLength).toBeGreaterThan(0);
  expect(result.value.data.gameStartInfo).toMatchObject({ players: synthetic.info.players });
  expect(result.value.data.opponents).toContainEqual({ turn: 1, intent: { type: "attack", targetID: null, troops: 999, clientID: "Riv0000B" } });
  expect(result.value.data.opponents.some(s => s.intent.clientID === "Me00000A")).toBe(false);
});
it("newer build is rejected before loading a map", async () => {
  loadMap.mockClear();
  expect(await build({ ...synthetic, gitCommit: "future" }, "Me00000A", 300, "sendSize")).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
  expect(loadMap).not.toHaveBeenCalled();
});
it("unprovable checks and malformed records stay unavailable", async () => {
  expect(await build(synthetic, "Me00000A", 300, "allyDecision")).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await build(null, "Me00000A", 300, "sendSize")).toEqual({ status: "unavailable", reason: "invalidRecord" });
});
it("map failures are preserved", async () => {
  const missing = createRecordDrillBuilder({ loadMap: async () => ({ status: "unavailable", reason: "missingMap" }), reserveFloorPct: 30, build: buildRecordDrill });
  expect(await missing(synthetic, "Me00000A", 300, "sendSize")).toEqual({ status: "unavailable", reason: "missingMap" });
});
it("cancelling a pending map load never starts the snapshot worker", async () => {
  const controller = new AbortController();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const worker = vi.fn(buildRecordDrill);
  const load = createRecordDrillBuilder({ signal: controller.signal, reserveFloorPct: 30, build: worker,
    loadMap: async () => { await pending; return { status: "ready", value: onionMap() }; } });
  const result = load(synthetic, "Me00000A", 300, "sendSize");
  controller.abort(); release();
  expect(await result).toEqual({ status: "unavailable", reason: "cancelled" });
  expect(worker).not.toHaveBeenCalled();
});
