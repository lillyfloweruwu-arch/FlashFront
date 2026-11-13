// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DRILL_CATALOG } from "@flashfront/core";
import { TrainingHub } from "./TrainingHub";

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

it("renders fixture tracks, real results, maps and one primary action using today's saved pick", async () => {
  const onStart = vi.fn();
  const drills = DRILL_CATALOG;
  const api = { getTodaysDrill: async () => ({ drillId: "posts-03", title: "Saved pick", durationSec: 120 as const, mistake: "postsBeforePush" as const }) };
  await act(async () => root.render(<TrainingHub api={api} drills={drills} progress={{ "ally-01": "passed", "posts-01": "tryAgain" }} weakest="postsBeforePush" onStart={onStart} />));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.textContent).toContain("World");
  });
  expect([...host.querySelectorAll(".training-track h2")].map(el => el.textContent)).toEqual(["Ally decisions", "Posts before a push", "Send size"]);
  expect([...host.querySelectorAll(".training-drill-title")].map(el => el.textContent)).toEqual(drills.map(d => d.title));
  expect(host.querySelectorAll(".ff-btn-primary")).toHaveLength(1);
  act(() => host.querySelector<HTMLButtonElement>(".ff-btn-primary")!.click());
  expect(onStart).toHaveBeenLastCalledWith("posts-03");
  for (const [i, row] of [...host.querySelectorAll<HTMLButtonElement>(".training-drill-row")].entries()) {
    act(() => row.click());
    expect(onStart).toHaveBeenLastCalledWith(drills[i]!.id);
  }
  expect(host.querySelectorAll(".training-pips i")).toHaveLength(21);
  expect(host.querySelectorAll(".training-pips .is-passed")).toHaveLength(1);
  expect(host.textContent).toContain("1 of 7 passed");
  expect(host.querySelector('[data-track="postsBeforePush"] .training-weakest')?.textContent).toBe("Costs you the most");
  expect(host.textContent).toContain("Passed");
  expect(host.textContent).toContain("Try again");
  expect(host.textContent).toContain("New");
  expect(host.querySelector(".training-track-art")?.getAttribute("style")).toContain("minimaps/world.png");
});

it("shows Not started and empty pips when progress is missing, without inventing a weakest track", async () => {
  await act(async () => root.render(<TrainingHub api={{}} onStart={vi.fn()} />));
  expect(host.textContent?.match(/Not started/g)).toHaveLength(3);
  expect(host.querySelectorAll(".training-pips i")).toHaveLength(21);
  expect(host.querySelectorAll(".is-passed, .training-weakest")).toHaveLength(0);
  expect(host.querySelector<HTMLButtonElement>(".ff-btn-primary")?.disabled).toBe(true);
  // Unknown progress shows no badge rather than a column of "Unavailable".
  expect(host.querySelector(".training-drill-row .training-badge")).toBeNull();
});

it("handles an unavailable daily pick without preventing catalogue selection", async () => {
  const onStart = vi.fn();
  await act(async () => root.render(<TrainingHub api={{ getTodaysDrill: async () => { throw new Error("offline"); } }} onStart={onStart} />));
  expect(host.textContent).toContain("Today's drill unavailable");
  act(() => host.querySelector<HTMLButtonElement>(".training-drill-row")!.click());
  expect(onStart).toHaveBeenCalledWith(DRILL_CATALOG[0]!.id);
});

it("calls startTraining for a drill card", async () => {
  const startTraining = vi.fn(async () => {});
  await act(async () => root.render(<TrainingHub api={{ startTraining }} />));
  await act(async () => host.querySelector<HTMLButtonElement>(".training-drill-row")!.click());
  expect(startTraining).toHaveBeenCalledWith({ kind: "prepared", drillId: DRILL_CATALOG[0]!.id });
});
