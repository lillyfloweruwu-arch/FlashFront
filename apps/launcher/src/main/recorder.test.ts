import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readdir, rm, mkdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { MatchRecorder, matchTrend, personalBests, type RecordedMatch } from "@flashfront/core";
import { MatchFiles } from "./recorder";
let directory: string | undefined;
afterEach(async () => { if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep + "flashfront-record-test-")) await rm(directory, { recursive: true, force: true }); });
function fixture() {
  const recorder = new MatchRecorder(() => Date.UTC(2026, 9, 16));
  recorder.consume({ inGame: true, visible: true, gameId: "abc12345", game: { map: "World" } }, null);
  return recorder.finish()!;
}
it("lists from a compact persistent index, loading full samples only for selection or changed files", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-record-test-")); const files = new MatchFiles(directory);
  const match: RecordedMatch = { ...fixture(), type: "Public", mode: "FFA", durationSec: 400, endedAtSec: 400,
    samples: Array.from({ length: 81 }, (_, i) => ({ t: i * 5, tick: i * 50, troops: 500000, maxTroops: 1000000, gold: 100000, tiles: 300,
      attackRatio: 0.2, zone: "sweet", incoming: 0, outgoingCount: 0, tradeGoldTotal: i * 100, tilesOwnedPct: i / 2 })),
  };
  match.summary.bestRank = 3; match.summary.attackTempo = 2; match.summary.idleGoldSeconds = 30;
  const file = await files.save(match);
  const restarted = new MatchFiles(directory); const get = vi.spyOn(restarted, "get");
  const list = await restarted.list();
  expect(get).not.toHaveBeenCalled(); expect(list[0]).not.toHaveProperty("samples");
  expect(matchTrend(list)).toEqual(matchTrend([match])); expect(personalBests(list)).toEqual(personalBests([match]));
  await restarted.get(file); expect(get).toHaveBeenCalledTimes(1);
  const beforeBytes = Buffer.byteLength(JSON.stringify(match)), afterBytes = Buffer.byteLength(JSON.stringify(list[0]));
  expect(afterBytes).toBeLessThan(beforeBytes / 3);
  if (process.env.FLASHFRONT_BENCH) console.info(`recording fixture: ${beforeBytes} full bytes -> ${afterBytes} index bytes`);
  await writeFile(files.path(file), JSON.stringify({ ...match, map: "Europe" })); get.mockClear();
  expect((await restarted.list())[0]?.map).toBe("Europe"); expect(get).toHaveBeenCalledTimes(1);
});
it("keeps newest 200, ignores foreign and malformed files, and never follows caller paths", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-record-test-")); const files = new MatchFiles(directory);
  await mkdir(files.directory); const m = fixture();
  await Promise.all(Array.from({ length: 203 }, (_, i) => writeFile(join(files.directory, `2026-10-16_000000_World_game${i}.json`), JSON.stringify({ ...m, startedAt: new Date(Date.UTC(2026, 9, 16, 0, 0, i)).toISOString() }))));
  await writeFile(join(files.directory, "foreign.json"), JSON.stringify(m));
  await writeFile(join(files.directory, "2020-01-01_000000_World_foreign.json"), JSON.stringify({ ...m, recordedBy: "SomeoneElse" }));
  await writeFile(join(files.directory, "2020-01-01_000000_World_corrupt.json"), "not json");
  await files.retain();
  const list = await files.list(); expect(list).toHaveLength(200);
  expect(list[0]!.file).toContain("game202"); expect(list.at(-1)!.file).toContain("game3");
  expect(await readdir(files.directory)).toHaveLength(204);
  await expect(files.delete("../settings.json")).rejects.toThrow("Invalid match filename");
  await expect(files.delete("2020-01-01_000000_World_foreign.json")).rejects.toThrow();
  await files.delete(list[0]!.file); expect(await files.list()).toHaveLength(199);
}, 20000);
it("writes JSON without overwriting same-second matches and enforces the byte cap", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-record-test-")); const files = new MatchFiles(directory);
  const m = fixture(); const a = await files.save(m); const b = await files.save(m);
  expect(a).not.toBe(b); expect(JSON.parse(await readFile(files.path(a), "utf8"))).toEqual(m);
  await expect(files.save({ ...m, map: "x".repeat(2_000_000) })).rejects.toThrow("2 MB");
});
it("loads old files with unknown outcome and preserves legacy results", async () => {
  directory = await mkdtemp(join(tmpdir(), "flashfront-record-test-")); const files = new MatchFiles(directory);
  const m = fixture(); delete m.outcome; delete m.endedAtSec;
  const file = await files.save(m);
  expect(await files.get(file)).toMatchObject({ outcome: "unknown", endedAtSec: 0 });
  expect((await files.get(await files.save({ ...m, outcome: "win" }))).outcome).toBe("won");
});
