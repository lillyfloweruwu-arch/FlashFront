import type { RecordDrillInput, RecordDrillResult } from "../main/record-drill";
/** Engine imports are lazy: ordinary launcher startup never loads the Training engine. */
export async function buildRecordDrill(input: RecordDrillInput): Promise<RecordDrillResult> {
  try {
    const [{ BoardSession }, { parseStart, parseTurn }, { validateDrillClient }] = await Promise.all([
      import("../../../../packages/training-engine/src/rebuild"),
      import("../../../../packages/training-engine/src/upstream"),
      import("../../../../packages/training-engine/src/drill-client-data"),
    ]);
    const { record, ownClientId, tick, mistake, map, check } = input;
    const result = await BoardSession.rebuild("record-retry", { kind: "record", record, ownClientId, startTick: tick }, map,
      { cancelled: () => false, yieldNow: () => new Promise(resolve => setTimeout(resolve, 0)) });
    if (result.status !== "ready") return result;
    const session = result.value;
    if (session.handle.endTick - tick < 300) return { status: "unavailable", reason: "invalidRecord" };
    const raw = record as { gitCommit: string; info: unknown; turns: unknown[] };
    const start = parseStart(raw.info)!;
    const opponents = raw.turns.flatMap(value => {
      const turn = parseTurn(value)!;
      if (turn.turnNumber < tick || turn.turnNumber >= session.handle.endTick) return [];
      return turn.intents.filter(i => i.clientID !== ownClientId || i.type === "mark_disconnected" || i.type === "toggle_pause")
        .map(intent => ({ turn: turn.turnNumber - tick, intent: { ...intent } }));
    });
    const data = validateDrillClient({ drillId: "retry-00", engineCommit: raw.gitCommit, snapshotFormat: "1",
      startTick: tick, ownClientId, gameStartInfo: start, opponents, coach: [], check,
      window: { openTick: tick, deadlineTick: session.handle.endTick } });
    return { status: "ready", value: { data, snapshot: session.checkpoint() } };
  } catch { return { status: "unavailable", reason: "invalidRecord" }; }
}

