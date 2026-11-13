import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, open, utimes } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { GameRecordCache } from "./gameRecords";
import type { StatsApi } from "./api";

const record = () => ({ gitCommit: "fixture", info: { gameID: "abc123", num_turns: 1000,
  config: { gameMap: "World", gameMode: "FFA" }, reports: ["private"],
  players: [{ clientID: "CLIENT01", username: "Player 1", publicID: "PRIVATE1", persistentID: "PRIVATE2", cosmetics: {} }] }, turns: [] });
let dir: string;
const caches: GameRecordCache[] = [];
async function setup(inMatch = () => false) {
  dir = await mkdtemp(join(tmpdir(), "flashfront-record-cache-test-"));
  const gameRecord = vi.fn<StatsApi["gameRecord"]>().mockImplementation(async () => ({ status: 200, body: record() }));
  const cache = new GameRecordCache(dir, { gameRecord }, inMatch);
  caches.push(cache); return { cache, gameRecord };
}
afterEach(async () => {
  caches.splice(0).forEach(c => c.stop()); vi.useRealTimers();
  if (dir && resolve(dir).startsWith(resolve(tmpdir()) + sep + "flashfront-record-cache-test-")) await rm(dir, { recursive: true, force: true });
});

it("never fetches while a match is running and retries after", async () => {
  let playing = true; const { cache, gameRecord } = await setup(() => playing);
  expect(await cache.ensure("abc123")).toEqual({ status: "waiting" });
  expect(gameRecord).not.toHaveBeenCalled();
  playing = false;
  expect(await cache.ensure("abc123")).toEqual({ status: "ready" });
});
it("does not parse or return a cached record if a match starts during disk IO", async () => {
  let playing = false; const { cache } = await setup(() => playing);
  await cache.ensure("abc123");
  const pending = cache.read("abc123"); playing = true;
  expect(await pending).toBeUndefined();
});
it("defers a scheduled attempt by a minute when the next match has begun", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let playing = false; const { cache, gameRecord } = await setup(() => playing);
  cache.afterMatch("abc123"); playing = true;
  await vi.advanceTimersByTimeAsync(15_000); expect(gameRecord).not.toHaveBeenCalled();
  playing = false;
  await vi.advanceTimersByTimeAsync(60_000); await cache.ensure("abc123");
  expect(gameRecord).toHaveBeenCalledTimes(1);
  expect(await cache.read("abc123")).toMatchObject({ info: { gameID: "abc123" } });
});
it("treats 404 as waiting until the final 30 minute attempt", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { cache, gameRecord } = await setup();
  gameRecord.mockResolvedValue({ status: 404, body: {} }); cache.afterMatch("abc123");
  for (const delta of [15_000, 45_000, 120_000, 420_000]) {
    await vi.advanceTimersByTimeAsync(delta);
    expect(await cache.ensure("abc123")).toEqual({ status: "waiting" });
  }
  expect(gameRecord).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(1_200_000);
  expect(await cache.ensure("abc123")).toEqual({ status: "unavailable", reason: "notArchived" });
  expect(gameRecord).toHaveBeenCalledTimes(5);
});
it("writes trimmed records atomically, reuses disk on restart and forgets them", async () => {
  const { cache, gameRecord } = await setup();
  await Promise.all([cache.ensure("abc123"), cache.ensure("abc123")]);
  expect(gameRecord).toHaveBeenCalledTimes(1);
  const text = await readFile(join(dir, "public-records", "abc123.json"), "utf8");
  expect(text).not.toMatch(/publicID|persistentID|cosmetics|reports/);
  expect(await readdir(join(dir, "public-records"))).toEqual(["abc123.json"]);
  const restarted = new GameRecordCache(dir, { gameRecord }, () => false); caches.push(restarted);
  expect(await restarted.ensure("abc123")).toEqual({ status: "ready" });
  expect(gameRecord).toHaveBeenCalledTimes(1);
  await restarted.forget("abc123"); expect(await restarted.read("abc123")).toBeUndefined();
});
it("rejects foreign games, malformed records, bad ids and oversized responses", async () => {
  const { cache, gameRecord } = await setup();
  expect(await cache.ensure("../x")).toEqual({ status: "unavailable", reason: "noGameId" });
  expect(gameRecord).not.toHaveBeenCalled();
  const wrong = record(); wrong.info.gameID = "other1";
  gameRecord.mockResolvedValueOnce({ status: 200, body: wrong });
  expect(await cache.ensure("abc123")).toEqual({ status: "unavailable", reason: "invalid" });
  await cache.forget("abc123"); gameRecord.mockResolvedValueOnce({ status: 200, body: {} });
  expect(await cache.ensure("abc123")).toEqual({ status: "unavailable", reason: "invalid" });
  await cache.forget("abc123"); gameRecord.mockResolvedValueOnce({ status: 413, body: {} });
  expect(await cache.ensure("abc123")).toEqual({ status: "unavailable", reason: "tooLarge" });
});
it("does not resurrect a forgotten record when its pending fetch finishes", async () => {
  const { cache, gameRecord } = await setup();
  let finish!: (value: { status: number; body: unknown }) => void;
  gameRecord.mockImplementation(() => new Promise(r => { finish = r; }));
  const pending = cache.ensure("abc123");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await cache.forget("abc123"); finish({ status: 200, body: record() }); await pending;
  expect(await cache.read("abc123")).toBeUndefined();
});
it("validates cached files and stops pending retry timers", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { cache, gameRecord } = await setup();
  await mkdir(join(dir, "public-records"));
  await writeFile(join(dir, "public-records", "abc123.json"), "{}");
  expect(await cache.read("abc123")).toBeUndefined();
  cache.afterMatch("abc123"); cache.stop(); await vi.advanceTimersByTimeAsync(1_800_000);
  expect(gameRecord).not.toHaveBeenCalled();
});
it("evicts oldest records when the local cache exceeds 300 MB", async () => {
  const { cache } = await setup();
  await mkdir(join(dir, "public-records"));
  for (let i = 0; i < 3; i++) {
    const path = join(dir, "public-records", `older${i}.json`);
    const handle = await open(path, "w"); await handle.truncate(100_000_000); await handle.close();
    await utimes(path, i + 1, i + 1);
  }
  expect(await cache.ensure("abc123")).toEqual({ status: "ready" });
  expect((await readdir(join(dir, "public-records"))).sort()).toEqual(["abc123.json", "older1.json", "older2.json"]);
});
it("defers even the final retry rather than declaring a playing user unavailable", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let playing = false; const { cache, gameRecord } = await setup(() => playing);
  gameRecord.mockResolvedValue({ status: 404, body: {} }); cache.afterMatch("abc123");
  for (const delta of [15_000, 45_000, 120_000, 420_000]) { await vi.advanceTimersByTimeAsync(delta); await cache.ensure("abc123"); }
  playing = true; await vi.advanceTimersByTimeAsync(1_200_000);
  expect(await cache.ensure("abc123")).toEqual({ status: "waiting" });
  expect(gameRecord).toHaveBeenCalledTimes(4);
  playing = false; await vi.advanceTimersByTimeAsync(60_000);
  expect(await cache.ensure("abc123")).toEqual({ status: "unavailable", reason: "notArchived" });
});
