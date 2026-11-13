// Bounded render history for the 1.5-second rewind (sub-plan E Task 5). It keeps an undo log of
// ownership changes between captures plus each capture's small unit/player lists, never full-map
// copies per capture. The start's engine checkpoint lives in the same budget and is never evicted.
import type { BoardFrame, EngineCheckpoint } from "./contracts";

export const HISTORY_BUDGET_BYTES = 64 * 1024 * 1024;
export const CAPTURE_EVERY_TICKS = 5;

type Meta = Pick<BoardFrame, "tick" | "units" | "players" | "requests" | "alliances">;
interface Entry { meta: Meta; idx: Uint32Array; prev: Uint16Array; bytes: number }
/** One rewind step: set `values` at `idx` on the previous frame's owners to get this frame's. */
export interface FramePatch { meta: Meta; idx: Uint32Array; values: Uint16Array }

const metaBytes = (m: Meta) => 64 + 48 * (m.units.length + m.players.length + m.requests.length + m.alliances.length);

export class SnapshotHistory {
  private startCheckpoint: EngineCheckpoint | null = null;
  private entries: Entry[] = [];
  private latest: Uint16Array | null = null;
  private shape: Pick<BoardFrame, "width" | "height" | "terrain"> | null = null;
  bytesUsed = 0;

  constructor(readonly budget = HISTORY_BUDGET_BYTES) {}

  get start(): EngineCheckpoint | null { return this.startCheckpoint; }
  get latestTick(): number | null { return this.entries.at(-1)?.meta.tick ?? null; }

  /** Begins a history at the start board. Fails when even the start does not fit. */
  begin(checkpoint: EngineCheckpoint, frame: BoardFrame): "historyLimit" | undefined {
    this.clear();
    const meta = pick(frame);
    const bytes = checkpoint.bytes.byteLength + frame.owners.byteLength + metaBytes(meta);
    if (bytes > this.budget) return "historyLimit";
    this.startCheckpoint = checkpoint;
    this.latest = frame.owners.slice();
    this.shape = { width: frame.width, height: frame.height, terrain: frame.terrain };
    this.entries = [{ meta, idx: new Uint32Array(0), prev: new Uint16Array(0), bytes: metaBytes(meta) }];
    this.bytesUsed = bytes;
    return undefined;
  }

  /** Adds a capture; over budget it keeps everything already held and reports historyLimit. */
  capture(frame: BoardFrame): "historyLimit" | undefined {
    if (!this.latest || frame.owners.length !== this.latest.length) return "historyLimit";
    const changed: number[] = [];
    for (let i = 0; i < frame.owners.length; i++) if (frame.owners[i] !== this.latest[i]) changed.push(i);
    const meta = pick(frame);
    const bytes = changed.length * 6 + metaBytes(meta);
    if (this.bytesUsed + bytes > this.budget) return "historyLimit";
    const idx = Uint32Array.from(changed), prev = new Uint16Array(changed.length);
    for (let k = 0; k < changed.length; k++) { prev[k] = this.latest[changed[k]!]!; this.latest[changed[k]!] = frame.owners[changed[k]!]!; }
    this.entries.push({ meta, idx, prev, bytes });
    this.bytesUsed += bytes;
    return undefined;
  }

  /** The latest capture as a full frame, then patches stepping back to `toTick` (inclusive). */
  reversePatches(toTick: number): { first: BoardFrame; patches: FramePatch[] } | null {
    const from = this.entries.findIndex((e) => e.meta.tick === toTick);
    if (from < 0 || !this.latest || !this.shape) return null;
    const last = this.entries.at(-1)!;
    const first: BoardFrame = { ...this.shape, ...last.meta, owners: this.latest.slice() };
    const patches: FramePatch[] = [];
    for (let i = this.entries.length - 1; i > from; i--) {
      patches.push({ meta: this.entries[i - 1]!.meta, idx: this.entries[i]!.idx, values: this.entries[i]!.prev });
    }
    return { first, patches };
  }

  /** Full frames from the latest capture back to `toTick`; for tests and small boards. */
  reverseFrames(toTick: number): readonly BoardFrame[] {
    const r = this.reversePatches(toTick);
    if (!r) return [];
    const frames = [r.first];
    let owners = r.first.owners;
    for (const p of r.patches) {
      owners = owners.slice();
      for (let k = 0; k < p.idx.length; k++) owners[p.idx[k]!] = p.values[k]!;
      frames.push({ ...r.first, ...p.meta, owners });
    }
    return frames;
  }

  /** Drops captures after `tick`, keeping the start. Used when a rewind lands. */
  truncate(tick: number): void {
    while (this.entries.length > 1 && this.entries.at(-1)!.meta.tick > tick) {
      const e = this.entries.pop()!;
      for (let k = 0; k < e.idx.length; k++) this.latest![e.idx[k]!] = e.prev[k]!;
      this.bytesUsed -= e.bytes;
    }
  }

  clear(): void {
    this.startCheckpoint = null;
    this.entries = [];
    this.latest = null;
    this.shape = null;
    this.bytesUsed = 0;
  }
}

function pick(f: BoardFrame): Meta {
  return { tick: f.tick, units: f.units, players: f.players, requests: f.requests, alliances: f.alliances };
}

/** Which of `count` reverse steps to paint so a rewind lasts `durationMs` at no more than `fps`. */
export function paintPlan(count: number, durationMs: number, fps: number): number[] {
  const slots = Math.max(1, Math.floor((durationMs / 1000) * fps));
  if (count <= slots) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: slots }, (_, i) => Math.round(((i + 1) * (count - 1)) / slots));
}
