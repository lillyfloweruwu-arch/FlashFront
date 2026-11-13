// Training's main-process side (sub-plan E Task 4): hands the Training screen one verified local
// record and one map at a time. Maps ship brotli-packed; each file is unpacked on first use into a
// cache and checked against the engine manifest. Nothing here runs at launcher start or in a match.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";
import type { MistakeType } from "@flashfront/core";
import type { EngineResult } from "@flashfront/training-engine/contracts";
import type { MapBytes } from "@flashfront/training-engine/protocol";
import type { GameRecordCache } from "./gameRecords";
import type { MatchFiles } from "./recorder";
import { validGameId } from "./api";

const unpack = promisify(brotliDecompress);
export interface TrainingManifest { upstream: { commit: string }; maps: { key: string; id: string; files: Record<string, { bytes: number; sha256: string }> }[] }
export interface TrainingDeps {
  files: Pick<MatchFiles, "get">;
  records: Pick<GameRecordCache, "ensure" | "read">;
  inMatch: () => boolean;
  manifest: () => Promise<TrainingManifest>;
  /** Packed maps: `<dir>/<key>/<file>.br`. */
  mapsDir: string;
  /** Unpacked map cache, per engine commit. */
  cacheDir: string;
  /** The recording's saved review moments, for checking a retry request; undefined when there is no review. */
  moments?: (file: string) => Promise<readonly { tick: number; mistake?: MistakeType }[] | undefined>;
}
export interface TrainingRecord { record: unknown; ownClientId: string }

const object = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const unavailable = (reason: "inMatch" | "missingRecord" | "invalidRecord" | "missingMap") => ({ status: "unavailable" as const, reason });

/** The cached public record for one local recording, trimmed to what the engine reads. */
export async function loadTrainingRecord(deps: TrainingDeps, file: string, retry?: { tick: number; mistake: MistakeType }): Promise<EngineResult<TrainingRecord>> {
  if (deps.inMatch()) return unavailable("inMatch");
  // A retry may only start at a moment the saved review found, never an arbitrary renderer tick.
  if (retry) {
    const moments = await deps.moments?.(file).catch(() => undefined);
    if (deps.inMatch()) return unavailable("inMatch");
    if (!moments) return unavailable("missingRecord");
    if (!moments.some((m) => m.tick === retry.tick && m.mistake === retry.mistake)) return unavailable("invalidRecord");
  }
  let match;
  try { match = await deps.files.get(file); } catch { return unavailable("missingRecord"); }
  if (deps.inMatch()) return unavailable("inMatch");
  const ownClientId = match.me.clientId;
  if (!validGameId(match.gameId) || typeof ownClientId !== "string" || ownClientId.length === 0) return unavailable("missingRecord");
  const status = await deps.records.ensure(match.gameId);
  if (deps.inMatch()) return unavailable("inMatch");
  if (status.status !== "ready") return unavailable("missingRecord");
  const body = object(await deps.records.read(match.gameId));
  if (deps.inMatch()) return unavailable("inMatch");
  const info = object(body.info);
  const players = Array.isArray(info.players) ? info.players.map(object) : [];
  if (info.gameID !== match.gameId || typeof body.gitCommit !== "string" || !Array.isArray(body.turns) || !players.some((p) => p.clientID === ownClientId))
    return unavailable("invalidRecord");
  const record = {
    gitCommit: body.gitCommit,
    info: {
      gameID: info.gameID, lobbyCreatedAt: info.lobbyCreatedAt, visibleAt: info.visibleAt, config: info.config, tribes: info.tribes, num_turns: info.num_turns,
      players: players.map((p) => ({ clientID: p.clientID, username: p.username, clanTag: p.clanTag, isLobbyCreator: p.isLobbyCreator, friends: p.friends, teamIndex: p.teamIndex })),
    },
    turns: body.turns,
  };
  return { status: "ready", value: { record, ownClientId } };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** One map's files for one game size, unpacked into the cache on first use and hash-checked. */
export async function loadTrainingMap(deps: TrainingDeps, mapId: string, mapSize: string): Promise<EngineResult<MapBytes>> {
  if (deps.inMatch()) return unavailable("inMatch");
  if (mapSize !== "Normal" && mapSize !== "Compact") return unavailable("missingMap");
  const manifest = await deps.manifest();
  const entry = manifest.maps.find((m) => m.id === mapId);
  if (!entry) return unavailable("missingMap");
  const names = mapSize === "Normal" ? ["manifest.json", "map.bin", "map4x.bin"] : ["manifest.json", "map4x.bin", "map16x.bin"];
  const dir = join(deps.cacheDir, manifest.upstream.commit, entry.key);
  const out: Record<string, Uint8Array> = {};
  for (const name of names) {
    const want = entry.files[name];
    if (!want) return unavailable("missingMap");
    let bytes: Uint8Array | null = await readFile(join(dir, name)).catch(() => null);
    if (!bytes || bytes.length !== want.bytes || sha256(bytes) !== want.sha256) {
      const packed = await readFile(join(deps.mapsDir, entry.key, `${name}.br`)).catch(() => null);
      if (deps.inMatch()) return unavailable("inMatch");
      if (!packed) return unavailable("missingMap");
      bytes = new Uint8Array(await unpack(packed).catch(() => Buffer.alloc(0)));
      if (bytes.length !== want.bytes || sha256(bytes) !== want.sha256) return unavailable("missingMap");
      await mkdir(dir, { recursive: true });
      const temp = join(dir, `${name}.${process.pid}.tmp`);
      await writeFile(temp, bytes);
      await rename(temp, join(dir, name));
    }
    if (deps.inMatch()) return unavailable("inMatch");
    out[name] = bytes;
  }
  return {
    status: "ready",
    value: {
      mapId, mapSize, manifest: JSON.parse(new TextDecoder().decode(out["manifest.json"])),
      mapBin: out["map.bin"], map4xBin: out["map4x.bin"]!, map16xBin: out["map16x.bin"],
    },
  };
}
