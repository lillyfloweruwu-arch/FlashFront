// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DRILL_CATALOG } from "@flashfront/core";
import { DrillBar } from "./DrillBar";
it("counts down engine ticks at 10 per second without inventing unavailable time", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), drill = DRILL_CATALOG[0]!;
  await act(async () => root.render(<DrillBar drill={drill} tick={110} deadlineTick={750} />));
  expect(host.querySelector("time")?.textContent).toBe("01:04");
  await act(async () => root.render(<DrillBar drill={drill} tick={800} deadlineTick={750} />));
  expect(host.querySelector("time")?.textContent).toBe("00:00");
  await act(async () => root.render(<DrillBar drill={drill} />));
  expect(host.querySelector("time")?.textContent).toBe("Unavailable");
  await act(async () => root.unmount()); vi.unstubAllGlobals();
});
