import { gameReview } from "@flashfront/core";
import { expect, it } from "vitest";
import { onionMap } from "./fixtures/maps";
import { SYNTH } from "./fixtures/ids";
import synthetic from "./fixtures/synthetic-record.json";
import { BoardSession } from "./rebuild";
import { samplesFrom } from "./trace";

const control = { cancelled: () => false, yieldNow: async () => {} };
const obs = (tick: number, troops: number) => ({ tick, troops, maxTroops: 1000, gold: 5, tiles: 40, landTiles: 400, alliances: 0, incoming: 0, outgoing: 0, alive: true });

it("exported samples start at the branch start with t = 0; earlier baseline stays internal", () => {
  const samples = samplesFrom([obs(280, 500), obs(290, 510), obs(300, 520), obs(310, 300)], 300);
  expect(samples.map((s) => [s.tick, s.t])).toEqual([[300, 0], [310, 1]]);
  expect(samples[0]).toMatchObject({ troops: 520, maxTroops: 1000, tiles: 40, tilesOwnedPct: 10 });
});

it("a branch trace feeds C's Game Review, and a push with under a minute of evidence stays unrated", async () => {
  const built = await BoardSession.rebuild("s", { kind: "record", record: synthetic, ownClientId: SYNTH.me, startTick: 300 }, onionMap(), control);
  if (built.status !== "ready") throw new Error(built.reason);
  const session = built.value;
  const r = await session.run({ untilTick: 420, own: [{ tick: 302, actor: session.handle.ownPlayer, action: { kind: "attack", target: null, troops: 400 } }], opponents: "recorded" }, control);
  if (r.status !== "ready") throw new Error(r.reason);
  expect(r.value.record.idsVerified).toBe(true);
  const review = gameReview(r.value.record, r.value.match, { reserveFloorPct: 30 });
  const branchPushes = review.pushes.filter((p) => p.startTick >= 300);
  expect(branchPushes.map((p) => p.startTick)).toContain(302);
  for (const p of branchPushes.filter((p) => p.startTick >= 420 - 600)) expect(p.label).toBeUndefined();
});
