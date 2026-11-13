// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { disposeRendererListeners, installRendererResize, requestRendererFrame, requestRendererTimeout, registerRendererCleanup } from "./renderer-lifecycle";
it("cancels pending worker timers and releases detached menu resources once", () => {
  vi.useFakeTimers();
  const timeout = vi.fn(), cleanup = vi.fn();
  requestRendererTimeout(timeout, 60000); registerRendererCleanup(cleanup);
  disposeRendererListeners(); disposeRendererListeners();
  vi.advanceTimersByTime(60000);
  expect(timeout).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
it("releases previous renderer listeners on every restart", () => {
  const old = { updateCanvasBoundingRect: vi.fn() }, current = { updateCanvasBoundingRect: vi.fn() };
  installRendererResize(old); disposeRendererListeners(); installRendererResize(current);
  window.dispatchEvent(new Event("resize"));
  expect(old.updateCanvasBoundingRect).not.toHaveBeenCalled();
  expect(current.updateCanvasBoundingRect).toHaveBeenCalledOnce();
  disposeRendererListeners(); disposeRendererListeners();
  window.dispatchEvent(new Event("resize"));
  expect(current.updateCanvasBoundingRect).toHaveBeenCalledOnce();
});
it("cancels recursive controller frame loops when a game ends", () => {
  vi.useFakeTimers();
  const draw = vi.fn(() => { requestRendererFrame(draw); });
  requestRendererFrame(draw);
  vi.advanceTimersByTime(50);
  expect(draw).toHaveBeenCalled();
  disposeRendererListeners();
  const count = draw.mock.calls.length;
  vi.advanceTimersByTime(100);
  expect(draw).toHaveBeenCalledTimes(count);
  vi.useRealTimers();
});
