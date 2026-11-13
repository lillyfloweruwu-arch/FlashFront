import { expect, it } from "vitest";
import { DRILL_CATALOG } from "./catalog";
import { localDay, pickNextDrill, rankMistakes, type DrillVisit, type ReviewForDrill } from "./pick";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 25, 12, 0, 0).getTime();
const review = (gameId: string, dayOffset: number, m: Partial<ReviewForDrill["mistakes"]>): ReviewForDrill =>
  ({ gameId, startedAt: new Date(T0 - (20 - dayOffset) * DAY).toISOString(), mistakes: { allyDecision: 0, postsBeforePush: 0, sendSize: 0, ...m } });
const visit = (drillId: string, at: number, completed = false): DrillVisit => ({ drillId, selectedAtMs: at, localDay: localDay(at), completed });

it("sums land cost over only the ten newest reviews", () => {
  const reviews = [review("old", 0, { sendSize: 100 }), ...Array.from({ length: 10 }, (_, i) => review(`g${i}`, i + 1, { postsBeforePush: 1.8, sendSize: 1.2 }))];
  expect(pickNextDrill(reviews, DRILL_CATALOG, [], T0)?.id).toBe("posts-01");
  expect(rankMistakes(reviews)[0]).toEqual({ mistake: "postsBeforePush", cost: expect.closeTo(18, 6) });
});

it("counts a game once, using its newest recording", () => {
  const reviews = [review("same", 1, { sendSize: 50 }), review("same", 5, { allyDecision: 3 })];
  expect(rankMistakes(reviews).find((r) => r.mistake === "sendSize")!.cost).toBe(0);
  expect(pickNextDrill(reviews, DRILL_CATALOG, [], T0)?.mistake).toBe("allyDecision");
});

it("ties follow ally, posts, send order; inside a type the longest-unvisited drill wins", () => {
  const tie = [review("a", 1, { postsBeforePush: 5, sendSize: 5 })];
  expect(pickNextDrill(tie, DRILL_CATALOG, [], T0)?.id).toBe("posts-01");
  const visits = [visit("posts-01", T0 - 9 * DAY), visit("posts-02", T0 - 8 * DAY)];
  expect(pickNextDrill(tie, DRILL_CATALOG, visits, T0)?.id).toBe("posts-03");
  expect(pickNextDrill(tie, DRILL_CATALOG, [...visits, ...["posts-03", "posts-04", "posts-05", "posts-06", "posts-07"].map((id) => visit(id, T0 - 10 * DAY))], T0)?.id).toBe("posts-03");
});

it("seven daily picks are seven different drills, a same-day restart keeps the pick, and day eight moves on", () => {
  const reviews = [review("a", 1, { postsBeforePush: 9, sendSize: 2 })];
  const visits: DrillVisit[] = [];
  const picked: string[] = [];
  for (let d = 0; d < 7; d++) {
    const now = T0 + d * DAY;
    const first = pickNextDrill(reviews, DRILL_CATALOG, visits, now)!;
    visits.push(visit(first.id, now));
    expect(pickNextDrill(reviews, DRILL_CATALOG, visits, now + 3600_000)?.id).toBe(first.id);
    picked.push(first.id);
  }
  expect(new Set(picked).size).toBe(7);
  expect(pickNextDrill(reviews, DRILL_CATALOG, visits, T0 + 7 * DAY - 1)).toBeDefined();
  expect(pickNextDrill(reviews, DRILL_CATALOG, visits, T0 + 7 * DAY - 1)?.mistake).toBe("sendSize");
  expect(pickNextDrill(reviews, DRILL_CATALOG, visits, T0 + 7 * DAY)?.id).toBe(picked[0]);
});

it("with every drill picked this week it returns nothing rather than repeating", () => {
  const visits = DRILL_CATALOG.map((d, i) => visit(d.id, T0 - DAY - i * 60_000));
  expect(pickNextDrill([review("a", 1, { sendSize: 4 })], DRILL_CATALOG, visits, T0)).toBeUndefined();
});

it("a clock moved backwards keeps recent picks excluded", () => {
  const visits = [visit("ally-01", T0 + 2 * DAY)];
  expect(pickNextDrill([], DRILL_CATALOG, visits, T0)?.id).toBe("ally-02");
});

it("no reviews or all-zero costs give the first unseen introductory ally drill", () => {
  expect(pickNextDrill([], DRILL_CATALOG, [], T0)?.id).toBe("ally-01");
  expect(pickNextDrill([review("z", 1, {})], DRILL_CATALOG, [visit("ally-01", T0 - 10 * DAY)], T0)?.id).toBe("ally-02");
  expect(rankMistakes([]).every((r) => r.cost === 0)).toBe(true);
});

it("ignores non-finite or negative costs instead of inventing them", () => {
  const reviews = [review("n", 1, { sendSize: Number.NaN, postsBeforePush: -4, allyDecision: 1 })];
  expect(rankMistakes(reviews)).toEqual([{ mistake: "allyDecision", cost: 1 }, { mistake: "postsBeforePush", cost: 0 }, { mistake: "sendSize", cost: 0 }]);
});

it("an explicitly opened example counts against repeats but never replaces today's pick", () => {
  const today = pickNextDrill([], DRILL_CATALOG, [], T0)!;
  const visits = [visit(today.id, T0), { ...visit("ally-05", T0 + 1000), explicit: true }];
  expect(pickNextDrill([], DRILL_CATALOG, visits, T0 + 2000)?.id).toBe(today.id);
  expect(pickNextDrill([], DRILL_CATALOG, visits, T0 + 1 * DAY)?.id).not.toBe("ally-05");
});
