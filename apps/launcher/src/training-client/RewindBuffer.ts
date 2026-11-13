export const REWIND_BUDGET_BYTES = 30 * 1024 * 1024;
export interface RewindFrame { tick: number; bitmap: ImageBitmap; bytes: number }

/** Bounded, renderer-owned images. clear() releases GPU resources on every restart. */
export class RewindBuffer {
  private captured: RewindFrame[] = [];
  private bytes = 0;
  private lastTick: number | undefined;

  constructor(private readonly budgetBytes = REWIND_BUDGET_BYTES, private readonly everyTicks = 10, private readonly width = 640) {
    if (!Number.isFinite(budgetBytes) || budgetBytes < 0 || !Number.isSafeInteger(everyTicks) || everyTicks < 1 || !Number.isSafeInteger(width) || width < 1) {
      throw new Error("Invalid rewind buffer limits");
    }
  }

  capture(tick: number, source: CanvasImageSource): void {
    if (!Number.isFinite(tick) || (this.lastTick !== undefined && tick < this.lastTick + this.everyTicks)) return;
    const size = source as { width?: number; height?: number; videoWidth?: number; videoHeight?: number;
      naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number };
    const sourceWidth = size.videoWidth ?? size.naturalWidth ?? size.displayWidth ?? size.width;
    const sourceHeight = size.videoHeight ?? size.naturalHeight ?? size.displayHeight ?? size.height;
    if (typeof sourceWidth !== "number" || typeof sourceHeight !== "number" || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return;
    const height = Math.max(1, Math.round(this.width * sourceHeight / sourceWidth));
    const bytes = this.width * height * 4;
    if (bytes > this.budgetBytes) return;
    const canvas = new OffscreenCanvas(this.width, height);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(source, 0, 0, this.width, height);
    const bitmap = canvas.transferToImageBitmap();
    this.lastTick = tick;
    this.captured.push({ tick, bitmap, bytes });
    this.bytes += bytes;
    while (this.bytes > this.budgetBytes) {
      const dropped = this.captured.shift()!;
      this.bytes -= dropped.bytes;
      dropped.bitmap.close();
    }
  }

  frames(): readonly RewindFrame[] { return this.captured.slice(); }

  clear(): void {
    for (const frame of this.captured) frame.bitmap.close();
    this.captured = [];
    this.bytes = 0;
    this.lastTick = undefined;
  }
}
