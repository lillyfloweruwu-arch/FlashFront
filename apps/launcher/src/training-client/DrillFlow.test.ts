import { expect, it, vi } from "vitest";
import { DrillFlow } from "./DrillFlow";
import type { RewindBuffer } from "./RewindBuffer";

const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function fixture(lite = false) {
  const bridge = { restart: vi.fn(async (_mode: "play" | "demo") => 1) };
  const referee = { reset: vi.fn() };
  const frames = [{ tick: 100, bitmap: {} as ImageBitmap, bytes: 100 }];
  const buffer = { frames: () => frames, clear: vi.fn() } as unknown as RewindBuffer;
  const playRewind = vi.fn(async () => {});
  const flow = new DrillFlow({ bridge, referee, buffer: lite ? null : buffer, playRewind,
    data: { startTick: 100, coach: [{ turn: 20, intent: { type: "attack" } }] } });
  return { flow, bridge, referee, buffer, frames, playRewind };
}
it("rewind then demo then retry, waiting until 30 ticks after the last coach intent", async () => {
  const f = fixture(); const steps: string[] = []; f.flow.subscribe(step => steps.push(step));
  const done = f.flow.rewindAndDemo(); await flush();
  expect(f.playRewind).toHaveBeenCalledWith(f.frames, 1500, expect.any(AbortSignal));
  expect(f.bridge.restart.mock.calls).toEqual([["demo"]]); expect(f.flow.step()).toBe("demo");
  f.flow.onTurn(149); await flush(); expect(f.bridge.restart).toHaveBeenCalledTimes(1);
  f.flow.onTurn(150); await done;
  expect(f.bridge.restart.mock.calls).toEqual([["demo"], ["play"]]);
  expect(f.flow.step()).toBe("retry"); expect(steps).toEqual(["rewinding", "demo", "retry"]);
  expect(f.referee.reset).toHaveBeenCalledTimes(2); expect(f.buffer.clear).toHaveBeenCalledTimes(2);
});
it("lite cuts while preserving the 1500ms scrub animation", async () => {
  const f = fixture(true); const done = f.flow.rewindAndDemo(); await flush();
  expect(f.playRewind).toHaveBeenCalledWith([], 1500, expect.any(AbortSignal));
  f.flow.onTurn(150); await done;
});
it("restart storm coalesces five requests into two serial restarts", async () => {
  const f = fixture(); let running = 0; let maximum = 0; const release: (() => void)[] = [];
  f.bridge.restart.mockImplementation(async () => {
    running++; maximum = Math.max(maximum, running);
    await new Promise<void>(resolve => release.push(resolve)); running--; return 1;
  });
  const pending = Array.from({ length: 5 }, () => f.flow.tryAgain());
  expect(f.bridge.restart).toHaveBeenCalledTimes(1); release.shift()!(); await flush();
  expect(f.bridge.restart).toHaveBeenCalledTimes(2); release.shift()!(); await Promise.all(pending);
  expect(maximum).toBe(1); expect(f.referee.reset).toHaveBeenCalledTimes(2);
});
it("resets the fresh referee after each bridge restart", async () => {
  let referee = { reset: vi.fn() }; const old = referee;
  const flow = new DrillFlow({ bridge: { restart: async () => 1 }, referee: () => referee,
    onRestart: () => { referee = { reset: vi.fn() }; }, buffer: null, playRewind: async () => {}, data: { startTick: 0, coach: [] } });
  await flow.tryAgain(); expect(old.reset).not.toHaveBeenCalled(); expect(referee.reset).toHaveBeenCalledOnce();
});
it("retry interrupts a demo wait without leaving a pending flow", async () => {
  const f = fixture(); const demo = f.flow.rewindAndDemo(); await flush();
  await f.flow.tryAgain(); await demo;
  expect(f.bridge.restart.mock.calls).toEqual([["demo"], ["play"]]); expect(f.flow.step()).toBe("retry");
});
it("dispose cancels rewind even if the presentation callback never settles", async () => {
  const f = fixture(); f.playRewind.mockImplementation(() => new Promise(() => {}));
  const done = f.flow.rewindAndDemo(); f.flow.dispose(); await done;
  await f.flow.tryAgain(); expect(f.bridge.restart).not.toHaveBeenCalled();
});
it("dispose cancels demo waiting and drops pending restarts", async () => {
  const f = fixture(); const done = f.flow.rewindAndDemo(); await flush();
  f.flow.dispose(); f.flow.onTurn(150); await done;
  expect(f.bridge.restart.mock.calls).toEqual([["demo"]]);
});
