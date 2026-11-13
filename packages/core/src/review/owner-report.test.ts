import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { accuracy } from "./accuracy";
import { openingCheck } from "./allies";
import { labelPushes } from "./labels";
import { extractPushes } from "./pushes";
import { parseGameRecord } from "./record";
import { incomingWaves } from "./waves";

// Private owner checkpoint: FLASHFRONT_REVIEW_DIR holds <name>.recording.json + <name>.record.json pairs.
// Prints numbers only, never names or ids.
const dir = process.env.FLASHFRONT_REVIEW_DIR;
it.skipIf(!dir)("prints the accuracy breakdown for the owner's own games", () => {
  const floor = Number(process.env.FLASHFRONT_RESERVE_FLOOR ?? 35);
  const rows = readdirSync(dir!).filter(f => f.endsWith(".recording.json")).map(f => {
    const match = JSON.parse(readFileSync(join(dir!, f), "utf8"));
    const record = parseGameRecord(JSON.parse(readFileSync(join(dir!, f.replace(".recording.json", ".record.json")), "utf8")));
    expect(record).toBeDefined();
    const pushes = labelPushes(extractPushes(record!, match), floor), waves = incomingWaves(record!, match);
    const count = (l: string) => pushes.filter(p => p.label === l).length;
    const a = accuracy(pushes, waves, openingCheck(record!, match));
    return [match.map, match.mode, match.outcome, `${Math.round(match.durationSec / 60)} min`, `${a.rated}/${pushes.length} rated`,
      `G+${count("great")} G${count("good")} N${count("neutral")} C${count("costly")} B${count("blunder")}`,
      `costly: ${["lostLand", "lowReserve"].map(r => `${r} ${pushes.filter(p => p.label === "costly" && p.reason === r).length}`).join(", ")}`,
      `waves ${waves.filter(w => w.rated).length}/${waves.length}`, `base ${a.base?.toFixed(1) ?? "-"}`,
      `opening ${a.opening}`, `defense ${a.defense}`, `accuracy ${a.value ?? "Unavailable"}`].join(" | ");
  });
  console.log(`\n${rows.join("\n")}\n`);
});
