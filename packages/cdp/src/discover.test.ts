import { afterEach, expect, it, vi } from "vitest";
import { discover, validateSocketUrl } from "./discover";
afterEach(() => { vi.unstubAllGlobals(); });
it("discovers only an OpenFront page on the configured loopback port", async () => {
  const target = { id: "fake", type: "page", url: "app://openfront/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9222/fake" };
  const fetcher = vi.fn().mockResolvedValue(Response.json([{ ...target, url: "https://other.test/" }, target]));
  vi.stubGlobal("fetch", fetcher);
  expect(await discover(9222)).toEqual(target);
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:9222/json/list", expect.objectContaining({ redirect: "error" }));
  fetcher.mockResolvedValue(Response.json([]));
  expect(await discover(9222)).toBeNull();
});
it("rejects hostile endpoints and invalid ports before network access", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(discover(-1)).rejects.toThrow("port");
  expect(fetcher).not.toHaveBeenCalled();
  for (const url of ["ws://localhost:9222/a", "ws://example.com/a", "wss://127.0.0.1/a", "ws://user@127.0.0.1:9222/a", "ws://127.0.0.1:1234/a"]) {
    expect(() => validateSocketUrl(url, 9222)).toThrow();
  }
});
