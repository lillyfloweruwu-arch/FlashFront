import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { expect, it, vi } from "vitest";
import { loadTrainingMap, loadTrainingRecord, type TrainingDeps, type TrainingManifest } from "./training";

const fixtures = fileURLToPath(new URL("../../../../packages/training-engine/src/fixtures/maps/onion", import.meta.url));
const raw = { gitCommit: "a2d20f8e5f32573c7a6a7e0b8900dcfeac4357e7", info: { gameID: "abc12345", config: { gameMap: "Onion" }, num_turns: 10, players: [{ clientID: "MeMeMe01", username: "me", stats: { secret: 1 } }] }, turns: [{ turnNumber: 0, intents: [] }] };

function deps(over: Partial<TrainingDeps> = {}): TrainingDeps {
  const mapsDir = mkdtempSync(join(tmpdir(), "ff-maps-"));
  cpSync(fixtures, join(mapsDir, "onion"), { recursive: true });
  const files: TrainingManifest["maps"][number]["files"] = {};
  for (const f of readdirSync(fixtures)) {
    const bytes = brotliDecompressSync(readFileSync(join(fixtures, f)));
    files[f.replace(/\.br$/, "")] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return {
    files: { get: vi.fn(async () => ({ gameId: "abc12345", me: { clientId: "MeMeMe01" } }) as never) },
    records: { ensure: vi.fn(async () => ({ status: "ready" }) as never), read: vi.fn(async () => structuredClone(raw)) },
    inMatch: () => false,
    manifest: async () => ({ upstream: { commit: raw.gitCommit }, maps: [{ key: "onion", id: "Onion", files }] }),
    mapsDir, cacheDir: mkdtempSync(join(tmpdir(), "ff-cache-")),
    ...over,
  };
}

it("delivers the trimmed raw record with the recording's own client id", async () => {
  const r = await loadTrainingRecord(deps(), "2026-10-24_001845_Alps_d8VU9vh2W8.json");
  expect(r).toMatchObject({ status: "ready", value: { ownClientId: "MeMeMe01", record: { gitCommit: raw.gitCommit, turns: raw.turns, info: { gameID: "abc12345", num_turns: 10 } } } });
  if (r.status === "ready") expect(JSON.stringify(r.value.record)).not.toContain("secret");
});

it("rejects a bad file, a record for another game and a record without the owner", async () => {
  expect(await loadTrainingRecord(deps({ files: { get: async () => { throw new Error("Invalid match filename"); } } }), "../../etc")).toEqual({ status: "unavailable", reason: "missingRecord" });
  expect(await loadTrainingRecord(deps({ records: { ensure: async () => ({ status: "ready" }) as never, read: async () => ({ ...raw, info: { ...raw.info, gameID: "zzz99999" } }) } }), "f")).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await loadTrainingRecord(deps({ files: { get: async () => ({ gameId: "abc12345", me: { clientId: "Someone9" } }) as never } }), "f")).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await loadTrainingRecord(deps({ records: { ensure: async () => ({ status: "waiting" }) as never, read: async () => raw } }), "f")).toEqual({ status: "unavailable", reason: "missingRecord" });
});

it("returns inMatch before touching the cache, and drops a read that finishes after a match starts", async () => {
  const d = deps({ inMatch: () => true });
  expect(await loadTrainingRecord(d, "f")).toEqual({ status: "unavailable", reason: "inMatch" });
  expect(d.files.get).not.toHaveBeenCalled();
  let live = false;
  const d2 = deps({ inMatch: () => live });
  d2.records.read = vi.fn(async () => { live = true; return raw; });
  expect(await loadTrainingRecord(d2, "f")).toEqual({ status: "unavailable", reason: "inMatch" });
  expect(await loadTrainingMap(deps({ inMatch: () => true }), "Onion", "Normal")).toEqual({ status: "unavailable", reason: "inMatch" });
});

it("unpacks only the files one game size needs, once, and checks them against the manifest", async () => {
  const d = deps();
  const normal = await loadTrainingMap(d, "Onion", "Normal");
  if (normal.status !== "ready") throw new Error(normal.reason);
  expect(normal.value.mapBin!.length).toBe(262144);
  expect(normal.value.map16xBin).toBeUndefined();
  expect(readdirSync(join(d.cacheDir, raw.gitCommit, "onion")).sort()).toEqual(["manifest.json", "map.bin", "map4x.bin"]);
  const compact = await loadTrainingMap(d, "Onion", "Compact");
  if (compact.status !== "ready") throw new Error(compact.reason);
  expect(compact.value.mapBin).toBeUndefined();
  expect(compact.value.map16xBin!.length).toBe(16384);
  // A damaged cache file is unpacked again; a damaged pack is missingMap, never a wrong board.
  writeFileSync(join(d.cacheDir, raw.gitCommit, "onion", "map.bin"), "junk");
  expect((await loadTrainingMap(d, "Onion", "Normal")).status).toBe("ready");
  writeFileSync(join(d.mapsDir, "onion", "map4x.bin.br"), "junk");
  writeFileSync(join(d.cacheDir, raw.gitCommit, "onion", "map4x.bin"), "junk");
  expect(await loadTrainingMap(d, "Onion", "Normal")).toEqual({ status: "unavailable", reason: "missingMap" });
  expect(await loadTrainingMap(d, "Atlantis", "Normal")).toEqual({ status: "unavailable", reason: "missingMap" });
});

it("a retry must name a saved review moment: file, tick and mistake", async () => {
  const moments = vi.fn(async () => [{ tick: 4900, t: 370, kind: "push" as const, mistake: "sendSize" as const, landLostPct: 8, text: "" }]);
  const d = deps({ moments });
  expect((await loadTrainingRecord(d, "f", { tick: 4900, mistake: "sendSize" })).status).toBe("ready");
  expect(await loadTrainingRecord(d, "f", { tick: 4901, mistake: "sendSize" })).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await loadTrainingRecord(d, "f", { tick: 4900, mistake: "allyDecision" })).toEqual({ status: "unavailable", reason: "invalidRecord" });
  expect(await loadTrainingRecord(deps({ moments: async () => undefined }), "f", { tick: 4900, mistake: "sendSize" })).toEqual({ status: "unavailable", reason: "missingRecord" });
});
