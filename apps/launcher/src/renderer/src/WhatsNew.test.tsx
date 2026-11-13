// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WhatsNew } from "./WhatsNew";
import { WHATS_NEW } from "./whats-new";

let cleanup = async () => {};
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => { await cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); Reflect.deleteProperty(HTMLDialogElement.prototype, "close"); });

it("lists at most three highlights with Release notes and Got it as shared buttons", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  const onFullNotes = vi.fn(); const onDismiss = vi.fn();
  const entry = { headline: "Calmer HUD.", highlights: [1, 2, 3, 4].map(n => ({ title: `Item ${n}`, text: `Text ${n}.` })) };
  await act(async () => root.render(<WhatsNew version="0.2.1" entry={entry} onFullNotes={onFullNotes} onDismiss={onDismiss} />));
  expect(document.querySelector("h2")?.textContent).toBe("Calmer HUD.");
  expect(document.querySelector("dialog")?.open).toBe(true);
  expect(document.querySelector("#whats-new-version")?.textContent).toBe("What's new in 0.2.1");
  expect(document.querySelector("dialog")?.textContent).toContain("Calmer HUD.");
  expect(document.querySelectorAll(".whats-new-list li")).toHaveLength(3);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.map(b => b.className)).toEqual(["ff-button ff-button-default", "ff-button ff-button-primary"]);
  await act(async () => buttons.find(b => b.textContent === "Release notes")!.click());
  await act(async () => buttons.find(b => b.textContent === "Got it")!.click());
  expect(onFullNotes).toHaveBeenCalledTimes(1); expect(onDismiss).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<WhatsNew version="0.2.1" entry={WHATS_NEW["0.2.1"]!} onFullNotes={onFullNotes} onDismiss={onDismiss} />));
  expect(document.querySelectorAll(".whats-new-list li").length).toBe(WHATS_NEW["0.2.1"]!.highlights.length);
});

it("handles Escape cancellation, respects busy, and restores focus on dismissal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); trigger.remove(); };
  const onDismiss = vi.fn();
  const props = { version: "0.2.1", entry: WHATS_NEW["0.2.1"]!, onFullNotes: vi.fn(), onDismiss };
  await act(async () => root.render(<WhatsNew {...props} />));
  const dialog = document.querySelector("dialog")!;
  expect(document.activeElement?.textContent).toBe("Got it");
  const cancel = new Event("cancel", { cancelable: true });
  await act(async () => dialog.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<WhatsNew {...props} busy />));
  expect(dialog.querySelector<HTMLButtonElement>(".ff-button-primary")?.disabled).toBe(true);
  await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(trigger);
});
