import type { DrillCheck } from "@flashfront/core";
import { validateDrill } from "@flashfront/core";

export interface IntentAt { turn: number; intent: Record<string, unknown> }
export interface DrillWindow { openTick: number; deadlineTick: number }
export interface DrillClientData {
  drillId: string; engineCommit: string; snapshotFormat: string;
  startTick: number; ownClientId: string; gameStartInfo: unknown;
  opponents: IntentAt[]; coach: IntentAt[]; check: DrillCheck; window: DrillWindow;
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const tick = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const fail = (why: string): never => { throw new Error(`drill client: ${why}`); };

export function validateDrillClient(value: unknown): DrillClientData {
  if (!object(value)) return fail("not an object");
  for (const key of ["drillId", "engineCommit", "snapshotFormat", "ownClientId"]) {
    if (!(key in value)) fail(`missing ${key}`);
    if (!text(value[key])) fail(`invalid ${key}`);
  }
  if (!tick(value.startTick)) fail("invalid startTick");
  if (!object(value.gameStartInfo)) fail("invalid gameStartInfo");
  for (const key of ["opponents", "coach"]) {
    const entries = value[key];
    if (!Array.isArray(entries) || !entries.every((s) => object(s) && tick(s.turn) && object(s.intent) && text(s.intent.type) && text(s.intent.clientID))) fail(`invalid ${key}`);
  }
  if (!object(value.check)) fail("invalid check");
  try {
    // Reuse core's discriminated check validation, including percentage bounds and tile ids.
    const kind = (value.check as Record<string, unknown>).kind;
    validateDrill({ id: value.drillId, version: 1, durationSec: 120, role: "Head", title: "Client", boardId: value.drillId,
      rationaleId: "client", coachLineId: "client", tags: [], check: value.check,
      mistake: kind === "ally" ? "allyDecision" : kind === "post" ? "postsBeforePush" : "sendSize" });
  } catch { fail("invalid check"); }
  const w = value.window;
  if (!object(w) || !tick(w.openTick) || !tick(w.deadlineTick) || w.openTick < (value.startTick as number) || w.deadlineTick < w.openTick) fail("invalid window");
  return value as unknown as DrillClientData;
}

