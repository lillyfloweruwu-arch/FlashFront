import { afterEach, expect, it, vi } from "vitest";
import { overlayPlacement } from "../shared";
import { createKeyProbe, watchSpawnKey, VK_SPACE } from "./keys";

const native = vi.hoisted(() => ({ key: vi.fn(), load: vi.fn() }));
vi.mock("koffi", () => ({ default: { load: native.load } }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
it("uses only the current high bit, never the between-polls press bit", () => {
  native.load.mockReturnValue({ func: () => native.key });
  const probe = createKeyProbe("win32");
  native.key.mockReturnValue(-32768); expect(probe(VK_SPACE)).toBe(true);
  native.key.mockReturnValue(1); expect(probe(VK_SPACE)).toBe(false);
  native.key.mockImplementation(() => { throw new Error("probe failed"); }); expect(probe(VK_SPACE)).toBeNull();
  expect(createKeyProbe("linux")(VK_SPACE)).toBeNull();
});
it("polls only during spawn and clears held heat and full-area placement on the next tick", () => {
  vi.useFakeTimers(); const probe = vi.fn<() => boolean | null>().mockReturnValue(false);
  let held: boolean | undefined; const watcher = watchSpawnKey(probe, next => { held = next; });
  vi.advanceTimersByTime(100); expect(probe).not.toHaveBeenCalled();
  watcher.setActive(true); expect(held).toBe(false);
  const game = { x: 0, y: 0, width: 1920, height: 1080 }; const panels = [{ x: 20, y: 200, width: 272, height: 80 }];
  probe.mockReturnValue(true); vi.advanceTimersByTime(50); expect(held).toBe(true);
  expect(overlayPlacement(panels, game, false, held !== false)?.bounds.width).toBe(1920);
  probe.mockReturnValue(false); vi.advanceTimersByTime(50); expect(held).toBe(false);
  expect(overlayPlacement(panels, game, false, held !== false)?.bounds.width).toBe(276);
  watcher.setActive(false); expect(held).toBeUndefined(); const count = probe.mock.calls.length;
  vi.advanceTimersByTime(100); expect(probe).toHaveBeenCalledTimes(count); watcher.stop();
});
it("falls back to existing heat when key state is unavailable", () => {
  vi.useFakeTimers(); const update = vi.fn(); const watcher = watchSpawnKey(() => null, update);
  watcher.setActive(true); expect(update).toHaveBeenLastCalledWith(undefined); watcher.stop();
});
