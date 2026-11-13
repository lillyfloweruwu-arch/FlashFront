// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { renderNudge } from "./nudge-view";

it("renders calm and urgent tags and fades on clear", () => {
  const root = document.createElement("div");
  renderNudge(root, { text: "Head coach: No ally yet.", urgent: false, anchor: "top-left", theme: "abyss" });
  expect(root.textContent).toBe("Head coach: No ally yet.");
  expect(root.querySelector(".nudge-role")?.textContent).toBe("Head coach:");
  expect(root.querySelector(".nudge-countdown")).not.toBeNull();
  expect(root.className).toBe("nudge anchor-top-left");
  renderNudge(root, { text: "Defense coach: Hold.", urgent: true, anchor: "bottom-right", theme: "abyss" });
  expect(root.classList.contains("urgent")).toBe(true);
  expect(root.classList.contains("anchor-bottom-right")).toBe(true);
  renderNudge(root, null);
  expect(root.classList.contains("leaving")).toBe(true);
  expect(root.textContent).toBe("Defense coach: Hold.");
  renderNudge(root, { text: "Economy coach: Port now.", urgent: false, anchor: "center", theme: "abyss" });
  expect(root.className).toBe("nudge anchor-center");
});

it("pulses once per nudge, not again when its anchor flips", () => {
  const root = document.createElement("div");
  const layout = vi.spyOn(root, "offsetWidth", "get");
  const view = { id: 1, text: "Defense coach: Hold.", urgent: true, anchor: "top-left" as const, theme: "abyss" as const };
  renderNudge(root, view);
  expect(layout).toHaveBeenCalledTimes(1);
  renderNudge(root, { ...view, anchor: "bottom-right" });
  expect(root.className).toBe("nudge urgent anchor-bottom-right");
  expect(layout).toHaveBeenCalledTimes(1);
  renderNudge(root, { ...view, id: 2 });
  expect(layout).toHaveBeenCalledTimes(2);
  renderNudge(root, null);
  renderNudge(root, { ...view, id: 3 });
  expect(layout).toHaveBeenCalledTimes(3);
});
