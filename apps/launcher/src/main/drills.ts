// Today's drill (sub-plan F Task 3): a small, identity-free progress file in user data. The renderer can
// only ask for today's drill or mark one complete; it never supplies times, ids of its own or paths.
import { readFile, rename, writeFile } from "node:fs/promises";
import { DRILL_CATALOG, localDay, pickNextDrill, rankMistakes, type DrillVisit, type ReviewForDrill } from "@flashfront/core";
import type { MistakeType } from "@flashfront/core";
import type { ReviewResult } from "../shared";

export interface TodaysDrill { drillId: string; title: string; durationSec: 120; mistake: MistakeType; reason?: string; week?: boolean[]; weakest?: MistakeType }
interface Progress { version: 1; visits: DrillVisit[]; reviews: ReviewForDrill[] }
const EMPTY: Progress = { version: 1, visits: [], reviews: [] };

function parse(text: string): Progress {
  const p = JSON.parse(text) as Progress;
  if (p?.version !== 1 || !Array.isArray(p.visits) || !Array.isArray(p.reviews)) throw new Error("bad progress file");
  return p;
}

export class DrillStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly path: string, private readonly now: () => number = Date.now) {}

  /** Missing file: a fresh start. Corrupt file: null, and nothing is written over it. */
  private async load(): Promise<Progress | null> {
    let text: string;
    try { text = await readFile(this.path, "utf8"); } catch { return structuredClone(EMPTY); }
    try { return parse(text); } catch { return null; }
  }
  private async save(p: Progress): Promise<void> {
    const temp = `${this.path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(p), "utf8");
    await rename(temp, this.path);
  }
  /** Updates run one at a time, so concurrent completions can't lose each other's writes. */
  private update<T>(change: (p: Progress) => T): Promise<T> {
    const next = this.queue.then(async () => {
      const p = await this.load();
      if (!p) throw new Error("Training progress is unavailable");
      const result = change(p);
      await this.save(p);
      return result;
    });
    this.queue = next.catch(() => {});
    return next;
  }

  /** Today's pick, recorded the first time it is asked for (a skipped suggestion still counts). */
  async today(): Promise<TodaysDrill | undefined> {
    try {
      return await this.update((p) => {
        const now = this.now();
        const drill = pickNextDrill(p.reviews, DRILL_CATALOG, p.visits, now);
        if (!drill) return undefined;
        if (!p.visits.some((v) => !v.explicit && v.drillId === drill.id && v.localDay === localDay(now))) p.visits.push({ drillId: drill.id, selectedAtMs: now, localDay: localDay(now), completed: false });
        const top = rankMistakes(p.reviews)[0];
        const weakest = top && top.cost > 0 ? top.mistake : undefined;
        const week = Array.from({ length: 7 }, (_, i) => { const day = new Date(now); day.setDate(day.getDate() - 6 + i); return p.visits.some(v => v.completed && v.localDay === localDay(day.getTime())); });
        return { drillId: drill.id, title: drill.title, durationSec: 120 as const, mistake: drill.mistake, week, weakest,
          reason: weakest === drill.mistake ? "Costs you the most lately" : weakest ? "Practice a different decision" : "Build your fundamentals" };
      });
    } catch { return undefined; }
  }

  /** Wait for completion writes before the hub reads the refreshed pips. */
  async getProgress(): Promise<Readonly<Record<string, "passed" | "tryAgain">> | undefined> {
    await this.queue;
    const p = await this.load();
    if (!p) return undefined;
    const progress: Record<string, "passed" | "tryAgain"> = {};
    for (const visit of p.visits) {
      if (!DRILL_CATALOG.some(d => d.id === visit.drillId)) continue;
      if (visit.completed) progress[visit.drillId] = "passed";
      else if (visit.explicit && progress[visit.drillId] !== "passed") progress[visit.drillId] = "tryAgain";
    }
    return progress;
  }

  async complete(drillId: string): Promise<void> {
    if (!DRILL_CATALOG.some((d) => d.id === drillId)) throw new Error("Unknown drill");
    await this.update((p) => {
      const visit = [...p.visits].reverse().find((v) => v.drillId === drillId);
      if (!visit) throw new Error("That drill was not picked");
      visit.completed = true;
    });
  }

  /** A drill the player opened on purpose (a coach example): blocks automatic repeats, keeps today's pick. */
  async recordVisit(drillId: string): Promise<void> {
    if (!DRILL_CATALOG.some((d) => d.id === drillId)) throw new Error("Unknown drill");
    await this.update((p) => { const now = this.now(); p.visits.push({ drillId, selectedAtMs: now, localDay: localDay(now), completed: false, explicit: true }); });
  }

  async setReviews(reviews: readonly ReviewForDrill[]): Promise<void> {
    await this.update((p) => { p.reviews = [...reviews]; });
  }

  async forgetGame(gameId: string): Promise<void> {
    await this.update((p) => { p.reviews = p.reviews.filter((r) => r.gameId !== gameId); });
  }
}

/** Ready reviews of the ten newest distinct games, outside a match only; unavailable ones are skipped. */
export async function refreshDrillReviews(list: readonly { file: string; gameId?: string; startedAt: string }[], getReview: (file: string) => Promise<ReviewResult>, inMatch: () => boolean): Promise<ReviewForDrill[] | undefined> {
  if (inMatch()) return undefined;
  const newest = [...list].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const seen = new Set<string>(), out: ReviewForDrill[] = [];
  for (const m of newest) {
    if (out.length >= 10) break;
    if (!m.gameId || seen.has(m.gameId)) continue;
    seen.add(m.gameId);
    const r = await getReview(m.file);
    if (inMatch()) return undefined;
    if (r.status === "ready") out.push({ gameId: m.gameId, startedAt: m.startedAt, mistakes: { ...r.review.mistakes } });
  }
  return out;
}

/** Runs review refreshes one at a time, so an older, slower refresh can never land after a newer one. */
export class DrillRefresher {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly store: DrillStore) {}
  run(read: () => Promise<ReviewForDrill[] | undefined>): Promise<void> {
    const next = this.chain.then(async () => { const reviews = await read(); if (reviews) await this.store.setReviews(reviews); });
    this.chain = next.catch(() => {});
    return next;
  }
}

