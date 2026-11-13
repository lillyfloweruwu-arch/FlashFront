import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RewindBuffer } from "./RewindBuffer";

const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
const drawImage = vi.fn();
const source = { width: 1920, height: 1080 } as HTMLCanvasElement;
beforeEach(() => {
  bitmaps.length = 0; drawImage.mockClear();
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage }; }
    transferToImageBitmap() { const bitmap = { close: vi.fn() }; bitmaps.push(bitmap); return bitmap; }
  });
});
afterEach(() => vi.unstubAllGlobals());
it("respects budget and closes dropped bitmaps", () => {
  const buffer = new RewindBuffer(1024 * 1024);
  [0, 10, 20].forEach(tick => buffer.capture(tick, source));
  expect(buffer.frames().map(f => ({ tick: f.tick, bytes: f.bytes }))).toEqual([{ tick: 20, bytes: 921_600 }]);
  expect(bitmaps[0].close).toHaveBeenCalledOnce(); expect(bitmaps[1].close).toHaveBeenCalledOnce();
  expect(drawImage).toHaveBeenLastCalledWith(source, 0, 0, 640, 360);
});
it("captures every N ticks", () => {
  const buffer = new RewindBuffer();
  for (let tick = 0; tick < 30; tick++) { buffer.capture(tick, source); buffer.capture(tick, source); }
  expect(buffer.frames().map(f => f.tick)).toEqual([0, 10, 20]);
});
it("clears bitmaps and restarts cadence after snapshot restore", () => {
  const buffer = new RewindBuffer(); buffer.capture(100, source); buffer.clear(); buffer.capture(0, source);
  expect(bitmaps[0].close).toHaveBeenCalledOnce(); expect(buffer.frames().map(f => f.tick)).toEqual([0]);
});
it("ignores unavailable source dimensions and frames larger than the budget", () => {
  const buffer = new RewindBuffer(10); buffer.capture(0, source);
  buffer.capture(10, { width: 0, height: 0 } as HTMLCanvasElement);
  expect(buffer.frames()).toEqual([]);
});
