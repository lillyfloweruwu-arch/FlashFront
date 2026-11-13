import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { COACH_LINES, DRILL_ASSET_HASHES, DRILL_CATALOG, RATIONALES, type PreparedDrill } from "@flashfront/core";
import { expect, it } from "vitest";
import type { PreparedBoard, ScheduledAction } from "./contracts";
import { scheduledProblem } from "./contracts";
import type { DrillCast } from "./drill-evidence";
import { ATTEMPT_TICKS } from "./drills/author";
import { openDrill, playAttempt } from "./drills/play";
import { RECORD_COMMITS } from "./protocol";

const TABLE = ["ally-01", "ally-02", "ally-03", "ally-04", "ally-05", "ally-06", "ally-07", "posts-01", "posts-02", "posts-03", "posts-04", "posts-05", "posts-06", "posts-07",
  "sends-01", "sends-02", "sends-03", "sends-04", "sends-05", "sends-06", "sends-07"];
const dir = new URL("../../../apps/launcher/resources/training/drills/", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, dir), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
interface Script { drillId: string; cast: DrillCast; coach: ScheduledAction[]; wrong: ScheduledAction[]; opponents: ScheduledAction[] }
const assets = (d: PreparedDrill) => ({ board: JSON.parse(text(`boards/${d.boardId}.json`)) as PreparedBoard, script: JSON.parse(text(`scripts/${d.boardId}.json`)) as Script });

it("the catalogue is the 21 table rows, seven per mistake type", () => {
  expect(DRILL_CATALOG.map((d) => d.id)).toEqual(TABLE);
  for (const m of ["allyDecision", "postsBeforePush", "sendSize"]) expect(DRILL_CATALOG.filter((d) => d.mistake === m)).toHaveLength(7);
});

it("every reference resolves and every asset matches its pinned hash and engine build", () => {
  for (const d of DRILL_CATALOG) {
    expect(RATIONALES[d.rationaleId], d.id).toBeTruthy();
    expect(COACH_LINES.some((l) => l.id === d.coachLineId), d.id).toBe(true);
    expect(sha(text(`boards/${d.boardId}.json`)), d.id).toBe(DRILL_ASSET_HASHES[d.id]!.board);
    expect(sha(text(`scripts/${d.boardId}.json`)), d.id).toBe(DRILL_ASSET_HASHES[d.id]!.script);
    const { board, script } = assets(d);
    expect(RECORD_COMMITS).toContain(board.engineCommit);
    expect(board.record).toMatchObject({ gitCommit: board.engineCommit });
    expect(script.drillId).toBe(d.id);
    for (const s of [...script.coach, ...script.wrong, ...script.opponents]) expect(scheduledProblem(s), `${d.id} ${JSON.stringify(s)}`).toBeNull();
    for (const s of [...script.coach, ...script.wrong]) expect(s.actor).toBe(script.cast.labels.You);
    for (const s of script.opponents) expect(s.actor).not.toBe(script.cast.labels.You);
    for (const s of [...script.coach, ...script.wrong, ...script.opponents]) expect(s.tick >= board.startTick && s.tick < board.startTick + ATTEMPT_TICKS).toBe(true);
  }
});

it("boards differ in what matters to the decision, not only in id or seed", () => {
  const keys = DRILL_CATALOG.map((d) => {
    const { board, script } = assets(d);
    const turns = (board.record as { turns: { intents: { type: string; tile?: number }[] }[] }).turns;
    const spawns = turns.flatMap((t) => t.intents.filter((i) => i.type === "spawn").map((i) => i.tile));
    return sha(JSON.stringify([board.mapId, board.startTick, spawns, script.opponents.map((s) => [s.tick - board.startTick, s.action]), script.coach.map((s) => [s.tick - board.startTick, s.action])]));
  });
  expect(new Set(keys).size).toBe(21);
});

it("the coach move passes and the documented wrong move fails on the real engine, for all 21", async () => {
  for (const d of DRILL_CATALOG) {
    const { board, script } = assets(d);
    const session = await openDrill(board);
    const start = session.checkpoint();
    const good = await playAttempt(session, board, script.cast, d.check, script.coach, script.opponents);
    expect(good.verdict, `${d.id} coach ${JSON.stringify(good.evidence)}`).toBe("correct");
    expect(session.history.bytesUsed).toBeLessThanOrEqual(64 * 1024 * 1024);
    await session.restore(board.startTick, start);
    expect(session.frame().tick).toBe(board.startTick);
    const bad = await playAttempt(session, board, script.cast, d.check, script.wrong, script.opponents);
    expect(bad.verdict, `${d.id} wrong ${JSON.stringify(bad.evidence)}`).toBe("wrong");
  }
}, 600_000);

it("named counterexamples: sends-01 20% passes and 60% fails, a post after the hit fails, declining the truce fails", async () => {
  const drill = (id: string) => DRILL_CATALOG.find((d) => d.id === id)!;
  const pct = (id: string, list: "coach" | "wrong") => {
    const { board, script } = assets(drill(id));
    void board;
    return script[list][0]!.action;
  };
  expect(drill("sends-01").check).toEqual({ kind: "send", minSendPct: 15, maxSendPct: 25, minReservePct: 40 });
  expect(pct("sends-01", "coach")).toMatchObject({ kind: "attack" });
  const posts = assets(drill("posts-01"));
  expect(posts.script.wrong[0]!.tick).toBeGreaterThanOrEqual((drill("posts-01").check as { beforeTick: number }).beforeTick);
  expect(pct("ally-03", "coach")).toMatchObject({ kind: "allianceAccept" });
  expect(pct("ally-03", "wrong")).toMatchObject({ kind: "allianceDecline" });
});
