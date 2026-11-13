import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "fixture", setPath: vi.fn(), requestSingleInstanceLock: () => false, quit: vi.fn() }, BrowserWindow: vi.fn() }));
vi.mock("./foreground", () => ({ createForegroundProbe: vi.fn() }));
import { createReviewNavigation } from "./index";
import { MatchFiles } from "./recorder";
it("queues the latest authorized destination until renderer readiness and focuses", async () => {
  const send = vi.fn(), focus = vi.fn(); const files = new MatchFiles("fixture");
  const nav = createReviewNavigation(files, send, focus);
  const file = "2026-10-24_120000_map_game.json";
  await nav.navigate(true, { screen: "review", file }); expect(send).not.toHaveBeenCalled();
  const destination = { screen: "training" as const, request: { kind: "retry" as const, file, tick: 4900, mistake: "sendSize" as const } };
  await nav.navigate(true, destination); nav.ready(); expect(send).toHaveBeenCalledExactlyOnceWith(destination); expect(focus).toHaveBeenCalled();
  await expect(nav.navigate(false, { screen: "review", file })).rejects.toThrow(); expect(send).toHaveBeenCalledTimes(1);
  await nav.navigate(true, { screen: "review", file }); expect(send).toHaveBeenLastCalledWith({ screen: "review", file });
  for (const tick of [-1, 1.5]) await expect(nav.navigate(true, { ...destination, request: { ...destination.request, tick } })).rejects.toThrow();
  await expect(nav.navigate(true, { screen: "review", file: "../secret" })).rejects.toThrow();
  await expect(nav.navigate(true, { ...destination, request: { ...destination.request, mistake: "unknown" } })).rejects.toThrow();
});
