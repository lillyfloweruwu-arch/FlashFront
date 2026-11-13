// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EndReviewCard } from "./EndReviewCard";
import { syntheticReview } from "./review-fixtures";

let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label));

it("shows layout B: accuracy ring, head coach line, four counts, Retry and Full review", async () => {
  const onFull = vi.fn(); const onRetry = vi.fn();
  await act(async () => root.render(<EndReviewCard model={{ file: "a.json", result: { status: "ready", review: syntheticReview() } }} onFull={onFull} onRetry={onRetry} />));
  expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Accuracy 71%");
  expect(host.textContent).toContain("71%"); expect(host.textContent).toContain("Head coach: at 6:10, land fell 18%");
  expect(host.querySelector("h2")?.textContent).toBe("Game Review");
  expect([...host.querySelectorAll(".end-counts li")].map(li => li.querySelector("strong")?.textContent)).toEqual(["1", "3", "1", "0"]);
  expect(host.querySelectorAll(".end-counts [aria-hidden=true]")).toHaveLength(4);
  expect(host.querySelectorAll(".ff-btn-primary")).toHaveLength(1);
  await act(async () => button("Retry 6:10 in Training")!.click()); expect(onRetry).toHaveBeenCalledTimes(1);
  await act(async () => button("Full review")!.click()); expect(onFull).toHaveBeenCalledTimes(1);
});

it("says Review pending and keeps buttons disabled until the recording is saved", async () => {
  await act(async () => root.render(<EndReviewCard model={{ result: { status: "waiting" } }} onFull={() => {}} onRetry={() => {}} />));
  expect(host.textContent).toContain("Review pending"); expect(host.querySelector('[role="img"]')).toBeNull();
  expect(host.textContent).toContain("Leave the match to finish your review.");
  expect(button("Retry")).toBeUndefined(); expect(button("Full review")!.disabled).toBe(true);
  await act(async () => root.render(<EndReviewCard model={{ file: "a.json", result: { status: "waiting" } }} onFull={() => {}} onRetry={() => {}} />));
  expect(button("Full review")!.disabled).toBe(false);
});

it("the end card adds the role line for its worst moment and keeps unavailable accuracy honest", async () => {
  await act(async () => root.render(<EndReviewCard model={{ file: "a.json", result: { status: "ready", review: syntheticReview() } }} onFull={() => {}} onRetry={() => {}} />));
  expect(host.querySelector(".end-coach-line")!.textContent).toMatch(/^At 6:10, land fell 18%\. Attack coach: /);
  await act(async () => root.render(<EndReviewCard model={{ result: { status: "unavailable", reason: "notArchived" } }} onFull={() => {}} onRetry={() => {}} />));
  expect(host.querySelector(".end-coach-line")).toBeNull();
  expect(host.querySelector('[role="img"]')).toBeNull();
});
