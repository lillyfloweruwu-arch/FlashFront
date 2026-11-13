// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameReviewView } from "./GameReview";
import { syntheticMatch, syntheticReview } from "./review-fixtures";
import type { ReviewResult } from "../../shared";

let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const ready = (review = syntheticReview()): ReviewResult => ({ status: "ready", review });
const button = (label: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label));

it("shows accuracy, every push label, neutral and unlabelled pushes, and plain coach lines", async () => {
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={() => {}} />));
  const text = host.textContent!;
  expect(text).toContain("71%");
  for (const label of ["Great", "Good", "Costly", "Blunder", "Neutral"]) expect(text).toContain(label);
  expect(text).toContain("Not enough observations");
  expect(host.querySelectorAll("[data-push]")).toHaveLength(7);
  expect(text).toContain("Head coach: at 6:10, land fell 18%");
  expect(text).toContain("Attack coach");
  expect(text).toContain("Reminder not acted on");
  expect(text.match(/Reminder not acted on/g)).toHaveLength(1);
});

it("jumps the Timeline to a key moment and retries with the absolute tick", async () => {
  const onRetry = vi.fn();
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={onRetry} />));
  await act(async () => button("6:10 push left")!.click());
  expect((host.querySelector('input[aria-label="Review time"]') as HTMLInputElement).value).toBe("370");
  await act(async () => button("Retry 6:10 in Training")!.click());
  expect(onRetry).toHaveBeenCalledWith({ kind: "retry", file: "one.json", tick: 4900, mistake: "sendSize" });
});

it("keeps unknown accuracy and unavailable reviews honest", async () => {
  const review = syntheticReview({ accuracy: { rated: 1, goodOrGreat: 1, neutral: 0, opening: 0, defense: 0, reason: "fewPushes" } });
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready(review)} onRetry={() => {}} />));
  expect(host.querySelector(".game-review-accuracy")?.textContent).toBe("AccuracyAccuracy unavailable");
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={{ status: "waiting" }} onRetry={() => {}} />));
  expect(host.textContent).toContain("Review pending"); expect(host.textContent).toContain("Accuracy unavailable");
  expect(button("Retry")).toBeUndefined();
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={{ status: "unavailable", reason: "notArchived" }} onRetry={() => {}} />));
  expect(host.textContent).toContain("Accuracy unavailable"); expect(host.querySelector("[data-push]")).toBeNull();
});

it("adds the role coach's line for the worst retryable moment, a new variant each time it is shown", async () => {
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={() => {}} />));
  const first = host.querySelector(".review-coach-line")!.textContent!;
  expect(first).toMatch(/^At 6:10, land fell 18%\. Attack coach: /);
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={() => {}} />));
  expect(host.querySelector(".review-coach-line")!.textContent).not.toBe(first);
  expect(host.querySelector(".review-coach-line")!.textContent).toMatch(/^At 6:10, land fell 18%\. /);
});


it("frames the charts with glass panels and keeps move selection and scrubber synchronized", async () => {
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={() => {}} />));
  expect(host.querySelectorAll(".game-review-board [data-track]")).toHaveLength(4);
  expect(host.querySelector(".review-coach-card.ff-glass .quality-costly")).not.toBeNull();
  expect(host.querySelector(".review-accuracy-ring")?.getAttribute("style")).toContain("71%");
  expect(host.querySelectorAll(".game-review-counts .quality-badge")).toHaveLength(4);
  expect(host.querySelectorAll(".review-quality-dots i")).toHaveLength(7);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Next move"]')!.click());
  expect(host.querySelector(".review-pushes .is-selected")?.getAttribute("data-push")).toBe("great");
  expect(host.querySelector('[data-cursor]')?.getAttribute("data-time")).toBe("30");
  await act(async () => host.querySelector<HTMLButtonElement>('[data-push="costly"] button')!.click());
  expect(host.querySelector(".review-pushes .is-selected")?.getAttribute("data-push")).toBe("costly");
  expect(host.querySelector('[data-cursor]')?.getAttribute("data-time")).toBe("370");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Previous move"]')!.click());
  expect(host.querySelector('[data-cursor]')?.getAttribute("data-time")).toBe("150");
});

it("opens the real replay board, forwards exact move ticks, and steps with arrow keys", async () => {
  const api = { openReviewBoard: vi.fn(async () => {}), seekReviewBoard: vi.fn(async () => {}), resizeReviewBoard: vi.fn(async () => {}), closeReviewBoard: vi.fn(async () => {}), onReviewBoardStatus: vi.fn(() => vi.fn()), onReviewBoardStep: vi.fn(() => vi.fn()) };
  await act(async () => root.render(<GameReviewView file="one.json" match={syntheticMatch()} result={ready()} onRetry={() => {}} reviewApi={api} />));
  expect(api.openReviewBoard).toHaveBeenCalledWith("one.json", expect.any(Object));
  await act(async () => button("6:10 push left")!.click());
  expect(api.seekReviewBoard).toHaveBeenLastCalledWith(4900);
  expect(host.querySelector('.review-map-shell .ff-btn-primary')?.textContent).toContain("Retry 6:10");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(host.querySelector('.review-pushes .is-selected')?.getAttribute("data-push")).toBe("neutral");
});

