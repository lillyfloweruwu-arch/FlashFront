import type { RawExtract } from "@flashfront/core";
import { retryRequest, worstMoment } from "../review-presentation";
import type { EndReviewModel, LauncherDestination, ReviewResult, ShapeRect } from "../shared";

export const END_CARD = { width: 420, gap: 12, margin: 12, minWidth: 320, height: 180 };
export type EndCardWindowLike = { setBounds(bounds: ShapeRect): void; showInactive(): void; hide(): void; isVisible(): boolean; moveTop(): void; send(model: EndReviewModel | null): void };

/**
 * The card's screen rectangle (game-window DIP; endRect is relative to the game). In order: centred 12 px
 * under OpenFront's dialog; beside it on the right, then the left, bottoms aligned; then the game corner
 * covering the least of the dialog (top-right first). OpenFront 0.35's end dialog often runs almost to the bottom of the game, so "below"
 * alone left the card unshown. Undefined only for a game too small to hold the card at all.
 */
export function endReviewPlacement(endRect: ShapeRect, gameRect: ShapeRect, cardHeight: number): ShapeRect | undefined {
  const { margin, gap } = END_CARD;
  const width = Math.min(END_CARD.width, gameRect.width - 2 * margin);
  if (width < END_CARD.minWidth || !(cardHeight > 0) || cardHeight > gameRect.height - 2 * margin) return undefined;
  const left = gameRect.x + margin, top = gameRect.y + margin;
  const right = gameRect.x + gameRect.width - margin, bottom = gameRect.y + gameRect.height - margin;
  const dialog = { x: gameRect.x + endRect.x, y: gameRect.y + endRect.y, right: gameRect.x + endRect.x + endRect.width, bottom: gameRect.y + endRect.y + endRect.height };
  const fits = (x: number, y: number) => x >= left && x + width <= right && y >= top && y + cardHeight <= bottom;
  const card = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(cardHeight) });

  const belowY = dialog.bottom + gap;
  if (belowY + cardHeight <= bottom) return card(Math.max(left, Math.min(right - width, (dialog.x + dialog.right) / 2 - width / 2)), belowY);
  const sideY = Math.max(top, Math.min(bottom - cardHeight, dialog.bottom - cardHeight));
  if (fits(dialog.right + gap, sideY)) return card(dialog.right + gap, sideY);
  if (fits(dialog.x - gap - width, sideY)) return card(dialog.x - gap - width, sideY);
  // Last resort: the game corner that covers the least of the dialog (none, when one is free).
  const overlap = (x: number, y: number) => Math.max(0, Math.min(x + width, dialog.right) - Math.max(x, dialog.x)) * Math.max(0, Math.min(y + cardHeight, dialog.bottom) - Math.max(y, dialog.y));
  const corners = [[right - width, top], [left, top], [right - width, bottom - cardHeight], [left, bottom - cardHeight]] as const;
  const [x, y] = corners.reduce((best, c) => overlap(c[0], c[1]) < overlap(best[0], best[1]) ? c : best);
  return card(x, y);
}

/** The dialog's CSS-pixel box scaled into the game window's DIP. */
export function endScreenRect(end: NonNullable<RawExtract["endScreen"]>, game: ShapeRect): ShapeRect | undefined {
  const r = end.rect; const v = end.viewport;
  if (!r || !(v.width > 0) || !(v.height > 0)) return undefined;
  const sx = game.width / v.width, sy = game.height / v.height;
  return { x: r.x * sx, y: r.y * sy, width: r.width * sx, height: r.height * sy };
}

/**
 * One compact card per finished game. It fetches only once the game is over (OpenFront's end dialog is up,
 * or the player has left), never mid-match (C's post-match guard).
 */
export class EndReviewSurface {
  private gameId?: string;
  private model?: EndReviewModel;
  private ending = false;
  private inGame = false;
  private fetching = false;
  private lastFetch = 0;
  private height = END_CARD.height;
  private lastBounds = "";
  /** A new placement waits for a second identical observe, so the card never chases the dialog's animation. */
  private pending = "";
  private sentKey = "";
  private readonly restricted = new Set<string>();
  constructor(private win: EndCardWindowLike, private review: (file: string) => Promise<ReviewResult>) {}

  /** True while OpenFront's own end dialog is visible: every other FlashFront overlay stays hidden. */
  get hidesOverlays(): boolean { return this.ending; }

  observe(raw: RawExtract | null, restricted: boolean, game: ShapeRect | null): void {
    if (!raw) { this.reset(); return; }
    if (raw.inGame && raw.gameId !== this.gameId) { this.reset(); this.gameId = raw.gameId; }
    if (restricted && this.gameId) { this.restricted.add(this.gameId); if (this.restricted.size > 16) this.restricted.delete(this.restricted.values().next().value!); }
    this.inGame = raw.inGame; this.ending = raw.inGame && raw.endScreen?.visible === true;
    if (this.ending && !this.model) this.model = { result: { status: "waiting" } };
    if (!raw.inGame || this.ending) this.fetchReview();
    const end = this.ending && raw.endScreen ? game && endScreenRect(raw.endScreen, game) : undefined;
    const bounds = end && game && !this.isRestricted() ? endReviewPlacement(end, game, this.height) : undefined;
    if (!bounds) { this.pending = ""; this.hide(); return; }
    const key = JSON.stringify(bounds);
    if (key !== this.lastBounds) {
      if (key !== this.pending) { this.pending = key; return; }
      this.win.setBounds(bounds); this.lastBounds = key;
    }
    this.pending = "";
    this.send();
    if (!this.win.isVisible()) { this.win.showInactive(); this.win.moveTop(); }
  }

  /** The finished recording was written; buttons stay disabled until then. */
  recorded(gameId: string | undefined, file: string): void {
    if (!gameId || gameId !== this.gameId || !this.model) return;
    this.model = { ...this.model, file };
    if (this.win.isVisible()) this.send();
    this.fetchReview();
  }

  /** The page's measured card height (CSS px are DIP in this window). */
  measured(height: number): void { if (Number.isFinite(height) && height >= 60 && height <= 480) this.height = Math.ceil(height); }

  action(kind: "full" | "retry"): LauncherDestination | undefined {
    const file = this.model?.file; const result = this.model?.result;
    if (!file) return undefined;
    if (kind === "full") return { screen: "review", file };
    const moment = result?.status === "ready" ? worstMoment(result.review, true) : undefined;
    const request = moment && retryRequest(file, moment);
    return request && { screen: "training", request };
  }

  private isRestricted() { return !!this.gameId && this.restricted.has(this.gameId); }
  private fetchReview() {
    const file = this.model?.file;
    if (!file || (this.inGame && !this.ending) || this.fetching || this.model?.result.status === "ready" || Date.now() - this.lastFetch < 5000) return;
    this.fetching = true; this.lastFetch = Date.now(); const gameId = this.gameId;
    void this.review(file).then(result => { if (this.gameId === gameId && this.model?.file === file) this.model = { ...this.model, result }; })
      .catch(() => {}).finally(() => { this.fetching = false; });
  }
  private send() {
    const key = JSON.stringify(this.model ?? null);
    if (key !== this.sentKey) { this.win.send(this.model ?? null); this.sentKey = key; }
  }
  private hide() {
    if (!this.win.isVisible()) return;
    this.win.send(null); this.sentKey = "null"; this.win.hide();
  }
  private reset() {
    this.hide(); this.gameId = undefined; this.model = undefined; this.ending = false; this.inGame = false; this.lastBounds = ""; this.pending = "";
  }
}
