// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TodaysDrill } from "./TodaysDrill";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

async function render(api: Parameters<typeof TodaysDrill>[0]["api"]) {
  const host = document.createElement("div"), root = createRoot(host);
  await act(async () => root.render(<TodaysDrill api={api} />));
  return { host, root };
}

it("shows today's drill card and opens it as a prepared drill", async () => {
  const showTraining = vi.fn(async () => {});
  const { host, root } = await render({ getTodaysDrill: async () => ({ drillId: "posts-03", title: "The landing coast", durationSec: 120, mistake: "postsBeforePush" }), showTraining });
  const button = host.querySelector("button")!;
  expect(button.textContent).toBe("Start drill");
  expect(host.querySelector("h3")?.textContent).toBe("The landing coast");
  expect(host.textContent).toContain("Defense coach");
  expect(host.querySelectorAll(".drill-week i")).toHaveLength(7);
  expect(host.textContent).toContain("Week unavailable");
  await act(async () => button.click());
  expect(showTraining).toHaveBeenCalledWith({ kind: "prepared", drillId: "posts-03" });
  await act(async () => root.unmount());
});

it("labels each mistake type plainly", async () => {
  for (const [mistake, label] of [["allyDecision", "ally decisions"], ["sendSize", "send size"]] as const) {
    const { host, root } = await render({ getTodaysDrill: async () => ({ drillId: "x", title: "t", durationSec: 120, mistake }), showTraining: async () => {} });
    expect(host.textContent).toContain(label);
    await act(async () => root.unmount());
  }
});

it("invites training when there is no pick, instead of inventing one", async () => {
  const { host, root } = await render({ getTodaysDrill: async () => undefined, showTraining: async () => {} });
  expect(host.textContent).toContain("Visit Training to find your next drill.");
  expect(host.querySelector("button")).toBeNull();
  await act(async () => root.unmount());
});

it("refreshes the daily pick after passing and removes the listener", async () => {
  let ended!: Parameters<NonNullable<Parameters<typeof TodaysDrill>[0]["api"]["onTrainingEnded"]>>[0];
  const unsubscribe = vi.fn();
  const getTodaysDrill = vi.fn(async () => undefined);
  const { root } = await render({ getTodaysDrill, showTraining: async () => {}, onTrainingEnded: cb => { ended = cb; return unsubscribe; } });
  await act(async () => ended({ kind: "prepared", drillId: "ally-01" }, { kind: "passed", verdict: "Good" }));
  expect(getTodaysDrill).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
