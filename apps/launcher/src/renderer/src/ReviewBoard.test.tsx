// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ReviewBoard } from "./ReviewBoard";
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function api() { return { openReviewBoard: vi.fn(async () => {}), closeReviewBoard: vi.fn(async () => {}), seekReviewBoard: vi.fn(async () => {}), resizeReviewBoard: vi.fn(async () => {}), onReviewBoardStatus: vi.fn(() => vi.fn()) }; }
it("opens only its file, seeks exact ticks, and closes the native view on unmount", async () => {
  const a = api();
  await act(async () => root.render(<ReviewBoard api={a} file="one.json" tick={300} inMatch={false} />));
  expect(a.openReviewBoard).toHaveBeenCalledWith("one.json", expect.objectContaining({ x: 0, y: 0 }));
  expect(a.seekReviewBoard).toHaveBeenCalledWith(300);
  await act(async () => root.render(<ReviewBoard api={a} file="one.json" tick={4900} inMatch={false} />));
  expect(a.seekReviewBoard).toHaveBeenLastCalledWith(4900);
  expect(a.openReviewBoard).toHaveBeenCalledTimes(1);
  act(() => root.unmount()); root = createRoot(host);
  expect(a.closeReviewBoard).toHaveBeenCalledTimes(1);
});
it("does not open while a live match is active", async () => {
  const a = api();
  await act(async () => root.render(<ReviewBoard api={a} file="one.json" tick={300} inMatch />));
  expect(a.openReviewBoard).not.toHaveBeenCalled();
  expect(host.textContent).toContain("live match");
});
