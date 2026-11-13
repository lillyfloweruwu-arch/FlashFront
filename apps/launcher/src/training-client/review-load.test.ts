import { expect, it, vi } from "vitest";
import type { ReviewBridgeApi, ReviewLoad } from "../review-types";
import { subscribeReviewLoads } from "./review-load";
it("a newer snapshot wins over a delayed initial load reply", async () => {
  let resolve!: (load: ReviewLoad) => void, publish!: (load: ReviewLoad) => void;
  const newer: ReviewLoad = { status: "unavailable", reason: "desync" }, older: ReviewLoad = { status: "unavailable", reason: "cancelled" };
  const api = { load: () => new Promise<ReviewLoad>(r => { resolve = r; }), onSnapshot: (cb: typeof publish) => { publish = cb; return vi.fn(); }, failed: vi.fn() } as unknown as ReviewBridgeApi;
  const show = vi.fn(async () => {}), connection = subscribeReviewLoads(api, show);
  publish(newer); resolve(older); await connection.ready;
  expect(show).toHaveBeenCalledExactlyOnceWith(newer); connection.dispose();
});
it("closing while initial data loads prevents a new client from starting", async () => {
  let resolve!: (load: ReviewLoad) => void; const off = vi.fn(), show = vi.fn(async () => {});
  const api = { load: () => new Promise<ReviewLoad>(r => { resolve = r; }), onSnapshot: () => off, failed: vi.fn() } as unknown as ReviewBridgeApi;
  const connection = subscribeReviewLoads(api, show); connection.dispose(); resolve({ status: "unavailable", reason: "cancelled" }); await connection.ready;
  expect(off).toHaveBeenCalledOnce(); expect(show).not.toHaveBeenCalled();
});
