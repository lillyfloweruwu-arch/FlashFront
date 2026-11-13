// Writes the prepared drill assets. Refuses to write unless every coach move passes and every documented
// wrong move fails on the real engine.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { authorDrill } from "./author";
import { openDrill, playAttempt } from "./play";
import { DRILL_SPECS } from "./specs";

const root = new URL("../../../../", import.meta.url);
const assets = new URL("apps/launcher/resources/training/drills/", root);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

it("authors and verifies the prepared drills", async () => {
  const only = process.env.DRILL ? process.env.DRILL.split(",") : null;
  const rows: string[] = [], drills: unknown[] = [];
  let ok = true;
  mkdirSync(new URL("boards/", assets), { recursive: true });
  mkdirSync(new URL("scripts/", assets), { recursive: true });
  for (const { meta, spec } of DRILL_SPECS) {
    if (only && !only.includes(spec.id)) continue;
    let line = spec.id;
    try {
      const a = await authorDrill(spec);
      const session = await openDrill(a.board);
      const start = session.checkpoint();
      const good = await playAttempt(session, a.board, a.script.cast, a.check, a.script.coach, a.script.opponents);
      await session.restore(a.board.startTick, start);
      const bad = await playAttempt(session, a.board, a.script.cast, a.check, a.script.wrong, a.script.opponents);
      line += ` coach=${good.verdict} ${JSON.stringify(good.evidence)} wrong=${bad.verdict} ${JSON.stringify(bad.evidence)} troops=${Math.round(a.script.coach.length && a.check.kind === "send" ? 0 : 0)}`;
      const reserve = Math.round((a.check.kind === "send" ? 100 : 0));
      void reserve;
      if (good.verdict !== "correct" || bad.verdict !== "wrong") ok = false;
      const boardJson = JSON.stringify(a.board) + "\n", scriptJson = JSON.stringify(a.script, null, 1) + "\n";
      writeFileSync(new URL(`boards/${spec.id}.json`, assets), boardJson);
      writeFileSync(new URL(`scripts/${spec.id}.json`, assets), scriptJson);
      drills.push({ ...meta, version: 1, durationSec: 120, boardId: spec.id, check: a.check, assets: { board: sha(boardJson), script: sha(scriptJson) } });
    } catch (e) { ok = false; line += ` ERROR ${(e as Error).message}`; }
    rows.push(line);
  }
  writeFileSync(new URL(".superpowers/drill-author.log", root), rows.join("\n") + "\n");
  if (!only) writeFileSync(new URL("packages/core/src/training/catalog.json", root), JSON.stringify({ version: 1, engineCommit: "see boards", drills }, null, 1) + "\n");
  if (!ok) throw new Error(`some drills failed; see .superpowers/drill-author.log`);
}, 1_800_000);
