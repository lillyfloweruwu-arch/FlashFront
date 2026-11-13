export { validateDrillClient } from "./drill-client-data";
export type { DrillClientData, DrillWindow, IntentAt } from "./drill-client-data";
import { validateDrillClient, type DrillWindow, type IntentAt } from "./drill-client-data";
const fail = (why: string): never => { throw new Error(`drill client: ${why}`); };
const tick = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
import type { DrillCheck } from "@flashfront/core";
import { opponentNames } from "@flashfront/core";
import type { PreparedBoard, ScheduledAction } from "./contracts";
import type { DrillCast } from "./drill-evidence";
import { ATTEMPT_TICKS } from "./drills/author";
import { openDrill } from "./drills/play";
import { intentFor, parseStart, type Runner } from "./upstream";

export function drillWindow(check: DrillCheck, startTick: number, opponents: readonly ScheduledAction[]): DrillWindow {
  if (check.kind === "ally") {
    // Request drills (ally-04/05) have no opponent action to wait for.
    return { openTick: opponents.length ? Math.min(...opponents.map((s) => s.tick)) : startTick, deadlineTick: check.deadlineTick };
  }
  return { openTick: startTick, deadlineTick: check.kind === "post" ? check.beforeTick : startTick + ATTEMPT_TICKS };
}

export interface DrillScript { drillId: string; cast: DrillCast; opponents: ScheduledAction[]; coach: ScheduledAction[]; wrong: ScheduledAction[] }

/** Catalog checks use authoring labels; live evidence uses the cast's stable session ids. */
export function clientDrillCheck(check: DrillCheck, cast: DrillCast): DrillCheck {
  if (check.kind !== "ally") return check;
  const target = cast.labels[check.target];
  if (!target || !/^p[1-9]\d*$/.test(target) || !cast.clients[check.target]) return fail("unknown alliance target");
  return { ...check, target };
}

/** Build-time only: rename before replay so names are also embedded in the checkpoint. */
export async function buildDrillClient(source: PreparedBoard, script: DrillScript, check: DrillCheck, snapshotFormat: string) {
  const board = structuredClone(source);
  if (script.drillId !== board.id) fail("script does not match board");
  const record = board.record as { info: unknown };
  const start = parseStart(record.info);
  if (!start || !start.players.some((p) => p.clientID === board.ownClientId)) return fail("invalid board players");
  const names = opponentNames(board.id, start.players.length - 1);
  let n = 0;
  for (const p of start.players) p.username = p.clientID === board.ownClientId ? "You" : names[n++]!;
  record.info = { ...(record.info as Record<string, unknown>), ...start };
  const session = await openDrill(board);
  const snapshot = session.checkpoint();
  const runner = (session as unknown as { runner: Runner }).runner;
  const clientCheck = clientDrillCheck(check, script.cast);
  if (check.kind === "ally" && clientCheck.kind === "ally") {
    const target = runner.game.playerByClientID(script.cast.clients[check.target]!);
    if (!target || `p${target.smallID()}` !== clientCheck.target) return fail("alliance target does not match the snapshot");
  }
  const clients = Object.fromEntries(Object.entries(script.cast.labels).map(([label, actor]) => [actor, script.cast.clients[label]]));
  const intents = (actions: readonly ScheduledAction[]): IntentAt[] => actions.flatMap((s) => {
    if (!tick(s.tick) || s.tick < board.startTick || !clients[s.actor]) return fail("invalid scheduled actor or tick");
    const intent = intentFor(runner, s.action);
    if (!intent) {
      if (s.action.kind === "wait") return [];
      return fail("action has no intent");
    }
    return [{ turn: s.tick - board.startTick, intent: { ...intent, clientID: clients[s.actor] } }];
  });
  const data = validateDrillClient({ drillId: board.id, engineCommit: board.engineCommit, snapshotFormat,
    startTick: board.startTick, ownClientId: board.ownClientId, gameStartInfo: start,
    opponents: intents(script.opponents), coach: intents(script.coach), check: clientCheck, window: drillWindow(clientCheck, board.startTick, script.opponents) });
  // Verify the exact checkpoint that will be shipped, including its restored player names.
  await session.restore(board.startTick, snapshot);
  const restored = (session as unknown as { runner: Runner }).runner;
  const playerNames = start.players.map((p) => restored.game.playerByClientID(p.clientID!)!.name());
  return { data, json: JSON.stringify(data, null, 1) + "\n", snapshot, startTick: session.frame().tick,
    unitTypes: session.frame().units.map((u) => u.kind), ownName: playerNames[start.players.findIndex((p) => p.clientID === board.ownClientId)],
    opponentNames: playerNames.filter((_, i) => start.players[i]!.clientID !== board.ownClientId) };
}
