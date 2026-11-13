// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LineChart } from "./LineChart";

it("exposes keyboard tooltips on a shared line chart", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<LineChart label="Troops" points={[{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }]} />));
  const svg = host.querySelector(".chart > svg")!;
  await act(async () => svg.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  const previous = host.querySelector('[role="tooltip"]')!.textContent;
  await act(async () => svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(host.querySelector('[role="tooltip"]')!.textContent).not.toBe(previous);
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
