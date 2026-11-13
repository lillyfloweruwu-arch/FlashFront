import type { BrowserWindow } from "electron";
import type { ThemeId } from "@flashfront/core";
import { NUDGE_WINDOW, nudgeBounds, type NudgeView, type ShapeRect } from "../shared";

export type NudgeWindowLike = Pick<BrowserWindow, "setBounds" | "showInactive" | "hide" | "isVisible" | "moveTop"> & { send(view: NudgeView | null): void };
/** The page's fade-out time before the window hides. */
export const NUDGE_FADE_MS = 220;

/**
 * The cursor-tag window. It is placed once, by the cursor, when a nudge appears and then stays put:
 * a topmost window moving at 30 Hz over the game was the leading suspect for the owner's "nudges make
 * the game laggy" (spec 2026-10-25 §9.3). Only a game geometry change (refresh) re-places it.
 */
export class NudgeSurface {
  private shownId?: number;
  private view?: NudgeView;
  private fade?: ReturnType<typeof setTimeout>;
  private lastBounds = "";
  private lastGame = "";
  /** The tag's position relative to the game's top-left when it appeared. */
  private offset = { x: 0, y: 0 };
  constructor(private win: NudgeWindowLike, private cursor: () => { x: number; y: number } | null, private game: () => ShapeRect | null, private lite: () => boolean = () => false) {}

  show(id: number, text: string, urgent: boolean, theme: ThemeId): void {
    if (id === this.shownId) return;
    const game = this.game();
    if (!game) { this.hide(); return; }
    clearTimeout(this.fade); this.fade = undefined;
    const point = this.cursor();
    const { bounds, anchor } = nudgeBounds(point, game);
    this.shownId = id; this.lastBounds = JSON.stringify(bounds); this.lastGame = JSON.stringify(game);
    this.offset = { x: bounds.x - game.x, y: bounds.y - game.y };
    this.view = { id, text, urgent, anchor, theme, lite: this.lite() };
    this.win.setBounds(bounds);
    this.win.send(this.view);
    if (!this.win.isVisible()) this.win.showInactive();
    this.win.moveTop();
  }

  /** Keeps a showing tag above the HUD overlay after the overlay is re-shown (same window level). */
  raise(): void { if (this.shownId !== undefined) this.win.moveTop(); }

  /**
   * Main calls this on every state publish. A shown tag moves only when the game rect changed, and then
   * with the game (clamped inside it): it never re-reads the cursor, so it can't jump to the mouse.
   */
  refresh(): void {
    if (this.shownId === undefined) return;
    const game = this.game();
    if (!game) { this.hide(); return; }
    const gameKey = JSON.stringify(game);
    if (gameKey === this.lastGame) return;
    this.lastGame = gameKey;
    const { width, height } = NUDGE_WINDOW;
    const x = Math.max(game.x, Math.min(game.x + game.width - width, game.x + this.offset.x));
    const y = Math.max(game.y, Math.min(game.y + game.height - height, game.y + this.offset.y));
    const bounds = { x, y, width, height };
    const key = JSON.stringify(bounds);
    if (key !== this.lastBounds) { this.win.setBounds(bounds); this.lastBounds = key; }
  }

  hide(): void {
    if (this.shownId === undefined) return;
    this.shownId = undefined; this.view = undefined;
    this.win.send(null);
    this.fade = setTimeout(() => { this.fade = undefined; this.win.hide(); }, NUDGE_FADE_MS);
  }

  dispose(): void {
    clearTimeout(this.fade);
    this.fade = undefined; this.shownId = undefined; this.view = undefined;
  }
}
