// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Backdrop } from "./Backdrop";

it("layers static map art, contours and a default grid, with optional dimming and grid removal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(<Backdrop />));
    expect(host.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect([...host.firstElementChild!.children].map(el => el.className)).toEqual(["backdrop-map", "backdrop-topo", "backdrop-grid"]);
    expect(host.querySelector<HTMLElement>(".backdrop-map")?.style.backgroundImage).toContain("minimaps/europe.png");
    expect(host.querySelector(".is-dim")).toBeNull();
    await act(async () => root.render(<Backdrop dim grid={false} />));
    expect(host.querySelector(".is-dim")).not.toBeNull();
    expect(host.querySelector(".backdrop-grid")).toBeNull();
    expect(host.querySelector("canvas")).toBeNull();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
