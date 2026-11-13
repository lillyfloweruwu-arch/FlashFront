import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nudgeBounds, type NudgeView } from "../shared";
import { NudgeSurface, type NudgeWindowLike } from "./nudge-window";

const game = { x: 0, y: 0, width: 1920, height: 1080 };
function fake() {
  const calls = { setBounds: [] as unknown[], send: [] as (NudgeView | null)[], hide: 0, showInactive: 0, moveTop: 0 };
  let visible = false;
  const win: NudgeWindowLike = {
    setBounds: (b: unknown) => { calls.setBounds.push(b); },
    showInactive: () => { calls.showInactive++; visible = true; },
    hide: () => { calls.hide++; visible = false; },
    isVisible: () => visible,
    moveTop: () => { calls.moveTop++; },
    send: view => { calls.send.push(view); },
  };
  return { win, calls };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("places the tag once on show and never moves it while shown", () => {
  const { win, calls } = fake(); let cursor = { x: 500, y: 400 };
  const surface = new NudgeSurface(win, () => cursor, () => game);
  surface.show(1, "Head coach: No ally yet.", false, "abyss");
  cursor = { x: 900, y: 700 }; vi.advanceTimersByTime(5_000);
  expect(calls.setBounds).toEqual([nudgeBounds({ x: 500, y: 400 }, game).bounds]);
  expect(calls.moveTop).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  surface.hide();
  vi.advanceTimersByTime(219); expect(calls.hide).toBe(0);
  vi.advanceTimersByTime(1); expect(calls.hide).toBe(1);
  surface.dispose();
});

it("refresh on every state publish leaves a shown tag alone unless the game moved", () => {
  const { win, calls } = fake(); let cursor = { x: 500, y: 400 };
  const surface = new NudgeSurface(win, () => cursor, () => game);
  surface.show(1, "a", false, "abyss");
  cursor = { x: 1900, y: 1070 };
  for (let i = 0; i < 20; i++) surface.refresh();
  expect(calls.setBounds).toHaveLength(1);
  expect(calls.send).toHaveLength(1);
  surface.dispose();
});

it("a game move shifts a parked tag with the game and never jumps it to the cursor", () => {
  const { win, calls } = fake(); let cursor = { x: -200, y: 50 }; let rectangle = { ...game };
  const surface = new NudgeSurface(win, () => cursor, () => rectangle);
  surface.show(1, "a", false, "abyss");
  const parked = nudgeBounds(null, game).bounds;
  cursor = { x: 600, y: 500 }; rectangle = { ...game, x: 100, y: 40 };
  surface.refresh();
  expect(calls.setBounds.at(-1)).toEqual({ ...parked, x: parked.x + 100, y: parked.y + 40 });
  surface.dispose();
});

it("a game resize keeps the tag inside the new rect", () => {
  const { win, calls } = fake(); let rectangle = { ...game };
  const surface = new NudgeSurface(win, () => ({ x: 1800, y: 1000 }), () => rectangle);
  surface.show(1, "a", false, "abyss");
  rectangle = { x: 0, y: 0, width: 1280, height: 720 };
  surface.refresh();
  const b = calls.setBounds.at(-1) as { x: number; y: number; width: number; height: number };
  expect(b.x + b.width).toBeLessThanOrEqual(1280); expect(b.y + b.height).toBeLessThanOrEqual(720);
  expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
  surface.dispose();
});

it("parks bottom-centre when the cursor is off the game and stays parked", () => {
  const { win, calls } = fake(); let cursor = { x: -200, y: 50 };
  const surface = new NudgeSurface(win, () => cursor, () => game);
  surface.show(1, "a", false, "abyss");
  cursor = { x: 600, y: 500 }; vi.advanceTimersByTime(5_000);
  expect(calls.setBounds).toEqual([nudgeBounds(null, game).bounds]);
  surface.dispose();
});

it("same id does not restart; a new id shows again during the fade", () => {
  const { win, calls } = fake();
  const surface = new NudgeSurface(win, () => ({ x: 400, y: 300 }), () => game);
  surface.show(1, "a", false, "abyss"); surface.show(1, "a", false, "abyss");
  expect(calls.send.filter(v => v !== null)).toHaveLength(1);
  expect(calls.moveTop).toBe(1);
  surface.hide(); vi.advanceTimersByTime(100);
  surface.show(2, "b", true, "ember"); vi.advanceTimersByTime(1000);
  expect(calls.hide).toBe(0);
  expect(calls.send.at(-1)).toMatchObject({ text: "b", urgent: true, theme: "ember", anchor: "top-left" });
  surface.dispose();
});

it("sends null on hide and the anchor only when it changes", () => {
  const { win, calls } = fake(); let cursor = { x: 100, y: 100 };
  const surface = new NudgeSurface(win, () => cursor, () => game, () => true);
  surface.show(1, "a", false, "abyss");
  expect(calls.send).toEqual([{ id: 1, text: "a", urgent: false, anchor: "top-left", theme: "abyss", lite: true }]);
  expect(calls.send).toHaveLength(1);
  cursor = { x: 1900, y: 1070 }; surface.show(2, "a", false, "abyss");
  expect(calls.send.at(-1)).toMatchObject({ anchor: "bottom-right" });
  surface.hide(); surface.hide();
  expect(calls.send.filter(v => v === null)).toHaveLength(1);
  surface.dispose();
});

it("parks the tag in the game when the cursor is elsewhere and hides when the game is unknown", () => {
  const { win, calls } = fake();
  const surface = new NudgeSurface(win, () => ({ x: 4000, y: 10 }), () => null);
  surface.show(1, "a", false, "abyss");
  expect(calls.showInactive).toBe(0);
  surface.dispose();
  const other = fake();
  new NudgeSurface(other.win, () => ({ x: 4000, y: 10 }), () => game).show(1, "a", false, "abyss");
  expect(other.calls.setBounds[0]).toEqual({ x: 790, y: 841, width: 340, height: 88 });
  vi.clearAllTimers();
});

it("without a trusted cursor point the tag parks and never polls", () => {
  const { win, calls } = fake();
  const surface = new NudgeSurface(win, () => null, () => game);
  surface.show(1, "a", false, "abyss"); vi.advanceTimersByTime(1000);
  expect(calls.setBounds).toEqual([{ x: 790, y: 841, width: 340, height: 88 }]);
  expect(vi.getTimerCount()).toBe(0);
  surface.dispose();
});

it("raise keeps a showing tag above the overlay and does nothing otherwise", () => {
  const { win, calls } = fake();
  const surface = new NudgeSurface(win, () => ({ x: 400, y: 300 }), () => game);
  surface.raise(); expect(calls.moveTop).toBe(0);
  surface.show(1, "a", false, "abyss"); surface.raise(); expect(calls.moveTop).toBe(2);
  surface.hide(); surface.raise(); expect(calls.moveTop).toBe(2);
  surface.dispose();
});

it.each([true, false])("refreshes game geometry with a stationary or unavailable cursor (trusted=%s)", trusted => {
  const { win, calls } = fake();
  let rectangle = { ...game };
  const point = trusted ? { x: 400, y: 300 } : null;
  const surface = new NudgeSurface(win, () => point, () => rectangle);
  surface.show(1, "a", false, "abyss");
  rectangle = { ...game, x: -1920 };
  surface.refresh();
  // The tag moves with the game; it never re-reads the cursor.
  const first = calls.setBounds[0] as { x: number; y: number; width: number; height: number };
  expect(calls.setBounds.at(-1)).toEqual({ ...first, x: first.x - 1920 });
  expect(calls.setBounds).toHaveLength(2);
  surface.refresh();
  expect(calls.setBounds).toHaveLength(2);
  surface.dispose();
});
