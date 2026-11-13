import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { installOfflineGuard, trainingAllowed } from "./offline-guard";

afterEach(() => vi.unstubAllGlobals());
it("rejects and logs offsite fetch, passes training assets through", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("map"));
  const log = vi.fn();
  vi.stubGlobal("location", new URL("fftraining://app/training.html"));
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("WebSocket", class {});
  installOfflineGuard(url => url.protocol === "fftraining:", log);
  await expect(globalThis.fetch("https://api.openfront.io/x")).rejects.toBeInstanceOf(TypeError);
  expect(log).toHaveBeenCalledWith("https://api.openfront.io/x");
  expect(fetch).not.toHaveBeenCalled();
  await globalThis.fetch("fftraining://app/maps/x");
  expect(fetch).toHaveBeenCalledWith("fftraining://app/maps/x", undefined);
});
it("logs and redirects blocked WebSockets", () => {
  const connect = vi.fn(); const log = vi.fn();
  vi.stubGlobal("location", new URL("http://127.0.0.1:5174/training.html"));
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("WebSocket", class { constructor(url: string | URL, protocols?: string | string[]) { connect(url, protocols); } });
  installOfflineGuard(url => url.origin === location.origin, log);
  new WebSocket("wss://api.openfront.io/x", ["test"]);
  expect(log).toHaveBeenCalledWith("wss://api.openfront.io/x");
  expect(connect).toHaveBeenCalledWith("ws://127.0.0.1:9/blocked", ["test"]);
});
it("allows only local schemes and the app's own origin", () => {
  const origin = "http://127.0.0.1:5174";
  for (const url of ["fftraining://app/maps/x", "data:image/png;base64,AA", "blob:http://127.0.0.1:5174/1", "http://127.0.0.1:5174/a.png"]) expect(trainingAllowed(new URL(url), origin), url).toBe(true);
  for (const url of ["https://api.openfront.io/x", "wss://openfront.io/w", "http://127.0.0.1:9000/x", "https://cdn.example.com/a.js"]) expect(trainingAllowed(new URL(url), origin), url).toBe(false);
});
it("passes allowed WebSockets through unchanged", () => {
  const connect = vi.fn(); const log = vi.fn();
  vi.stubGlobal("location", new URL("http://127.0.0.1:5174/training.html"));
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("WebSocket", class { constructor(url: string | URL, protocols?: string | string[]) { connect(url, protocols); } });
  installOfflineGuard(url => url.host === location.host, log);
  new WebSocket("ws://127.0.0.1:5174/local");
  expect(connect).toHaveBeenCalledWith("ws://127.0.0.1:5174/local", undefined);
  expect(log).not.toHaveBeenCalled();
});
it("blocks offsite XHR and beacons, passes local ones", () => {
  const open = vi.fn(); const beacon = vi.fn(() => true); const log = vi.fn();
  class FakeXhr {} (FakeXhr.prototype as unknown as { open: unknown }).open = open;
  vi.stubGlobal("location", new URL("fftraining://app/training.html"));
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("WebSocket", class {});
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  installOfflineGuard(url => url.protocol === "fftraining:", log);
  const xhr = new XMLHttpRequest();
  expect(() => xhr.open("GET", "https://api.openfront.io/x")).toThrow(TypeError);
  expect(open).not.toHaveBeenCalled();
  xhr.open("GET", "fftraining://app/a.json");
  expect(open).toHaveBeenCalledWith("GET", "fftraining://app/a.json", true, undefined, undefined);
  expect(navigator.sendBeacon("https://telemetry.example.com/b", "x")).toBe(false);
  expect(navigator.sendBeacon("fftraining://app/b", "x")).toBe(true);
  expect(beacon).toHaveBeenCalledTimes(1);
  expect(log.mock.calls.map(c => c[0])).toEqual(["https://api.openfront.io/x", "https://telemetry.example.com/b"]);
});
it("the Training page's CSP keeps connections local, so the worker is covered too", () => {
  const html = readFileSync(new URL("../renderer/training.html", import.meta.url), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  expect(csp).toContain("connect-src 'self' fftraining: data: blob:;");
  expect(csp).toContain("default-src 'self' fftraining:;");
  expect(csp).not.toMatch(/https?:|wss?:|\*/);
});
