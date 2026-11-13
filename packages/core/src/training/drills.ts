// Prepared drill metadata (sub-plan F). Boards and scripts live in launcher resources, referenced by
// boardId; core holds only what selection, judging and coaching need.
import type { CoachRole } from "../nudge-lines";
import type { MistakeType } from "../review/moments";

export type DrillCheck =
  | { kind: "ally"; decision: "accept" | "decline" | "request"; target: string; deadlineTick: number }
  | { kind: "post"; allowedTiles: readonly number[]; beforeTick: number }
  | { kind: "send"; minSendPct: number; maxSendPct: number; minReservePct: number };
export interface PreparedDrill {
  id: string; version: 1; mistake: MistakeType; role: CoachRole;
  title: string; durationSec: 120; boardId: string; check: DrillCheck;
  rationaleId: string; coachLineId: string; tags: readonly string[];
}

export const MISTAKES: readonly MistakeType[] = ["allyDecision", "postsBeforePush", "sendSize"];
export const ROLES: readonly CoachRole[] = ["Head", "Attack", "Defense", "Economy"];
/** Fixed vocabulary for matching review moments to prepared drills. */
export const DRILL_TAGS = ["sharedBorder", "twoFronts", "underAttack", "opening", "coast", "newLand", "lowReserve", "highReserve", "newCity"] as const;
const CHECK_FOR: Record<MistakeType, DrillCheck["kind"]> = { allyDecision: "ally", postsBeforePush: "post", sendSize: "send" };

const fail = (id: unknown, why: string): never => { throw new Error(`drill ${String(id)}: ${why}`); };
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const tick = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const pct = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

function validateCheck(id: unknown, v: Record<string, unknown>): DrillCheck {
  switch (v.kind) {
    case "ally":
      if (v.decision !== "accept" && v.decision !== "decline" && v.decision !== "request") fail(id, "ally decision");
      if (!text(v.target)) fail(id, "ally target");
      if (!tick(v.deadlineTick)) fail(id, "ally deadline tick");
      return { kind: "ally", decision: v.decision as "accept", target: v.target as string, deadlineTick: v.deadlineTick as number };
    case "post": {
      const tiles = v.allowedTiles;
      if (!Array.isArray(tiles) || tiles.length === 0 || !tiles.every(tick)) fail(id, "post tiles must be non-negative integers");
      if (!tick(v.beforeTick)) fail(id, "post tick");
      return { kind: "post", allowedTiles: [...(tiles as number[])], beforeTick: v.beforeTick as number };
    }
    case "send":
      if (!pct(v.minSendPct) || !pct(v.maxSendPct) || (v.minSendPct as number) > (v.maxSendPct as number)) fail(id, "send bounds");
      if (!pct(v.minReservePct)) fail(id, "reserve bound");
      return { kind: "send", minSendPct: v.minSendPct as number, maxSendPct: v.maxSendPct as number, minReservePct: v.minReservePct as number };
    default:
      return fail(id, "unknown check");
  }
}

export function validateDrill(value: unknown): PreparedDrill {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("?", "not an object");
  const v = value as Record<string, unknown>;
  if (!text(v.id) || !/^[a-z]+-\d{2}$/.test(v.id)) fail(v.id, "id");
  if (v.version !== 1) fail(v.id, "version");
  if (!MISTAKES.includes(v.mistake as MistakeType)) fail(v.id, "mistake");
  if (!ROLES.includes(v.role as CoachRole)) fail(v.id, "role");
  if (v.durationSec !== 120) fail(v.id, "durationSec");
  for (const key of ["title", "boardId", "rationaleId", "coachLineId"] as const) if (!text(v[key])) fail(v.id, key);
  if (!Array.isArray(v.tags) || !v.tags.every((t) => (DRILL_TAGS as readonly string[]).includes(t))) fail(v.id, "tags");
  const check = validateCheck(v.id, (v.check ?? {}) as Record<string, unknown>);
  if (check.kind !== CHECK_FOR[v.mistake as MistakeType]) fail(v.id, "check does not fit the mistake");
  return {
    id: v.id as string, version: 1, mistake: v.mistake as MistakeType, role: v.role as CoachRole, title: v.title as string, durationSec: 120,
    boardId: v.boardId as string, check, rationaleId: v.rationaleId as string, coachLineId: v.coachLineId as string, tags: [...(v.tags as string[])],
  };
}

export function validateCatalog(values: readonly unknown[]): PreparedDrill[] {
  const drills = values.map(validateDrill);
  const seen = new Set<string>();
  for (const d of drills) { if (seen.has(d.id)) fail(d.id, "duplicate id"); seen.add(d.id); }
  return drills;
}
