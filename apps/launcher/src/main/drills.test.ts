import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DrillRefresher, DrillStore, refreshDrillReviews } from "./drills";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 25, 23, 30).getTime();
const file = () => join(mkdtempSync(join(tmpdir(), "ff-drills-")), "training-progress.json");
const ready = (m: Partial<Record<"allyDecision" | "postsBeforePush" | "sendSize", number>>) => ({ status: "ready" as const, review: { mistakes: { allyDecision: 0, postsBeforePush: 0, sendSize: 0, ...m } } as never });

it("persists today's pick across a restart and keeps it until local midnight", async () => {
  const path = file();
  let now = T0;
  const store = new DrillStore(path, () => now);
  await store.setReviews([{ gameId: "g1", startedAt: new Date(T0 - DAY).toISOString(), mistakes: { allyDecision: 0, postsBeforePush: 6, sendSize: 1 } }]);
  const first = await store.today();
  expect(first).toMatchObject({ drillId: "posts-01", title: expect.any(String), durationSec: 120, mistake: "postsBeforePush" });
  now = T0 + 20 * 60_000; // still the same local day
  expect((await new DrillStore(path, () => now).today())?.drillId).toBe("posts-01");
  now = T0 + 40 * 60_000; // after midnight: a new day, a new drill
  expect((await new DrillStore(path, () => now).today())?.drillId).toBe("posts-02");
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved.version).toBe(1);
  expect(saved.visits.map((v: { drillId: string }) => v.drillId)).toEqual(["posts-01", "posts-02"]);
});

it("completion is idempotent, needs a picked drill and never moves the pick time", async () => {
  const path = file();
  const store = new DrillStore(path, () => T0);
  const today = await store.today();
  await Promise.all([store.complete(today!.drillId), store.complete(today!.drillId)]);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved.visits).toEqual([{ drillId: today!.drillId, selectedAtMs: T0, localDay: expect.any(String), completed: true }]);
  await expect(store.complete("sends-07")).rejects.toThrow(/not picked/);
  await expect(store.complete("../evil")).rejects.toThrow(/Unknown drill/);
});

it("a corrupt progress file reports unavailable and is left as it was", async () => {
  const path = file();
  writeFileSync(path, "{not json");
  const store = new DrillStore(path, () => T0);
  expect(await store.today()).toBeUndefined();
  await expect(store.complete("ally-01")).rejects.toThrow(/unavailable/);
  expect(readFileSync(path, "utf8")).toBe("{not json");
});

it("refresh reads at most ten newest distinct ready reviews and skips the rest without inventing costs", async () => {
  const list = Array.from({ length: 14 }, (_, i) => ({ file: `f${i}.json`, gameId: i === 1 ? "g0" : `g${i}`, startedAt: new Date(T0 - i * DAY).toISOString() }));
  const getReview = vi.fn(async (f: string) => (f === "f2.json" ? { status: "unavailable" as const, reason: "notArchived" as const } : ready({ sendSize: 1 })));
  const reviews = await refreshDrillReviews(list, getReview, () => false);
  expect(reviews).toHaveLength(10);
  expect(new Set(reviews!.map((r) => r.gameId)).size).toBe(10);
  expect(reviews!.map((r) => r.gameId)).not.toContain("g2");
  expect(getReview).not.toHaveBeenCalledWith("f1.json"); // an older recording of g0
  expect(await refreshDrillReviews(list, getReview, () => true)).toBeUndefined();
});

it("today's drill during a match reads only the cached pick", async () => {
  const path = file();
  const store = new DrillStore(path, () => T0);
  const getReview = vi.fn();
  await store.today();
  expect(await store.today()).toBeDefined();
  expect(getReview).not.toHaveBeenCalled();
});

it("deleting a recording drops its game from the cached costs", async () => {
  const store = new DrillStore(file(), () => T0);
  await store.setReviews([{ gameId: "g1", startedAt: new Date(T0).toISOString(), mistakes: { allyDecision: 0, postsBeforePush: 0, sendSize: 9 } }]);
  await store.forgetGame("g1");
  expect((await store.today())?.drillId).toBe("ally-01");
});

it("recording an explicit visit keeps today's pick and excludes the drill from automatic picks", async () => {
  const store = new DrillStore(file(), () => T0);
  const today = await store.today();
  await store.recordVisit("ally-02");
  expect((await store.today())?.drillId).toBe(today!.drillId);
  await expect(store.recordVisit("nope")).rejects.toThrow(/Unknown drill/);
});

it("refreshes run one at a time, so a slow early refresh can't overwrite a later one", async () => {
  const store = new DrillStore(file(), () => T0);
  const refresher = new DrillRefresher(store);
  let release!: () => void;
  const slow = refresher.run(async () => { await new Promise<void>((r) => { release = r; }); return [{ gameId: "deleted", startedAt: new Date(T0).toISOString(), mistakes: { allyDecision: 0, postsBeforePush: 0, sendSize: 99 } }]; });
  const fresh = refresher.run(async () => []);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  release();
  await Promise.all([slow, fresh]);
  expect((await store.today())?.mistake).toBe("allyDecision");
});

it("progress waits for pending writes and keeps earlier passes", async () => {
  const store = new DrillStore(file(), () => T0);
  await store.recordVisit("ally-01");
  const complete = store.complete("ally-01");
  expect(await store.getProgress()).toEqual({ "ally-01": "passed" });
  await complete;
  await store.recordVisit("ally-01");
  await store.recordVisit("sends-01");
  expect(await store.getProgress()).toEqual({ "ally-01": "passed", "sends-01": "tryAgain" });
});
