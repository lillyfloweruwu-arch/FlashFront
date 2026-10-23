// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { observePanelShape } from "./panel-shape";

it("measures on resize, ignores idle ticks and camera transforms, and disconnects when hidden", async () => {
  vi.useFakeTimers(); const resized: (() => void)[] = []; const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resized.push(cb); } observe() {} disconnect = disconnect; });
  const host = document.createElement("div"); host.innerHTML = '<section data-panel="build"></section><canvas></canvas>'; document.body.append(host);
  let width = 272;
  const geometry = vi.spyOn(host.firstElementChild!, "getBoundingClientRect").mockImplementation(() => ({ x: 20, y: 30, width, height: 100 }) as DOMRect);
  const report = vi.fn(); const close = observePanelShape(host, report);
  try {
    await vi.advanceTimersByTimeAsync(20); expect(report).toHaveBeenCalledTimes(1);
    geometry.mockClear(); await vi.advanceTimersByTimeAsync(1000); expect(geometry).not.toHaveBeenCalled();
    host.querySelector("canvas")!.style.transform = "translateX(10px)";
    await vi.advanceTimersByTimeAsync(20); expect(geometry).not.toHaveBeenCalled();
    width = 300; resized[0]!(); resized[0]!();
    await vi.advanceTimersByTimeAsync(20); expect(geometry).toHaveBeenCalledTimes(1); expect(report).toHaveBeenCalledTimes(2);
    resized[0]!(); close(); await vi.advanceTimersByTimeAsync(1000); expect(report).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalled();
  } finally { close(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
