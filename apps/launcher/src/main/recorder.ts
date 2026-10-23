import { lstat, mkdir, rename, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { MAX_MATCH_BYTES, repairSpawnElimination, recordingCoverage, personalBests, reviewMode, nextMatchNotes, debrief, type RecordedMatch } from "@flashfront/core";

export interface MatchListItem {
  coverage?: number; best?: ReturnType<typeof personalBests>["FFA"];
  notes?: import("@flashfront/core").CoachNote[]; review?: import("@flashfront/core").Debrief;
  rankedType?: string;
  type?: string; endedAtSec?: number; summary?: RecordedMatch["summary"];
  file: string; startedAt: string; map: string; mode: string; durationSec: number; finalRank?: number;
  sparkline: { t: number; value: number }[];
  practiceGoal?: RecordedMatch["practiceGoal"];
}
const pattern = /^\d{4}-\d{2}-\d{2}_\d{6}_[A-Za-z0-9-]{1,60}_[A-Za-z0-9-]{1,80}\.json$/;
const slug = (value: string, max: number) => value.replace(/[^A-Za-z0-9-]/g, "-").slice(0, max) || "unknown";
export class MatchFiles {
  readonly directory: string;
  private index = new Map<string, { size: number; mtime: number; item: MatchListItem }>();
  private indexLoaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(userData: string) { this.directory = resolve(userData, "matches"); }
  private async ensureDirectory() {
    await mkdir(this.directory, { recursive: true });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Use a real local directory for the matches folder");
  }
  path(file: string): string {
    if (typeof file !== "string" || !pattern.test(file)) throw new Error("Invalid match filename");
    return join(this.directory, file);
  }
  async get(file: string): Promise<RecordedMatch> {
    await this.ensureDirectory();
    const path = this.path(file); const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MATCH_BYTES) throw new Error("Not a FlashFront recording");
    const m = JSON.parse(await readFile(path, "utf8")) as RecordedMatch;
    if (m.recordedBy !== "FlashFront" || m.version !== 1 || !Array.isArray(m.samples) || !Array.isArray(m.events)
      || !m.summary || !Number.isFinite(Date.parse(m.startedAt))) throw new Error("Not a FlashFront recording");
    m.outcome = m.outcome === "win" ? "won" : m.outcome === "loss" ? "eliminated" : m.outcome ?? "unknown";
    const repaired = repairSpawnElimination(m);
    repaired.endedAtSec ??= repaired.samples.at(-1)?.tick !== undefined ? repaired.samples.at(-1)!.tick / 10 : repaired.durationSec;
    return repaired;
  }
  private async entries(): Promise<MatchListItem[]> {
    await this.ensureDirectory();
    const indexPath = join(this.directory, "index-v1.json");
    if (!this.indexLoaded) {
      this.indexLoaded = true;
      try {
        const stat = await lstat(indexPath);
        if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 8_000_000) {
          const saved = JSON.parse(await readFile(indexPath, "utf8"));
          if (saved.version === 1 && Array.isArray(saved.entries)) this.index = new Map(saved.entries);
        }
      } catch { /* An absent or damaged index is rebuilt from validated recordings. */ }
    }
    const matches: MatchListItem[] = []; const present = new Set<string>(); let changed = false;
    for (const file of await readdir(this.directory)) {
      if (!pattern.test(file)) continue;
      try {
        const stat = await lstat(this.path(file));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MATCH_BYTES) continue;
        present.add(file);
        let cached = this.index.get(file);
        if (!cached || cached.size !== stat.size || cached.mtime !== stat.mtimeMs || cached.item?.file !== file) {
          const m = await this.get(file); const mode = reviewMode(m);
          const item: MatchListItem = { file, startedAt: m.startedAt, map: m.map, mode: m.mode, rankedType: m.rankedType,
            durationSec: m.durationSec, finalRank: m.summary.finalRank, practiceGoal: m.practiceGoal, type: m.type, endedAtSec: m.endedAtSec, summary: m.summary,
            coverage: recordingCoverage(m), best: mode ? personalBests([m])[mode] : undefined, notes: nextMatchNotes(m), review: debrief(m),
            sparkline: m.samples.filter((_, i) => i % Math.max(1, Math.ceil(m.samples.length / 120)) === 0)
              .map(s => ({ t: s.t, value: s.maxTroops > 0 ? s.troops / s.maxTroops * 100 : 0 })) };
          cached = { size: stat.size, mtime: stat.mtimeMs, item }; this.index.set(file, cached); changed = true;
        }
        matches.push(cached.item);
      } catch { /* Foreign/corrupt files are never deleted. */ }
    }
    for (const file of this.index.keys()) if (!present.has(file)) { this.index.delete(file); changed = true; }
    if (changed) {
      const temporary = `${indexPath}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify({ version: 1, entries: [...this.index] }), { flag: "wx" }); await rename(temporary, indexPath); }
      finally { await unlink(temporary).catch(() => {}); }
    }
    return matches.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.file.localeCompare(a.file));
  }
  async list(): Promise<MatchListItem[]> { return this.entries(); }
  async retain(): Promise<void> {
    for (const { file } of (await this.entries()).slice(200)) { await this.get(file); await unlink(this.path(file)); }
  }
  save(m: RecordedMatch): Promise<string> {
    const operation = this.queue.then(async () => {
      const data = JSON.stringify(m);
      if (Buffer.byteLength(data, "utf8") > MAX_MATCH_BYTES) throw new Error("Recording exceeds 2 MB");
      await this.ensureDirectory();
      const stamp = m.startedAt.slice(0, 10) + "_" + m.startedAt.slice(11, 19).replaceAll(":", "");
      const base = `${stamp}_${slug(m.map, 60)}_${slug(m.gameId ?? "local", 60)}`;
      let file = base + ".json";
      for (let n = 0; ; n++) {
        file = base + (n ? `-${n}` : "") + ".json";
        try { await writeFile(this.path(file), data, { encoding: "utf8", flag: "wx" }); break; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      }
      await this.retain(); return file;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  async delete(file: string): Promise<void> { await this.queue; await this.get(file); await unlink(this.path(file)); }
  async flush(): Promise<void> { await this.queue; }
}
