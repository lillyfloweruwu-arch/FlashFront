import { expect, it, vi } from "vitest";
import type { RawExtract } from "@flashfront/core";
import { EndReviewSurface, endReviewPlacement, type EndCardWindowLike } from "./end-review";
import { syntheticReview } from "../renderer/src/review-fixtures";
import type { ReviewResult } from "../shared";

const game = { x: 100, y: 50, width: 1000, height: 800 };
it("centres the card under the dialog when there is room and never refuses a game wide enough for it", () => {
  expect(endReviewPlacement({ x: 350, y: 100, width: 300, height: 150 }, game, 180)).toEqual({ x: 390, y: 312, width: 420, height: 180 });
  expect(endReviewPlacement({ x: 350, y: 500, width: 300, height: 250 }, game, 180)).toEqual({ x: 668, y: 62, width: 420, height: 180 });
  expect(endReviewPlacement({ x: 0, y: 100, width: 200, height: 150 }, { ...game, width: 300 }, 180)).toBeUndefined();
  // Width is min(420, game.width - 24) and the card stays inside the game horizontally.
  expect(endReviewPlacement({ x: 0, y: 100, width: 100, height: 150 }, { ...game, width: 600 }, 180)).toEqual({ x: 112, y: 312, width: 420, height: 180 });
});

const big = { x: 0, y: 0, width: 1920, height: 1080 };
const small = { x: 0, y: 0, width: 1280, height: 720 };
it("goes to the right of a dialog that leaves no room below", () => {
  // v0.35.4 "You died" at 1080p runs almost to the bottom of the game.
  expect(endReviewPlacement({ x: 630, y: 70, width: 660, height: 960 }, big, 180)).toEqual({ x: 1302, y: 850, width: 420, height: 180 });
});
it("goes to the left when the right side has no room", () => {
  expect(endReviewPlacement({ x: 1100, y: 70, width: 660, height: 960 }, big, 180)).toEqual({ x: 668, y: 850, width: 420, height: 180 });
});
it("falls back to the game's top-right corner when neither side fits", () => {
  expect(endReviewPlacement({ x: 300, y: 40, width: 680, height: 660 }, small, 180)).toEqual({ x: 848, y: 12, width: 420, height: 180 });
});
it("refuses only a card taller than the game", () => {
  expect(endReviewPlacement({ x: 300, y: 40, width: 680, height: 660 }, small, 700)).toBeUndefined();
});

it("the corner fallback avoids a wide 720p dialog", () => {
  // 600 DIP wide, centred, most of the game's height: neither side nor the top corners are free.
  const dialog = { x: 340, y: 20, width: 600, height: 500 };
  const card = endReviewPlacement(dialog, small, 180)!;
  const overlaps = card.x < dialog.x + dialog.width && card.x + card.width > dialog.x && card.y < dialog.y + dialog.height && card.y + card.height > dialog.y;
  expect(overlaps).toBe(false);
  expect(card).toEqual({ x: 848, y: 528, width: 420, height: 180 });
});

function fakeWindow() {
  const sent: unknown[] = []; let visible = false;
  const win: EndCardWindowLike = { setBounds: vi.fn(), showInactive: vi.fn(() => { visible = true; }), hide: vi.fn(() => { visible = false; }),
    isVisible: () => visible, moveTop: vi.fn(), send: vi.fn(model => { sent.push(model); }) };
  return { win, sent };
}
const raw = (patch: Partial<RawExtract> = {}): RawExtract => ({ inGame: true, visible: true, gameId: "game1", gameOver: true,
  endScreen: { visible: true, rect: { x: 700, y: 200, width: 600, height: 300 }, viewport: { width: 2000, height: 1600 } }, ...patch });

it("hides every overlay at the end screen and shows a pending card, fetching only once the recording is saved", () => {
  const { win, sent } = fakeWindow(); const review = vi.fn(async (): Promise<ReviewResult> => ({ status: "waiting" }));
  const card = new EndReviewSurface(win, review);
  card.observe(raw({ endScreen: undefined, gameOver: false }), false, game);
  expect(card.hidesOverlays).toBe(false); expect(win.showInactive).not.toHaveBeenCalled();
  card.observe(raw(), false, game); card.observe(raw(), false, game);
  expect(card.hidesOverlays).toBe(true);
  // CSS (2000×1600) to game DIP (1000×800): dialog {350,100,300,150} so the card lands at {390,312}.
  expect(win.setBounds).toHaveBeenLastCalledWith({ x: 390, y: 312, width: 420, height: 180 });
  expect(sent.at(-1)).toEqual({ result: { status: "waiting" } });
  card.recorded("game1", "game1.json");
  expect(sent.at(-1)).toEqual({ file: "game1.json", result: { status: "waiting" } });
  expect(review).toHaveBeenCalledWith("game1.json");
});

it("never shows the card in ranked, replay or observer games, even after the restriction flag clears", () => {
  const { win } = fakeWindow(); const card = new EndReviewSurface(win, vi.fn());
  card.observe(raw({ endScreen: undefined }), true, game);
  card.observe(raw(), false, game);
  expect(card.hidesOverlays).toBe(true); expect(win.showInactive).not.toHaveBeenCalled();
});

it("clears the old card for a new game or a disconnect, and falls back to the launcher when the game is too small for it", () => {
  const { win, sent } = fakeWindow(); const card = new EndReviewSurface(win, vi.fn());
  card.observe(raw(), false, game); card.observe(raw(), false, game); expect(win.isVisible()).toBe(true);
  card.observe(raw({ gameId: "game2", endScreen: undefined, gameOver: false }), false, game);
  expect(win.isVisible()).toBe(false); expect(sent.at(-1)).toBeNull(); expect(card.hidesOverlays).toBe(false);
  card.observe(raw({ gameId: "game2" }), false, game); card.observe(raw({ gameId: "game2" }), false, game); expect(win.isVisible()).toBe(true);
  card.observe(null, false, null); expect(win.isVisible()).toBe(false);
  card.observe(raw({ endScreen: { visible: true, rect: { x: 0, y: 1000, width: 600, height: 500 }, viewport: { width: 2000, height: 1600 } } }), false, { ...game, width: 300 });
  expect(card.hidesOverlays).toBe(true); expect(win.isVisible()).toBe(false);
});

it("fetches the review once the end dialog is up (or after leaving) and maps buttons to the saved file and worst moment", async () => {
  const { win } = fakeWindow(); const ready: ReviewResult = { status: "ready", review: syntheticReview() };
  const review = vi.fn(async () => ready); const card = new EndReviewSurface(win, review);
  card.observe(raw(), false, game);
  expect(card.action("full")).toBeUndefined(); expect(card.action("retry")).toBeUndefined();
  card.recorded("other", "other.json"); expect(card.action("full")).toBeUndefined();
  card.recorded("game1", "game1.json");
  expect(card.action("full")).toEqual({ screen: "review", file: "game1.json" });
  await vi.waitFor(() => expect(review).toHaveBeenCalledWith("game1.json"));
  expect(card.action("retry")).toEqual({ screen: "training", request: { kind: "retry", file: "game1.json", tick: 4900, mistake: "sendSize" } });
});

it("waits for OpenFront's dialog to settle before placing the card, and never chases its animation", () => {
  const { win } = fakeWindow(); const card = new EndReviewSurface(win, vi.fn());
  const at = (y: number) => raw({ endScreen: { visible: true, rect: { x: 700, y, width: 600, height: 300 }, viewport: { width: 2000, height: 1600 } } });
  card.observe(at(260), false, game); expect(win.isVisible()).toBe(false);
  card.observe(at(230), false, game); expect(win.isVisible()).toBe(false);
  card.observe(at(200), false, game); card.observe(at(200), false, game);
  expect(win.isVisible()).toBe(true); expect(vi.mocked(win.setBounds).mock.calls).toHaveLength(1);
  card.observe(at(180), false, game); expect(vi.mocked(win.setBounds).mock.calls).toHaveLength(1);
  card.observe(at(180), false, game); expect(vi.mocked(win.setBounds).mock.calls).toHaveLength(2);
});
