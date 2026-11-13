// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { YouMarker } from "./YouMarker";
import type { ClientBridge } from "../bridge";
it("you marker follows territory, fades and returns", async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  let x = 30;
  const bridge = { game: () => ({ myPlayer: () => ({ nameLocation: () => ({ x, y: 40 }) }) }), worldToScreen: (x: number, y: number) => ({ x, y }) } as unknown as ClientBridge;
  await act(async () => root.render(<YouMarker bridge={bridge} />));
  expect(host.textContent).toBe("YOU");
  x = 80; await act(async () => { vi.advanceTimersByTime(100); });
  expect(host.querySelector<HTMLElement>(".ff-you-marker")!.style.left).toBe("80px");
  await act(async () => { vi.advanceTimersByTime(4900); }); expect(host.querySelector("[data-hidden]")).not.toBeNull();
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" })); }); expect(host.querySelector("[data-hidden]")).toBeNull();
  await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals();
});
