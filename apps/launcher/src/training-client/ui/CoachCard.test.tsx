// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CoachCard } from "./CoachCard";
import { DRILL_CATALOG } from "@flashfront/core";
const hosts: HTMLElement[] = [];
afterEach(() => { hosts.splice(0).forEach(h => h.remove()); vi.unstubAllGlobals(); });
it("coach card keys, unknown land cost, and Lite has no slide", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); hosts.push(host); document.body.append(host);
  const root = createRoot(host), onRewind = vi.fn(), onTryAgain = vi.fn(), onKeepPlaying = vi.fn();
  await act(async () => root.render(<CoachCard drill={DRILL_CATALOG.find(d => d.check.kind === "send")!} evidence={{ sentPct: 70, reservePct: 30 }} lite onRewind={onRewind} onTryAgain={onTryAgain} onKeepPlaying={onKeepPlaying} />));
  expect(host.textContent).toContain("Unavailable");
  expect(host.querySelector("[data-motion]")).toBeNull();
  expect(host.querySelectorAll(".ff-btn-primary")).toHaveLength(1);
  expect(host.querySelectorAll("button")).toHaveLength(3);
  expect(document.activeElement).toBe(host.querySelector("[role=dialog]"));
  for (const key of ["Enter", "t", "Escape"]) await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  expect(onRewind).toHaveBeenCalledOnce(); expect(onTryAgain).toHaveBeenCalledOnce(); expect(onKeepPlaying).toHaveBeenCalledOnce();
  await act(async () => root.render(<CoachCard drill={DRILL_CATALOG.find(d => d.check.kind === "send")!} evidence={{}} hasCoach={false} onRewind={onRewind} onTryAgain={onTryAgain} onKeepPlaying={onKeepPlaying} />));
  expect(host.textContent).not.toContain("Rewind and watch the coach");
  expect(host.querySelector(".ff-btn-primary")?.textContent).toBe("Try again");
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); });
  expect(onRewind).toHaveBeenCalledOnce(); expect(onTryAgain).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
});
