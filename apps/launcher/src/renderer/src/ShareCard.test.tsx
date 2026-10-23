// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { MatchRecorder } from "@flashfront/core";
import { renderShareCard } from "./ShareCard";
afterEach(() => vi.restoreAllMocks());
it("draws a 1200 by 630 card and excludes the name when hidden", () => {
  const context = { fillText: vi.fn(), measureText: (s: string) => ({ width: s.length * 10 }), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true, game: { map: "World" }, me: { name: "Private name" } }, null);
  const m = r.finish()!;
  for (const showName of [false, true]) {
    context.fillText.mockClear(); const canvas = renderShareCard(m, showName);
    expect([canvas.width, canvas.height]).toEqual([1200, 630]);
    expect(context.fillText.mock.calls.some(args => args[0] === "Private name")).toBe(showName);
    expect(context.fillText.mock.calls.some(args => args[0] === "WORLD")).toBe(true);
    expect(context.fillText.mock.calls.some(args => String(args[0]).includes("Land % unavailable"))).toBe(true);
  }
});
