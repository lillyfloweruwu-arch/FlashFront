// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchRecorder, type RecordedMatch } from "@flashfront/core";
import { Timeline } from "./Timeline";
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
function fixture() {
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true }, null);
  const m = r.finish()!; delete m.spawn; delete m.rankedType;
  m.durationSec = 60;
  m.samples = [0, 30, 60].map(t => ({ t, tick: t * 10, troops: 1000 + t, maxTroops: 5000, tiles: 20 + t, gold: t * 100,
    attackRatio: 0.2, zone: "low", incoming: t * 10, outgoingCount: 0 }));
  return m;
}
it("renders four aligned tracks and a single cursor for a legacy recording", async () => {
  await act(async () => root.render(<Timeline match={fixture()} />));
  expect(host.querySelectorAll('[data-track]')).toHaveLength(4);
  expect(host.querySelectorAll('[data-cursor]')).toHaveLength(1);
  expect(host.querySelectorAll('input[type=range]')).toHaveLength(1);
  expect(host.textContent).toContain("Gold"); expect(host.textContent).toContain("Incoming");
});
it("shows recorded land percentages without filling missing percentages with zero", async () => {
  const m = fixture(); m.samples[0]!.tilesOwnedPct = 12.5; m.samples[2]!.tilesOwnedPct = 20;
  await act(async () => root.render(<Timeline match={m} />));
  expect(host.querySelector('[data-track="land"]')?.getAttribute("aria-label")).toBe("Land percent over time");
  expect(host.textContent).toContain("12.5%");
});
it("moves the same cursor from push, bookmark, saved decision and timed coach note", async () => {
  const m = fixture();
  m.events = [{ kind: "push", t: 15, sent: 1000, ratio: 0.2, fractionBefore: 0.5, fractionAfter: 0.2, zoneAfter: "exposed" },
    { kind: "bookmark", t: 25 }, { kind: "decision", t: 35, text: "Growth slowing" }] as RecordedMatch["events"];
  await act(async () => root.render(<Timeline match={m} notes={[{ t: 45, severity: "tip", text: "Observed reserve" }]} />));
  expect(host.querySelectorAll('[data-moment]')).toHaveLength(4);
  for (const [label, time] of [["Push", 15], ["Bookmark", 25], ["Decision", 35], ["Observed reserve", 45]] as const) {
    const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
    expect(button).toBeDefined(); await act(async () => button.click());
    expect((host.querySelector('input[type=range]') as HTMLInputElement).value).toBe(String(time));
    expect(host.querySelector('[data-cursor]')?.getAttribute("data-time")).toBe(String(time));
  }
});
it("saves bookmark text explicitly and preserves the draft on failure", async () => {
  const m = fixture(); m.events = [{ kind: "bookmark", t: 25, note: "First note" }];
  const save = vi.fn().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue(undefined);
  await act(async () => root.render(<Timeline match={m} onAnnotate={save} />));
  const field = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "My note"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  const button = [...host.querySelectorAll("button")].find(b => b.textContent === "Save note")!;
  await act(async () => button.click());
  expect(save).toHaveBeenCalledWith(25, "My note"); expect(host.textContent).toContain("Disk full"); expect(field.value).toBe("My note");
  await act(async () => button.click()); expect(host.textContent).toContain("Note saved");
});
it("follows a controlled cursor and reports slider changes to its owner", async () => {
  const onCursorChange = vi.fn();
  await act(async () => root.render(<Timeline match={fixture()} cursorSec={30} onCursorChange={onCursorChange} />));
  const slider = host.querySelector('input[aria-label="Review time"]') as HTMLInputElement;
  expect(slider.value).toBe("30");
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; setter.call(slider, "45"); slider.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(onCursorChange).toHaveBeenCalledWith(45);
  expect(slider.value).toBe("30");
  await act(async () => root.render(<Timeline match={fixture()} cursorSec={45} onCursorChange={onCursorChange} />));
  expect((host.querySelector('input[aria-label="Review time"]') as HTMLInputElement).value).toBe("45");
});
