import { afterEach, expect, it, vi } from "vitest";
import { MatchRecorder } from "@flashfront/core";
import { StatsApi, resolvePublicId, PublicIdResolver, upstreamPath, recordUpstreamPath, RECORD_MAX_BYTES } from "./api";
const json = (body: unknown, age = 60, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Cache-Control": `public, max-age=${age}` } });
afterEach(() => vi.useRealTimers());
it("keeps full records main-only and outside the memory cache", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ turns: [] }));
  let now = 0;
  const api = new StatsApi(fetcher, () => now, async ms => { now += ms; });
  expect(upstreamPath("/api/game/abc123?turns=true")).toBeUndefined();
  expect(recordUpstreamPath("abc123")).toBe("/public/game/abc123");
  expect(recordUpstreamPath("../x")).toBeUndefined();
  expect((await api.gameRecord("../x")).status).toBe(400);
  await api.gameRecord("abc123"); await api.gameRecord("abc123");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![0]).toBe("https://api.openfront.io/public/game/abc123");
  expect(now).toBe(1000);
});
it("refuses oversized declared and streamed record bodies", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(RECORD_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("{}", { headers: { "content-length": "30000000" } }))
    .mockResolvedValueOnce(new Response(stream));
  const api = new StatsApi(fetcher, Date.now, async () => {});
  expect((await api.gameRecord("abc123")).status).toBe(413);
  expect((await api.gameRecord("abc123")).status).toBe(413);
  expect(cancelled).toBe(true);
});
it("checks the match guard again after waiting in the shared request queue", async () => {
  let playing = false;
  const fetcher = vi.fn<typeof fetch>(async () => json({ turns: [] }));
  const api = new StatsApi(fetcher, Date.now, async () => { playing = true; });
  expect((await api.gameRecord("abc123", () => !playing)).status).toBe(425);
  expect(fetcher).not.toHaveBeenCalled();
});
it("honors max-age with a 30-second floor, coalesces cache misses, and spaces global requests", async () => {
  let now = 0; const starts: number[] = [];
  const fetcher = vi.fn(async () => { starts.push(now); return json({ ok: true }, starts.length === 1 ? 120 : 1); });
  const api = new StatsApi(fetcher, () => now, async ms => { now += ms; });
  await Promise.all([api.get("/api/player/Abcd1234"), api.get("/api/player/Abcd1234"), api.get("/api/game/game123")]);
  expect(starts).toEqual([0, 1000]);
  now = 119_999; await api.get("/api/player/Abcd1234"); expect(fetcher).toHaveBeenCalledTimes(2);
  now = 120_000; await api.get("/api/player/Abcd1234"); expect(fetcher).toHaveBeenCalledTimes(3);
  now = 149_999; await api.get("/api/player/Abcd1234"); expect(fetcher).toHaveBeenCalledTimes(3);
  now = 150_000; await api.get("/api/player/Abcd1234"); expect(fetcher).toHaveBeenCalledTimes(4);
});
it("rejects invalid params without fetching, maps only public GETs and omits credentials", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ results: [] }));
  const api = new StatsApi(fetcher, Date.now, async () => {});
  for (const path of ["/api/player/short", "/api/player/123456789", "/api/game/abc", "/api/game/abc123?turns=true", "/api/leaderboard/ranked?page=0", "/api/leaderboard/ranked?page=21", "/api/leaderboard/ranked?page=1&page=2", "/api/users/@me", "/api/player/abcd1234?token=secret"]) expect((await api.get(path)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  await api.get("/api/game/abc123"); await api.get("/api/player/abcd1234/games?cursor=a%2Bb%2F%3D");
  expect(fetcher.mock.calls[0]).toEqual(["https://api.openfront.io/public/game/abc123?turns=false", expect.objectContaining({ method: "GET", credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) })]);
  expect(fetcher.mock.calls[1]![0]).toBe("https://api.openfront.io/public/player/abcd1234/games?cursor=a%2Bb%2F%3D");
});
it("preserves upstream statuses and returns 502 for network failures", async () => {
  const api = new StatsApi(vi.fn().mockResolvedValueOnce(json({ error: "Not archived" }, 30, 404)).mockRejectedValueOnce(new Error("offline")), Date.now, async () => {});
  expect(await api.get("/api/game/abc123")).toEqual({ status: 404, body: { error: "Not archived" } });
  expect(await api.get("/api/game/abc124")).toEqual({ status: 502, body: { error: "Public stats service unavailable" } });
});
it("resolves setting, extraction, then the exact own clientID from info.players", async () => {
  const get = vi.fn(async () => ({ status: 200, body: { info: { players: [
    { clientID: "other", username: "same name", publicID: "OTHER123", stats: { peakTroops: 999 } },
    { clientID: "own", username: "same name", publicID: "OWN12345", stats: { peakTroops: 123 } },
  ] } } }));
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true, gameId: "game1234", me: { clientId: "own" } }, null);
  const match = r.finish()!;
  expect(await resolvePublicId({ setting: "MANUAL12", me: { profilePublicId: "EXTRACT1" }, match, api: { get } })).toBe("MANUAL12");
  expect(await resolvePublicId({ me: { profilePublicId: "EXTRACT1" }, match, api: { get } })).toBe("EXTRACT1");
  expect(get).not.toHaveBeenCalled();
  expect(await resolvePublicId({ match, api: { get } })).toBe("OWN12345");
  expect(match.me.publicId).toBeUndefined();
});
it("retries missing archives at 30 s, 2 min, 10 min and persists the eventual own ID", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0); let id: string | undefined;
  const fetcher = vi.fn().mockImplementation(async () => fetcher.mock.calls.length < 4 ? json({}, 30, 404) : json({ info: { players: [{ clientID: "own", publicID: "OWN12345" }] } }));
  const api = new StatsApi(fetcher);
  const persist = vi.fn(async (value: string) => { id = value; });
  const resolver = new PublicIdResolver(api, () => id, persist);
  const r = new MatchRecorder(); r.consume({ inGame: true, visible: true, gameId: "game1234", me: { clientId: "own" } }, null);
  resolver.ended(r.finish()!); await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(90_000); expect(fetcher).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(480_000); expect(fetcher).toHaveBeenCalledTimes(4); expect(persist).toHaveBeenCalledWith("OWN12345");
  resolver.stop();
});
