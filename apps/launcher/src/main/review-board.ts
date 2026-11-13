import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContentsView, WebContentsViewConstructorOptions } from "electron";
import type { ReviewBoardStatus, ReviewBounds, ReviewLoad } from "../review-types";
export interface ReviewBoardDeps {
  createView(options: WebContentsViewConstructorOptions): WebContentsView;
  launcher(): BrowserWindow;
  preload: string; dev?: boolean;
  inMatch(): boolean;
  /** Reads the local cached record and starts the isolated snapshot worker. */
  prepare(file: string): Promise<ReviewLoad>;
  seek(tick: number): Promise<ReviewLoad>;
  cancel(): void;
  status(value: ReviewBoardStatus): void;
  step(direction: -1 | 1): void;
}
const cancelled = (): ReviewLoad => ({ status: "unavailable", reason: "cancelled" });
export class ReviewBoardController {
  private view?: WebContentsView;
  private payload: ReviewLoad = cancelled();
  private generation = 0;
  private seekId = 0;
  private bounds?: ReviewBounds;
  private readyTick?: number;
  private expectedTick?: number;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly deps: ReviewBoardDeps) {}
  authorized(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return !!this.view && event.sender === this.view.webContents && event.senderFrame === this.view.webContents.mainFrame;
  }
  async open(file: string, bounds: ReviewBounds): Promise<void> {
    this.close();
    if (this.deps.inMatch()) { this.deps.status({ status: "unavailable", reason: "inMatch" }); return; }
    if (typeof file !== "string" || !/^[^/\\:]+\.json$/.test(file)) { this.deps.status({ status: "unavailable", reason: "invalidRecord" }); return; }
    const generation = this.generation;
    this.deps.status({ status: "loading" });
    try {
      const result = await this.deps.prepare(file);
      if (generation !== this.generation) return;
      if (this.deps.inMatch()) { this.matchChanged(); return; }
      this.payload = result;
      if (result.status !== "ready") { this.deps.cancel(); this.deps.status(result); return; }
      this.expectedTick = result.value.data.startTick;
      const view = this.deps.createView({ webPreferences: { preload: this.deps.preload, partition: "persist:review", sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      this.view = view;
      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      view.webContents.on("will-navigate", e => e.preventDefault());
      view.webContents.on("will-redirect", e => e.preventDefault());
      view.webContents.on("will-attach-webview", e => e.preventDefault());
      view.webContents.on("render-process-gone", () => { if (this.view === view) this.failed(); });
      view.webContents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown" && (input.key === "ArrowLeft" || input.key === "ArrowRight")) { event.preventDefault(); this.deps.step(input.key === "ArrowLeft" ? -1 : 1); }
      });
      this.deps.launcher().contentView.addChildView(view);
      this.resize(bounds);
      view.setVisible(false);
      this.arm();
      await view.webContents.loadURL(this.deps.dev ? "http://127.0.0.1:5174/review.html" : "fftraining://app/review.html");
    } catch { if (generation === this.generation) this.failed(); }
  }
  private arm(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.failed(), 30_000); }
  load(): ReviewLoad { return this.deps.inMatch() ? { status: "unavailable", reason: "inMatch" } : this.payload; }
  async seek(tick: number): Promise<void> {
    if (!this.view || !Number.isSafeInteger(tick) || tick < 0) return;
    if (this.deps.inMatch()) { this.matchChanged(); return; }
    const generation = this.generation, id = ++this.seekId;
    this.expectedTick = tick; this.readyTick = undefined; this.view.setVisible(false); this.deps.status({ status: "loading" }); this.arm();
    try {
      const result = await this.deps.seek(tick);
      if (generation !== this.generation || id !== this.seekId || !this.view) return;
      if (this.deps.inMatch()) { this.matchChanged(); return; }
      this.payload = result;
      if (result.status !== "ready") { clearTimeout(this.timer); this.deps.status(result); return; }
      this.view.webContents.send("review-snapshot", result);
    } catch { if (generation === this.generation && id === this.seekId) this.failed(); }
  }
  ready(tick: number): void {
    if (!this.view || this.payload.status !== "ready" || tick !== this.payload.value.data.startTick || tick !== this.expectedTick) return;
    clearTimeout(this.timer); this.readyTick = tick;
    if (this.bounds) this.resize(this.bounds);
    this.deps.status({ status: "ready", tick });
  }
  resize(bounds: ReviewBounds): void {
    if (!this.view || !bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
    this.bounds = bounds;
    const size = this.deps.launcher().getContentBounds();
    const x = Math.max(0, Math.min(size.width, Math.round(bounds.x))), y = Math.max(0, Math.min(size.height, Math.round(bounds.y)));
    const right = Math.max(x, Math.min(size.width, Math.round(bounds.x + Math.max(0, bounds.width))));
    const bottom = Math.max(y, Math.min(size.height, Math.round(bounds.y + Math.max(0, bounds.height))));
    this.view.setBounds({ x, y, width: right - x, height: bottom - y });
    this.view.setVisible(right > x && bottom > y && this.readyTick !== undefined);
  }
  matchChanged(): void { if (this.deps.inMatch()) { this.close(); this.deps.status({ status: "unavailable", reason: "inMatch" }); } }
  failed(): void { this.close(); this.deps.status({ status: "unavailable", reason: "bootFailed" }); }
  step(direction: -1 | 1): void { this.deps.step(direction); }
  close(): void {
    ++this.generation; ++this.seekId; clearTimeout(this.timer); this.timer = undefined; this.readyTick = undefined;
    this.deps.cancel(); this.payload = cancelled();
    const view = this.view; this.view = undefined;
    if (view) { this.deps.launcher().contentView.removeChildView(view); if (!view.webContents.isDestroyed()) view.webContents.close(); }
  }
}
export function wireReviewBoardIpc(ipc: Pick<IpcMain, "handle" | "on">, board: ReviewBoardController, launcher: () => BrowserWindow): void {
  const launcherOnly = (event: IpcMainInvokeEvent) => { const web = launcher().webContents; if (event.sender !== web || event.senderFrame !== web.mainFrame) throw new Error("Launcher-only action"); };
  ipc.handle("review-board-open", (e, file: string, bounds: ReviewBounds) => { launcherOnly(e); return board.open(file, bounds); });
  ipc.handle("review-board-seek", (e, tick: number) => { launcherOnly(e); return board.seek(tick); });
  ipc.handle("review-board-resize", (e, bounds: ReviewBounds) => { launcherOnly(e); board.resize(bounds); });
  ipc.handle("review-board-close", e => { launcherOnly(e); board.close(); });
  ipc.handle("review-load", e => { if (!board.authorized(e)) throw new Error("Review-only action"); return board.load(); });
  ipc.on("review-ready", (e, tick: number) => { if (board.authorized(e)) board.ready(tick); });
  ipc.on("review-failed", e => { if (board.authorized(e)) board.failed(); });
  ipc.on("review-step", (e, direction: number) => { if (board.authorized(e) && (direction === -1 || direction === 1)) board.step(direction); });
}


