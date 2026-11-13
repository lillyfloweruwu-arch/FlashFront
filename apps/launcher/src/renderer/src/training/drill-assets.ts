// Loads one prepared drill's board and scripts, bundled with the app (no remote assets), and checks each
// file against the catalogue's SHA-256 before the engine sees it. Assets are split chunks that only
// Training loads.
import { DRILL_ASSET_HASHES, DRILL_CATALOG, type PreparedDrill } from "@flashfront/core";
import type { PreparedBoard, ScheduledAction } from "@flashfront/training-engine/contracts";

export interface DrillCast { labels: Record<string, string>; clients: Record<string, string> }
export interface LoadedDrill { drill: PreparedDrill; board: PreparedBoard; cast: DrillCast; coach: readonly ScheduledAction[]; wrong: readonly ScheduledAction[]; opponents: readonly ScheduledAction[] }
type RawLoader = () => Promise<string>;

const boards = import.meta.glob<string>("../../../../resources/training/drills/boards/*.json", { query: "?raw", import: "default" });
const scripts = import.meta.glob<string>("../../../../resources/training/drills/scripts/*.json", { query: "?raw", import: "default" });
const find = (files: Record<string, RawLoader>, id: string) => Object.entries(files).find(([path]) => path.endsWith(`/${id}.json`))?.[1];

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loadPreparedDrill(id: string, sources: { boards: Record<string, RawLoader>; scripts: Record<string, RawLoader> } = { boards, scripts }): Promise<LoadedDrill> {
  const drill = DRILL_CATALOG.find((d) => d.id === id);
  const hashes = DRILL_ASSET_HASHES[id];
  const boardFile = drill && find(sources.boards, drill.boardId), scriptFile = drill && find(sources.scripts, drill.boardId);
  if (!drill || !hashes || !boardFile || !scriptFile) throw new Error(`Unknown drill ${id}`);
  const [boardText, scriptText] = await Promise.all([boardFile(), scriptFile()]);
  if ((await sha256(boardText)) !== hashes.board || (await sha256(scriptText)) !== hashes.script) throw new Error(`Drill ${id} assets do not match the catalogue`);
  const board = JSON.parse(boardText) as PreparedBoard;
  const script = JSON.parse(scriptText) as { drillId: string; cast: DrillCast; coach: ScheduledAction[]; wrong: ScheduledAction[]; opponents: ScheduledAction[] };
  if (board.id !== drill.boardId || script.drillId !== id) throw new Error(`Drill ${id} assets are mislabelled`);
  return { drill, board, cast: script.cast, coach: script.coach, wrong: script.wrong, opponents: script.opponents };
}
