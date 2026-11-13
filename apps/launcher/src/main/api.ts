import type { RawExtract, RecordedMatch } from "@flashfront/core";
export const validPublicId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9]{8}$/.test(id);
export const validGameId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9]{6,16}$/.test(id);
export interface ApiResult { status: number; body: unknown; }
export const RECORD_MAX_BYTES = 25_000_000;
export const recordUpstreamPath = (gameId: string): string | undefined => validGameId(gameId) ? `/public/game/${gameId}` : undefined;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

/** Closed route map: caller input can never choose a host, method, header or arbitrary upstream path. */
export function upstreamPath(path: string): string | undefined {
  if (typeof path !== "string" || !path.startsWith("/api/") || path.length > 3000) return undefined;
  const url = new URL(path, "http://127.0.0.1");
  const player = url.pathname.match(/^\/api\/player\/([A-Za-z0-9]{8})(\/games)?$/);
  const game = url.pathname.match(/^\/api\/game\/([A-Za-z0-9]{6,16})$/);
  const keys = [...url.searchParams.keys()];
  if (player) {
    if (keys.some(k => k !== "cursor" || !player[2]) || keys.length > 1) return undefined;
    const cursor = url.searchParams.get("cursor");
    if (cursor && (cursor.length > 2048 || /[\u0000-\u001f]/.test(cursor))) return undefined;
    return `/public/player/${player[1]}${player[2] ?? ""}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
  }
  if (game && keys.length === 0) return `/public/game/${game[1]}?turns=false`;
  if (url.pathname === "/api/leaderboard/ranked" && keys.every(k => k === "page") && keys.length <= 1) {
    const page = url.searchParams.get("page") ?? "1";
    if (/^(?:[1-9]|1[0-9]|20)$/.test(page)) return `/leaderboard/ranked?page=${page}`;
  }
  return undefined;
}
export class StatsApi {
  private cache = new Map<string, { expires: number; result: ApiResult }>();
  private pending = new Map<string, Promise<ApiResult>>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))) {}
  /** Main process only. Guard is checked at dispatch, after the shared queue wait. */
  gameRecord(gameId: string, mayStart: () => boolean = () => true): Promise<ApiResult> {
    const upstream = recordUpstreamPath(gameId);
    if (!upstream) return Promise.resolve({ status: 400, body: {} });
    const operation = this.queue.then(async (): Promise<ApiResult> => {
      await this.sleep(Math.max(0, this.lastStart + 1000 - this.now()));
      if (!mayStart()) return { status: 425, body: {} };
      this.lastStart = this.now();
      try {
        const response = await this.fetcher(`https://api.openfront.io${upstream}`, {
          method: "GET", credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000),
        });
        if (Number(response.headers.get("content-length")) > RECORD_MAX_BYTES) {
          await response.body?.cancel(); return { status: 413, body: {} };
        }
        const reader = response.body?.getReader();
        if (!reader) return { status: response.status, body: {} };
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > RECORD_MAX_BYTES) { await reader.cancel(); return { status: 413, body: {} }; }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); } catch { body = {}; }
        return { status: response.status, body };
      } catch { return { status: 502, body: {} }; }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  get(path: string): Promise<ApiResult> {
    const upstream = upstreamPath(path);
    if (!upstream) return Promise.resolve({ status: 400, body: { error: "Invalid public API route or parameters" } });
    const cached = this.cache.get(upstream);
    if (cached && cached.expires > this.now()) return Promise.resolve(cached.result);
    const pending = this.pending.get(upstream); if (pending) return pending;
    const operation = this.queue.then(async (): Promise<ApiResult> => {
      await this.sleep(Math.max(0, this.lastStart + 1000 - this.now()));
      this.lastStart = this.now();
      try {
        const response = await this.fetcher(`https://api.openfront.io${upstream}`, {
          method: "GET", credentials: "omit", redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
        });
        const content = await response.text(); let body: unknown;
        try { body = JSON.parse(content); } catch { body = { error: content.slice(0, 1000) || response.statusText }; }
        const result = { status: response.status, body };
        const age = Number(response.headers.get("cache-control")?.match(/(?:^|[,\s])max-age\s*=\s*"?(\d+)/i)?.[1] ?? 0);
        this.cache.set(upstream, { expires: this.now() + Math.max(30, age) * 1000, result });
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
        return result;
      } catch { return { status: 502, body: { error: "Public stats service unavailable" } }; }
    });
    this.queue = operation.catch(() => {}); this.pending.set(upstream, operation);
    void operation.then(() => this.pending.delete(upstream), () => this.pending.delete(upstream));
    return operation;
  }
}
export async function resolvePublicId(options: {
  setting?: string; me?: RawExtract["me"]; match?: RecordedMatch; api: Pick<StatsApi, "get">;
}): Promise<string | undefined> {
  if (validPublicId(options.setting)) return options.setting;
  if (validPublicId(options.me?.profilePublicId)) return options.me.profilePublicId;
  const m = options.match;
  if (!m?.me.clientId || !validGameId(m.gameId)) return undefined;
  const response = await options.api.get(`/api/game/${m.gameId}`);
  if (response.status !== 200) return undefined;
  const players = object(object(response.body).info).players;
  if (!Array.isArray(players)) return undefined;
  const own = players.map(object).find(p => p.clientID === m.me.clientId);
  return validPublicId(own?.publicID) ? own.publicID : undefined;
}

/** Retry offsets are measured from match completion, not from the preceding attempt. */
export class PublicIdResolver {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;
  constructor(private readonly api: StatsApi, private readonly setting: () => string | undefined,
    private readonly persist: (id: string) => Promise<void>) {}
  async observe(me: RawExtract["me"]) {
    if (this.stopped || validPublicId(this.setting())) return;
    const id = await resolvePublicId({ me, api: this.api });
    if (id && !this.stopped && !validPublicId(this.setting())) await this.persist(id);
  }
  ended(match: RecordedMatch) {
    if (this.stopped || validPublicId(this.setting()) || !match.me.clientId || !validGameId(match.gameId)) return;
    const attempt = async () => {
      if (this.stopped || validPublicId(this.setting())) return;
      const id = await resolvePublicId({ setting: this.setting(), match, api: this.api });
      if (id && !this.stopped && !validPublicId(this.setting())) await this.persist(id);
    };
    void attempt().catch(() => {});
    for (const ms of [30_000, 120_000, 600_000]) {
      const timer = setTimeout(() => { this.timers.delete(timer); void attempt().catch(() => {}); }, ms);
      timer.unref(); this.timers.add(timer);
    }
  }
  stop() { this.stopped = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }
}
