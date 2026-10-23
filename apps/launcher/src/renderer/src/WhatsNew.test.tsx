// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WhatsNew } from "./WhatsNew";
import { WHATS_NEW } from "./whats-new";

let cleanup = async () => {};
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); });

it("lists at most three highlights with Full notes and Got it as shared buttons", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  const onFullNotes = vi.fn(); const onDismiss = vi.fn();
  const entry = { headline: "Calmer HUD.", highlights: [1, 2, 3, 4].map(n => ({ title: `Item ${n}`, text: `Text ${n}.` })) };
  await act(async () => root.render(<WhatsNew version="0.2.1" entry={entry} onFullNotes={onFullNotes} onDismiss={onDismiss} />));
  expect(host.querySelector("h2")?.textContent).toBe("What's new in 0.2.1");
  expect(host.textContent).toContain("Calmer HUD.");
  expect(host.querySelectorAll(".whats-new-list li")).toHaveLength(3);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.map(b => b.className)).toEqual(["ff-button ff-button-primary", "ff-button ff-button-default"]);
  await act(async () => buttons.find(b => b.textContent === "Full notes")!.click());
  await act(async () => buttons.find(b => b.textContent === "Got it")!.click());
  expect(onFullNotes).toHaveBeenCalledTimes(1); expect(onDismiss).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<WhatsNew version="0.2.1" entry={WHATS_NEW["0.2.1"]!} onFullNotes={onFullNotes} onDismiss={onDismiss} />));
  expect(host.querySelectorAll(".whats-new-list li").length).toBe(WHATS_NEW["0.2.1"]!.highlights.length);
});
