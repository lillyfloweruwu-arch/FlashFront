import type { GameSnapshot, SelfState } from "./types";
import type { RecordedMatch } from "./recorder";
import { spotsFor } from "./spawn";
import { atGrowthCap } from "./attack";

export const DEFAULT_RESERVE_FLOOR = 35;
export function maxSendPercent(troops: number, max: number, floor = DEFAULT_RESERVE_FLOOR): number {
  if (!Number.isFinite(troops) || !Number.isFinite(max) || troops <= 0 || max <= 0) return 0;
  const percent = Number.isFinite(floor) ? Math.min(60, Math.max(20, floor)) : DEFAULT_RESERVE_FLOOR;
  return Math.floor(Math.max(0, Math.min(1, (troops - max * percent / 100) / troops)) * 100);
}
export function incomingAlarm(self: SelfState | null): number | undefined {
  if (!self) return undefined;
  const total = self.incomingAttacks.reduce((sum, a) => sum + (Number.isFinite(a.troops) ? Math.max(0, a.troops) : 0), 0);
  return total > 0 && total >= self.troops * 0.5 ? total : undefined;
}
export function allianceTone(seconds: number): "danger" | "warning" | "ally" {
  return seconds <= 15 ? "danger" : seconds <= 60 ? "warning" : "ally";
}
export function tradeTotal(self: Pick<SelfState, "tradeGold" | "trainGold">): number | undefined {
  return self.tradeGold === undefined || self.trainGold === undefined ? undefined : self.tradeGold + self.trainGold;
}
export function tradeShare(total: number | undefined, earned: number | undefined): number | undefined {
  return total === undefined || earned === undefined ? undefined : earned > 0 ? Math.min(1, Math.max(0, total / earned)) : 0;
}
export interface TradeStatus { last60?: number; ship60?: number; train60?: number; prev60?: number; share?: number; noIncome: boolean; }
/** Retains bounded own-counter deltas; game time, never wall time, defines the window. */
export class TradeMonitor {
  private id?: string;
  private lastTime = -1;
  private previous: { ship?: number; train?: number } = {};
  private portSince?: number;
  private deltas: { t: number; ship: number; train: number }[] = [];
  private current: TradeStatus = { noIncome: false };
  status(): TradeStatus { return { ...this.current }; }
  observe(snapshot: GameSnapshot): TradeStatus {
    const { gameId, elapsedSec: t, self } = snapshot;
    if (this.id !== gameId || t < this.lastTime || !self) {
      this.id = gameId; this.previous = {}; this.portSince = undefined; this.deltas = [];
    }
    this.lastTime = t;
    if (!self) { this.current = { noIncome: false }; return this.status(); }
    const total = tradeTotal(self);
    if (self.portLevels > 0 || self.factoryLevels > 0) this.portSince ??= t; else this.portSince = undefined;
    const delta = { t, ship: 0, train: 0 };
    for (const [key, value] of [["ship", self.tradeGold], ["train", self.trainGold]] as const) {
      const prev = this.previous[key];
      if (value === undefined || (prev !== undefined && value < prev)) {
        for (const d of this.deltas) d[key] = 0;
      } else if (prev !== undefined) delta[key] = value - prev;
      this.previous[key] = value;
    }
    if (delta.ship > 0 || delta.train > 0) {
      const last = this.deltas.at(-1);
      if (last?.t === t) { last.ship += delta.ship; last.train += delta.train; }
      else this.deltas.push(delta);
    }
    this.deltas = this.deltas.filter(d => d.t > t - 120);
    const recent = this.deltas.filter(d => d.t > t - 60);
    const ship60 = self.tradeGold === undefined ? undefined : recent.reduce((sum, d) => sum + d.ship, 0);
    const train60 = self.trainGold === undefined ? undefined : recent.reduce((sum, d) => sum + d.train, 0);
    this.current = { ship60, train60, last60: ship60 === undefined || train60 === undefined ? undefined : ship60 + train60,
      prev60: total === undefined ? undefined : this.deltas.filter(d => d.t <= t - 60).reduce((sum, d) => sum + d.ship + d.train, 0),
      share: tradeShare(total, self.goldEarned),
      noIncome: total === 0 && this.portSince !== undefined && t - this.portSince >= 60 };
    return this.status();
  }
}
export function openingItems(snapshot: GameSnapshot) {
  const self = snapshot.self;
  if (!self) return [];
  const item = (label: string, done: boolean, type?: "City" | "Port") => {
    const cost = type ? self.buildings.find(b => b.type === type)?.nextCost : 0;
    const seconds = cost === undefined ? undefined : cost <= self.gold ? 0 : self.goldPerSec > 0 ? (cost - self.gold) / self.goldPerSec : undefined;
    return { label, done, cost, seconds };
  };
  return [item("Ally a neighbour", self.alliances.length >= 1),
    ...(spotsFor(snapshot.map)?.hasOcean ? [item("Build a port", self.portLevels >= 1, "Port")] : []),
    item("Build a city", self.cityLevels >= 1, "City")];
}
export function openingVisible(snapshot: GameSnapshot): boolean {
  return snapshot.phase === "playing" && snapshot.elapsedSec < 300 && openingItems(snapshot).some(i => !i.done);
}

export const PRACTICE_GOALS = {
  under70: "Stay under 70% of max",
  port180: "Build a port before 3:00",
  reserve35: "Keep 35% after every push",
} as const;
export type PracticeGoal = keyof typeof PRACTICE_GOALS;
export interface GoalProgress { id: PracticeGoal; status: "pending" | "hit" | "miss" | "unknown"; }
export const isPracticeGoal = (value: unknown): value is PracticeGoal => typeof value === "string" && Object.hasOwn(PRACTICE_GOALS, value);
export function suggestedGoals(m: RecordedMatch): PracticeGoal[] {
  const goals: PracticeGoal[] = [];
  if (m.summary.timeInZone.wasting > 0) goals.push("under70");
  if (spotsFor(m.map)?.hasOcean && ((m.summary.openingComplete && m.summary.firstPortSec === undefined) || (m.summary.firstPortSec ?? 0) >= 180)) goals.push("port180");
  if (m.events.some(e => e.kind === "push" && e.fractionAfter < 0.35)) goals.push("reserve35");
  return goals;
}
export class GoalTracker {
  private failed = false;
  private portHit = false;
  private pushes = 0;
  private seen = false;
  private whole = true;
  private lastTime?: number;
  private time = 0;
  constructor(readonly id: PracticeGoal) {}
  invalidate() { this.whole = false; }
  observe(t: number, phase: GameSnapshot["phase"], fraction: number, ports: number | undefined, pushFraction?: number) {
    if (!this.seen) this.whole &&= t <= 20;
    if (this.lastTime !== undefined && t - this.lastTime > 5) this.whole = false;
    this.lastTime = t; this.time = t; this.seen = true;
    if (phase !== "spawn" && atGrowthCap(fraction) && this.id === "under70") this.failed = true;
    if (ports !== undefined && ports > 0 && t < 180) this.portHit = true;
    if (this.id === "port180" && ports === undefined) this.whole = false;
    if (pushFraction !== undefined) { this.pushes++; if (this.id === "reserve35" && pushFraction < 0.35) this.failed = true; }
  }
  progress(finished = false, completed = false): GoalProgress {
    let status: GoalProgress["status"] = "pending";
    if (this.failed) status = "miss";
    else if (this.id === "port180" && this.portHit) status = "hit";
    else if (this.id === "port180" && this.time >= 180 && this.whole) status = "miss";
    else if (finished) status = this.seen && this.whole && completed && this.id !== "port180" && (this.id !== "reserve35" || this.pushes > 0) ? "hit" : "unknown";
    return { id: this.id, status };
  }
}
