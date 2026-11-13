// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { playRewind, ScrubBar } from "./ScrubBar";
import { CoachPlayingBar } from "./CoachPlayingBar";

afterEach(() => vi.unstubAllGlobals());
function raf() {
  let next = 0; const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++next, callback); return next; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return { callbacks, frame: (time: number) => { const entries = [...callbacks.values()]; callbacks.clear(); entries.forEach(cb => cb(time)); } };
}
it("plays newest frame first and disposes its animation on cancellation", async () => {
  const clock = raf(); const drawImage = vi.fn();
  const canvas = { width: 640, height: 360, hidden: true, getContext: () => ({ drawImage, clearRect: vi.fn() }) } as unknown as HTMLCanvasElement;
  const frames = [0, 10, 20].map(tick => ({ tick, bytes: 100, bitmap: { tick } as unknown as ImageBitmap }));
  const controller = new AbortController();
  const done = playRewind(canvas, frames, 1500, controller.signal);
  expect(drawImage.mock.calls[0][0]).toBe(frames[2].bitmap);
  controller.abort(); await done;
  expect(clock.callbacks.size).toBe(0); expect(canvas.hidden).toBe(true);
});
it("a lite cut still waits for the scrub duration without drawing", async () => {
  const clock = raf(); const drawImage = vi.fn();
  const canvas = { width: 640, height: 360, hidden: true, getContext: () => ({ drawImage, clearRect: vi.fn() }) } as unknown as HTMLCanvasElement;
  const done = playRewind(canvas, [], 1500);
  clock.frame(performance.now() + 1501); await done;
  expect(drawImage).not.toHaveBeenCalled(); expect(clock.callbacks.size).toBe(0);
});
it("shows accessible rewind progress and coach mode, cleaning up on unmount", async () => {
  const clock = raf(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); const root = createRoot(host);
  await act(async () => root.render(<><ScrubBar /><CoachPlayingBar /></>));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Rewinding");
  expect(host.textContent).toContain("Coach is playing");
  await act(async () => root.unmount()); expect(clock.callbacks.size).toBe(0);
});
