export type TargetKind = "wilderness" | "human" | "ai" | "unknown";
export interface RecordPlayer { clientId: string; playerId?: string; name: string }
export type RecordIntent =
  | { kind: "attack"; tick: number; by: string; target: string | null; troops: number | null }
  | { kind: "boat"; tick: number; by: string; troops: number }
  | { kind: "allianceRequest"; tick: number; by: string; to: string }
  | { kind: "allianceReject"; tick: number; by: string; requestor: string }
  | { kind: "breakAlliance"; tick: number; by: string; to: string }
  | { kind: "build"; tick: number; by: string; unit: string }
  | { kind: "spawn"; tick: number; by: string };
export interface ReviewRecord {
  gameId: string; gitCommit: string; map: string; mode: string; durationTicks: number;
  alliancesEnabled: boolean; players: RecordPlayer[]; idsVerified: boolean; intents: RecordIntent[];
}

/** Port of OpenFront's packages/engine-lib/src/PseudoRandom.ts and
 * simpleHash in packages/engine-lib/src/Util.ts (AGPL-3.0).
 * Verified against the installed OpenFront worker's splitmix32/sfc32 implementation.
 */
export function derivePlayerIds(gameId: string, count: number): string[] {
  let hash = 0;
  for (let i = 0; i < gameId.length; i++) hash = ((hash << 5) - hash + gameId.charCodeAt(i)) | 0;
  let seed = Math.abs(hash) | 0;
  const split = () => {
    seed = (seed + 2654435769) | 0;
    let v = seed ^ (seed >>> 16);
    v = Math.imul(v, 569420461); v ^= v >>> 15;
    v = Math.imul(v, 1935289751);
    return (v ^ (v >>> 15)) | 0;
  };
  let a = split(), b = split(), c = split(), d = split();
  const next = () => {
    const v = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + v) | 0;
    return (v >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return Array.from({ length: count }, () => Math.floor(next() * 36 ** 8).toString(36).padStart(8, "0"));
}

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function parseGameRecord(json: unknown): ReviewRecord | undefined {
  const root = object(json), info = object(root.info), config = object(info.config);
  if (!text(info.gameID) || !/^[A-Za-z0-9]{6,16}$/.test(info.gameID) || !text(root.gitCommit)
    || !text(config.gameMap) || !text(config.gameMode) || !number(info.num_turns) || !Number.isInteger(info.num_turns)
    || !Array.isArray(info.players) || info.players.length === 0 || !Array.isArray(root.turns)) return undefined;
  const players: RecordPlayer[] = [];
  for (const value of info.players) {
    const p = object(value);
    if (!text(p.clientID) || typeof p.username !== "string" || players.some(x => x.clientId === p.clientID)) return undefined;
    players.push({ clientId: p.clientID, name: p.username });
  }
  const intents: RecordIntent[] = [];
  const references = new Set<string>();
  for (const value of root.turns) {
    const turn = object(value);
    if (!number(turn.turnNumber) || !Number.isInteger(turn.turnNumber) || !Array.isArray(turn.intents)) continue;
    for (const value of turn.intents) {
      const i = object(value);
      if (!text(i.clientID)) continue;
      for (const id of [i.targetID, i.recipient, i.requestor]) if (text(id)) references.add(id);
      const base = { tick: turn.turnNumber, by: i.clientID };
      switch (i.type) {
        case "attack":
          if ((i.targetID === null || text(i.targetID)) && (i.troops === null || number(i.troops)))
            intents.push({ ...base, kind: "attack", target: i.targetID, troops: i.troops });
          break;
        case "boat": if (number(i.troops)) intents.push({ ...base, kind: "boat", troops: i.troops }); break;
        case "allianceRequest": case "breakAlliance":
          if (text(i.recipient)) intents.push({ ...base, kind: i.type, to: i.recipient }); break;
        case "allianceReject":
          if (text(i.requestor)) intents.push({ ...base, kind: "allianceReject", requestor: i.requestor }); break;
        case "build_unit": if (text(i.unit)) intents.push({ ...base, kind: "build", unit: i.unit }); break;
        case "spawn": intents.push({ ...base, kind: "spawn" }); break;
      }
    }
  }
  const ids = derivePlayerIds(info.gameID, players.length);
  const idsVerified = ids.filter(id => references.has(id)).length >= Math.max(1, Math.ceil(players.length / 2));
  if (idsVerified) players.forEach((p, i) => { p.playerId = ids[i]; });
  return {
    gameId: info.gameID, gitCommit: root.gitCommit, map: config.gameMap, mode: config.gameMode,
    durationTicks: info.num_turns, alliancesEnabled: config.disableAlliances !== true && config.customAllianceDuration !== 0,
    players, idsVerified, intents: intents.sort((a, b) => a.tick - b.tick),
  };
}

export function trimGameRecord(json: unknown): unknown {
  const copy = structuredClone(json);
  const info = object(object(copy).info);
  delete info.reports;
  if (Array.isArray(info.players)) for (const value of info.players) {
    const player = object(value);
    delete player.publicID; delete player.persistentID; delete player.cosmetics;
  }
  return copy;
}

export const ownPlayer = (record: ReviewRecord, clientId: string): RecordPlayer | undefined => record.players.find(p => p.clientId === clientId);
export function targetKind(record: ReviewRecord, target: string | null): TargetKind {
  if (target === null) return "wilderness";
  if (!record.idsVerified) return "unknown";
  return record.players.some(p => p.playerId === target) ? "human" : "ai";
}
