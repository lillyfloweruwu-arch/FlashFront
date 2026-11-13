import { expect, it } from "vitest";
import synthetic from "../../../../packages/training-engine/src/fixtures/synthetic-record.json";
import { onionMap } from "../../../../packages/training-engine/src/fixtures/maps";
import { ReplaySnapshots } from "./review-snapshots";
it("replays exact snapshots with both players' intents, including tick zero and the end", async () => {
  const snapshots = new ReplaySnapshots(synthetic, "Me00000A", onionMap());
  const zero = await snapshots.seek(0);
  expect(zero.status).toBe("ready");
  const at = await snapshots.seek(300);
  if (at.status !== "ready") throw new Error(at.reason);
  expect(at.value.data).toMatchObject({ startTick: 300, endTick: 900 });
  expect(at.value.data.opponents.some(s => s.intent.clientID === "Me00000A")).toBe(true);
  expect(at.value.data.opponents.some(s => s.intent.clientID === "Riv0000B")).toBe(true);
  expect(at.value.data).not.toHaveProperty("check");
  expect((await snapshots.seek(900)).status).toBe("ready");
  expect(await snapshots.seek(300)).toEqual(at);
});
it("rejects unsupported builds, malformed records and out of range seeks", async () => {
  expect(await new ReplaySnapshots({ ...synthetic, gitCommit: "future" }, "Me00000A", onionMap()).seek(0)).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
  const snapshots = new ReplaySnapshots(synthetic, "Me00000A", onionMap());
  expect(await snapshots.seek(-1)).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await snapshots.seek(901)).toEqual({ status: "unavailable", reason: "invalidRecord" });
});
it("replays v0.35.5 records, except on maps whose files changed upstream", async () => {
  const v0355 = "bf0ac8a1163f151ffc3c1ccbada3f0de18a4c3b0";
  expect((await new ReplaySnapshots({ ...synthetic, gitCommit: v0355 }, "Me00000A", onionMap()).seek(300)).status).toBe("ready");
  const changed = { ...synthetic, gitCommit: v0355, info: { ...synthetic.info, config: { ...synthetic.info.config, gameMap: "United States" } } };
  expect(await new ReplaySnapshots(changed, "Me00000A", onionMap()).seek(0)).toEqual({ status: "unavailable", reason: "unsupportedVersion" });
});
