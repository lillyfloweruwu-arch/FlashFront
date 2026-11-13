import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseGameRecord, trimGameRecord } from "@flashfront/core";
import { RECORD_MAX_BYTES, validGameId, type StatsApi } from "./api";

export type RecordStatus = { status: "ready" } | { status: "waiting" }
  | { status: "unavailable"; reason: "noGameId" | "notArchived" | "invalid" | "tooLarge" };
const delays = [15_000, 60_000, 180_000, 600_000, 1_800_000];
const CACHE_MAX_BYTES = 300_000_000;
type Entry = { started: number; step: number; status?: RecordStatus; pending?: Promise<RecordStatus>; timer?: ReturnType<typeof setTimeout> };

export class GameRecordCache {
  private readonly directory: string;
  private entries = new Map<string, Entry>();
  private stopped = false;
  constructor(matchesDir: string, private readonly api: Pick<StatsApi, "gameRecord">,
    private readonly inMatch: () => boolean, private readonly now: () => number = Date.now) {
    this.directory = join(matchesDir, "public-records");
  }
  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) { entry = { started: this.now(), step: 0 }; this.entries.set(id, entry); }
    return entry;
  }
  private active(id: string, entry: Entry) { return !this.stopped && this.entries.get(id) === entry; }
  private async directoryReady() {
    await mkdir(this.directory, { recursive: true });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Public records need a real local directory");
  }
  async read(gameId: string): Promise<unknown | undefined> {
    if (!validGameId(gameId) || this.inMatch()) return undefined;
    try {
      const parent = await lstat(this.directory); if (!parent.isDirectory() || parent.isSymbolicLink()) return undefined;
      const file = join(this.directory, `${gameId}.json`), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > RECORD_MAX_BYTES) return undefined;
      const contents = await readFile(file, "utf8");
      if (this.inMatch()) return undefined;
      const body: unknown = JSON.parse(contents);
      return parseGameRecord(body)?.gameId === gameId ? body : undefined;
    } catch { return undefined; }
  }
  ensure(gameId: string): Promise<RecordStatus> {
    if (!validGameId(gameId)) return Promise.resolve({ status: "unavailable", reason: "noGameId" });
    if (this.stopped || this.inMatch()) return Promise.resolve({ status: "waiting" });
    const entry = this.entry(gameId);
    if (entry.pending) return entry.pending;
    if (entry.status?.status === "unavailable" || (entry.status?.status === "waiting" && entry.timer)) return Promise.resolve(entry.status);
    return this.attempt(gameId, entry, false);
  }
  afterMatch(gameId: string): void {
    if (this.stopped || !validGameId(gameId)) return;
    const entry = this.entry(gameId);
    if (!entry.timer && !entry.pending && entry.status?.status !== "ready" && entry.status?.status !== "unavailable") this.arm(gameId, entry);
  }
  private arm(id: string, entry: Entry, defer?: number) {
    if (!this.active(id, entry) || entry.timer) return;
    const delay = defer ?? Math.max(0, entry.started + delays[entry.step]! - this.now());
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (!this.active(id, entry)) return;
      if (this.inMatch()) { this.arm(id, entry, 60_000); return; }
      void this.attempt(id, entry, true);
    }, delay);
    entry.timer.unref?.();
  }
  private attempt(id: string, entry: Entry, scheduled: boolean): Promise<RecordStatus> {
    if (entry.pending) return entry.pending;
    const operation = this.fetch(id, entry, scheduled).catch((): RecordStatus => {
      if (this.active(id, entry)) this.arm(id, entry, 60_000);
      return { status: "waiting" };
    }).then(status => {
      if (this.active(id, entry)) {
        entry.status = status;
        if (status.status !== "waiting" && entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
      }
      return status;
    });
    entry.pending = operation.finally(() => { entry.pending = undefined; });
    return entry.pending;
  }
  private async fetch(id: string, entry: Entry, scheduled: boolean): Promise<RecordStatus> {
    if (await this.read(id)) {
      if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined;
      return { status: "ready" };
    }
    const mayStart = () => this.active(id, entry) && !this.inMatch();
    if (!mayStart()) { this.arm(id, entry, 60_000); return { status: "waiting" }; }
    const response = await this.api.gameRecord(id, mayStart);
    if (!mayStart() || response.status === 425) { this.arm(id, entry, 60_000); return { status: "waiting" }; }
    if (response.status === 413) return { status: "unavailable", reason: "tooLarge" };
    if (response.status !== 200) {
      if (scheduled && entry.step === delays.length - 1) return { status: "unavailable", reason: "notArchived" };
      if (scheduled) entry.step++;
      this.arm(id, entry); return { status: "waiting" };
    }
    if (parseGameRecord(response.body)?.gameId !== id) return { status: "unavailable", reason: "invalid" };
    const text = JSON.stringify(trimGameRecord(response.body));
    if (Buffer.byteLength(text, "utf8") > RECORD_MAX_BYTES) return { status: "unavailable", reason: "tooLarge" };
    await this.directoryReady();
    const destination = join(this.directory, `${id}.json`), temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text, { flag: "wx" });
      if (!mayStart()) { this.arm(id, entry, 60_000); return { status: "waiting" }; }
      await rename(temporary, destination);
      // forget() may run while rename is in flight.
      if (!this.active(id, entry)) { await unlink(destination).catch(() => {}); return { status: "waiting" }; }
      await this.retain();
    } finally { await unlink(temporary).catch(() => {}); }
    if (entry.timer) clearTimeout(entry.timer); entry.timer = undefined;
    return { status: "ready" };
  }
  private async retain() {
    const files = [];
    for (const file of await readdir(this.directory)) {
      if (!/^[A-Za-z0-9]{6,16}\.json$/.test(file)) continue;
      const path = join(this.directory, file), stat = await lstat(path);
      if (stat.isFile() && !stat.isSymbolicLink()) files.push({ path, size: stat.size, time: stat.mtimeMs });
    }
    let size = files.reduce((sum, f) => sum + f.size, 0);
    for (const file of files.sort((a, b) => a.time - b.time)) {
      if (size <= CACHE_MAX_BYTES) break;
      await unlink(file.path); size -= file.size;
    }
  }
  async forget(gameId: string): Promise<void> {
    if (!validGameId(gameId)) return;
    const entry = this.entries.get(gameId); if (entry?.timer) clearTimeout(entry.timer);
    this.entries.delete(gameId);
    try {
      const parent = await lstat(this.directory);
      if (parent.isDirectory() && !parent.isSymbolicLink()) await unlink(join(this.directory, `${gameId}.json`));
    } catch { /* Already absent. */ }
  }
  stop(): void {
    this.stopped = true;
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    this.entries.clear();
  }
}
