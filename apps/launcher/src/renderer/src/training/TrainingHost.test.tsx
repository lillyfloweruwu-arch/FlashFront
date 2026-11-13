// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TrainingRequest, TrainingOutcome } from "../../../shared";
import TrainingHost from "./TrainingHost";
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const request = { kind: "prepared", drillId: "ally-01" } as const;
function api() {
  let ended: (r: TrainingRequest, o: TrainingOutcome) => void = () => {};
  const unsubscribe = vi.fn();
  return { startTraining: vi.fn(async () => {}), openTrainingLog: vi.fn(async () => {}),
    getTodaysDrill: vi.fn(async () => ({ drillId: "ally-01", title: "Today", durationSec: 120 as const, mistake: "allyDecision" as const })),
    getDrillProgress: vi.fn(async () => ({})),
    onTrainingEnded: vi.fn((cb: typeof ended) => { ended = cb; return unsubscribe; }),
    emit: (r: TrainingRequest, o: TrainingOutcome) => ended(r, o), unsubscribe };
}
it("opens a requested drill once and shows the window message until it ends", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  expect(a.startTraining).toHaveBeenCalledExactlyOnceWith(request);
  expect(host.textContent).toContain("Training is open in its own window.");
  await act(async () => a.emit(request, { kind: "left" }));
  expect(host.textContent).not.toContain("Training is open in its own window.");
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  expect(a.startTraining).toHaveBeenCalledTimes(1);
});
it("bootFailed shows the explanation, Try again, and Open log", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  await act(async () => a.emit(request, { kind: "error", reason: "bootFailed" }));
  expect(host.textContent).toContain("Training couldn't start.");
  expect(host.textContent).toContain("Try again");
  const log = [...host.querySelectorAll("button")].find(b => b.textContent === "Open log")!;
  await act(async () => log.click());
  expect(a.openTrainingLog).toHaveBeenCalledTimes(1);
});
it("passed refreshes today's drill and persisted progress", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  const before = a.getTodaysDrill.mock.calls.length;
  await act(async () => a.emit(request, { kind: "passed", verdict: "Good" }));
  expect(a.getTodaysDrill.mock.calls.length).toBe(before + 1);
  expect(a.getDrillProgress).toHaveBeenCalledTimes(2);
});
it("a live match blocks opening and does not auto-reopen the request later", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch />));
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  expect(a.startTraining).not.toHaveBeenCalled();
});
it("ignores an older window's completion and unsubscribes on unmount", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  await act(async () => a.emit({ kind: "prepared", drillId: "ally-02" }, { kind: "left" }));
  expect(host.textContent).toContain("Training is open in its own window.");
  act(() => root.unmount()); root = createRoot(host);
  expect(a.unsubscribe).toHaveBeenCalledTimes(1);
});

it("missingMap asks to reinstall maps and a rejected start reports bootFailed", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  await act(async () => a.emit(request, { kind: "error", reason: "missingMap" }));
  expect(host.textContent).toContain("Reinstall maps.");
  const b = api(); b.startTraining.mockRejectedValue(new Error("failed"));
  await act(async () => root.render(<TrainingHost api={b} request={{ ...request }} inMatch={false} />));
  expect(host.textContent).toContain("Training couldn't start.");
});
it("refreshes persisted attempt progress when a prepared drill is left", async () => {
  const a = api();
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  await act(async () => a.emit(request, { kind: "left" }));
  expect(a.getDrillProgress).toHaveBeenCalledTimes(2);
});
it("a late start rejection cannot overwrite a delivered outcome", async () => {
  const a = api(); let reject!: (error: Error) => void;
  a.startTraining.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  await act(async () => root.render(<TrainingHost api={a} request={request} inMatch={false} />));
  await act(async () => a.emit(request, { kind: "error", reason: "missingRecord" }));
  await act(async () => reject(new Error("navigation cancelled")));
  expect(host.textContent).toContain("public record isn't available yet");
  expect(host.textContent).not.toContain("Training couldn't start.");
});
