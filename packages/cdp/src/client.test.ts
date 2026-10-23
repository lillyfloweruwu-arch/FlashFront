import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { CdpClient, ALLOWED_CDP_METHODS } from "./client";
import { EXTRACT_EXPRESSION, CAMERA_EXPRESSION } from "./extract";
import type { CdpTarget } from "./discover";

let server: WebSocketServer;
let client: CdpClient;
let sockets: ServerSocket[];
let target: CdpTarget;
const params = { expression: EXTRACT_EXPRESSION, returnByValue: true, throwOnSideEffect: true };
beforeEach(async () => {
  sockets = [];
  server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>(r => server.once("listening", r));
  server.on("connection", socket => sockets.push(socket));
  const address = server.address() as { port: number };
  target = { id: "fake", type: "page", url: "app://openfront/index.html", webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}/fake` };
  client = new CdpClient({ timeoutMs: 100, backoffMs: 10 });
  client.setTarget(target);
  await vi.waitFor(() => expect(client.connected).toBe(true));
});
afterEach(async () => {
  client.disconnect();
  for (const socket of server.clients) socket.terminate();
  await new Promise<void>(r => server.close(() => r()));
});
describe("CdpClient", () => {
  it("accepts exactly the two fixed read-only expressions", async () => {
    sockets[0]!.on("message", data => sockets[0]!.send(JSON.stringify({ id: JSON.parse(String(data)).id, result: { ok: true } })));
    for (const expression of [EXTRACT_EXPRESSION, CAMERA_EXPRESSION]) {
      await expect(client.call("Runtime.evaluate", { ...params, expression })).resolves.toEqual({ ok: true });
      expect(() => client.call("Runtime.evaluate", { ...params, expression: expression + ";1" })).toThrow();
    }
  });
  it("rejects prohibited methods and non-extraction expressions before sending", () => {
    const sent = vi.spyOn(WebSocket.prototype, "send");
    expect(ALLOWED_CDP_METHODS).toEqual(["Runtime.evaluate"]);
    for (const method of ["Browser.getWindowForTarget", "Input.dispatchMouseEvent", "Page.navigate", "Page.setBypassCSP", "Runtime.addBinding", "DOM.setAttributeValue"]) {
      expect(() => client.call(method, {})).toThrow("Disallowed");
    }
    expect(() => client.call("Runtime.evaluate", { ...params, expression: "document.body.remove()" })).toThrow("fixed extraction");
    expect(() => client.call("Runtime.evaluate", { ...params, contextId: 4 })).toThrow();
    expect(sent).not.toHaveBeenCalled();
    sent.mockRestore();
  });
  it("matches responses by id even when reversed and ignores protocol events", async () => {
    const messages: { id: number }[] = [];
    sockets[0]!.on("message", data => {
      messages.push(JSON.parse(String(data)) as { id: number });
      if (messages.length === 2) {
        sockets[0]!.send(JSON.stringify({ method: "ignored.event" }));
        sockets[0]!.send(JSON.stringify({ id: messages[1]!.id, result: { order: 2 } }));
        sockets[0]!.send(JSON.stringify({ id: messages[0]!.id, result: { order: 1 } }));
      }
    });
    await expect(Promise.all([client.call("Runtime.evaluate", params), client.call("Runtime.evaluate", params)])).resolves.toEqual([{ order: 1 }, { order: 2 }]);
  });
  it("times out without a response", async () => {
    await expect(client.call("Runtime.evaluate", params)).rejects.toThrow("timeout");
  });
  it("propagates JSON-RPC errors", async () => {
    sockets[0]!.on("message", data => sockets[0]!.send(JSON.stringify({ id: JSON.parse(String(data)).id, error: { message: "fake failure" } })));
    await expect(client.call("Runtime.evaluate", params)).rejects.toThrow("fake failure");
  });
  it("reconnects after close and replaces a changed target", async () => {
    sockets[0]!.close();
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    await vi.waitFor(() => expect(client.connected).toBe(true));
    client.setTarget({ ...target, id: "next", webSocketDebuggerUrl: target.webSocketDebuggerUrl + "-next" });
    await vi.waitFor(() => expect(sockets.length).toBe(3));
    await vi.waitFor(() => expect(client.connected).toBe(true));
    sockets[2]!.on("message", data => sockets[2]!.send(JSON.stringify({ id: JSON.parse(String(data)).id, result: { ok: true } })));
    await expect(client.call("Runtime.evaluate", params)).resolves.toEqual({ ok: true });
  });
  it("refuses remote websocket endpoints", () => {
    expect(() => client.setTarget({ ...target, webSocketDebuggerUrl: "ws://example.com/game" })).toThrow("127.0.0.1");
  });
});
