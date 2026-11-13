import { REVIEW_COMMITS, V0355_CHANGED_MAPS, V0355_COMMIT, type MapBytes } from "@flashfront/training-engine/protocol";
import type { ReviewLoad } from "../review-types";
import { expandTurns, isKnownMap, newRunner, parseStart, parseTurn, restoreRunner, type GameStartInfo, type Turn } from "../../../../packages/training-engine/src/upstream";

/** A review-only engine cache. No branch edits, opponent filtering, or drill judging. */
export class ReplaySnapshots {
  private snapshots = new Map<number, Uint8Array>();
  private start?: GameStartInfo;
  private turns?: Turn[];
  private commit = "";
  private endTick = 0;
  constructor(private readonly record: unknown, private readonly ownClientId: string, private readonly map: MapBytes) {}
  async seek(tick: number): Promise<ReviewLoad> {
    const fail = (reason: "invalidRecord" | "unsupportedVersion" | "missingMap" | "desync"): ReviewLoad => ({ status: "unavailable", reason });
    try {
      if (!this.start) {
        const raw = this.record as { gitCommit?: string; info?: { num_turns?: number }; turns?: unknown[] } | null;
        if (!raw || typeof raw.gitCommit !== "string" || !Array.isArray(raw.turns)) return fail("invalidRecord");
        if (!REVIEW_COMMITS.includes(raw.gitCommit)) return fail("unsupportedVersion");
        const start = parseStart(raw.info);
        const endTick = raw.info?.num_turns;
        if (!start || !Number.isSafeInteger(endTick) || endTick! < 0 || !start.players.some(p => p.clientID === this.ownClientId)) return fail("invalidRecord");
        if (raw.gitCommit === V0355_COMMIT && V0355_CHANGED_MAPS.includes(String(start.config.gameMap).toLowerCase().replace(/[^a-z]/g, ""))) return fail("unsupportedVersion");
        if (start.config.gameMap !== this.map.mapId || start.config.gameMapSize !== this.map.mapSize || !isKnownMap(this.map.mapId, this.map.mapSize)) return fail("missingMap");
        const parsed = raw.turns.map(parseTurn);
        if (parsed.some(t => t === null)) return fail("invalidRecord");
        const turns = expandTurns(parsed as Turn[], endTick!);
        if (turns.length !== endTick) return fail("invalidRecord");
        this.start = start; this.turns = turns; this.commit = raw.gitCommit; this.endTick = endTick!;
      }
      if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.endTick) return fail("invalidRecord");
      const start = this.start;
      let error = false;
      const hashes = new Map<number, number>();
      const hash = (at: number, value: number) => hashes.set(at, value);
      const onError = () => { error = true; };
      if (!this.snapshots.has(0)) {
        const initial = await newRunner(start, this.map, hash, onError);
        this.snapshots.set(0, initial.snapshot(this.commit));
      }
      const nearest = Math.max(...[...this.snapshots.keys()].filter(at => at <= tick));
      const runner = await restoreRunner(start, this.snapshots.get(nearest)!, this.map, hash, onError);
      for (let at = nearest; at < tick; at++) {
        if (at % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        runner.addTurn(this.turns![at]!);
        if (!runner.executeNextTick() || error) return fail("desync");
        for (const [atHash, value] of hashes) {
          const recorded = this.turns![atHash]?.hash;
          if (recorded != null && recorded !== value) return fail("desync");
        }
        hashes.clear();
        if ((at + 1) % 600 === 0) this.remember(at + 1, runner.snapshot(this.commit));
      }
      const snapshot = runner.snapshot(this.commit);
      this.remember(tick, snapshot);
      return { status: "ready", value: { snapshot, data: {
        engineCommit: this.commit, snapshotFormat: "1", startTick: tick, endTick: this.endTick,
        ownClientId: this.ownClientId, gameStartInfo: start, coach: [],
        opponents: this.turns!.slice(tick).flatMap(t => t.intents.map(intent => ({ turn: t.turnNumber - tick, intent: { ...intent } }))),
      } } };
    } catch { return fail("invalidRecord"); }
  }
  private remember(tick: number, bytes: Uint8Array): void {
    this.snapshots.set(tick, bytes);
    let total = [...this.snapshots.values()].reduce((sum, b) => sum + b.byteLength, 0);
    for (const [at, value] of this.snapshots) {
      if (total <= 64 * 1024 * 1024) break;
      if (at !== 0 && at !== tick) { this.snapshots.delete(at); total -= value.byteLength; }
    }
  }
}
