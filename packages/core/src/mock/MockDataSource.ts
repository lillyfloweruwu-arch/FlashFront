import type { DataSource } from "../datasource";
import type { GameEventKind, GameSnapshot, PlayerSummary } from "../types";
import { buildingTypes, makeHistory } from "./fixtures";
import { buildCost, GOLD_PER_TICK, maxTroops, TICKS_PER_SECOND, troopGrowthPerSec, troopGrowthPerTick } from "../mechanics";
import { seededRandom } from "./random";
import { GoalTracker } from "../habits";

export type MockSpeed = 1 | 5 | 20;
export interface MockOptions { seed?: number; speed?: MockSpeed; }
const names = ["Northstar", "Cobalt", "Atlas", "Juniper", "Vesper", "Kestrel", "Solstice", "Meridian", "Rook", "Tundra", "Orbit", "Sable", "Drift"];
// Territory colors are data, not UI theme tokens.
const colors = ["#2DE2FF", "#5AA9FF", "#D7A4EF", "#D6BD76", "#6DC7A2", "#D98294"];

export class MockDataSource implements DataSource {
  readonly name = "mock";
  private outgoingUntil = -1;
  private readonly random: () => number;
  private readonly history: ReturnType<typeof makeHistory>;
  private readonly listeners = new Set<(snapshot: GameSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private speed: MockSpeed;
  private emissionTicks = 0;
  private readonly state: GameSnapshot;
  private readonly practice = new GoalTracker("under70");

  constructor({ seed = 42, speed = 1 }: MockOptions = {}) {
    seed = Number.isFinite(seed) ? Math.trunc(seed) : 42;
    this.speed = speed;
    this.random = seededRandom(seed);
    this.history = makeHistory(seed);
    const players: PlayerSummary[] = Array.from({ length: 40 }, (_, i) => ({
      id: i === 0 ? "self" : `player-${i}`, name: i === 0 ? "Ember" : `${names[(i - 1) % names.length]}${i > 13 ? ` ${Math.ceil(i / 13)}` : ""}`,
      ...(i === 0 ? { clanTag: "FF", flag: "US" } : {}), color: colors[i % colors.length]!,
      isAlive: true, tilesOwnedPct: i === 0 ? 0.1 : 0.3 + this.random() * 0.4, troops: 1500, gold: 2500,
    }));
    this.state = {
      gameId: `live-${seed}`, map: "Dyslexdria", mode: "FFA", tick: 0, ticksPerSecond: TICKS_PER_SECOND,
      elapsedSec: 0, winTargetPct: 80, phase: "spawn", players,
      practiceGoal: this.practice.progress(),
      self: { id: "self", troops: 1500, maxTroops: maxTroops(20, 0), troopGrowthPerSec: troopGrowthPerSec(1500, maxTroops(20, 0)), gold: 2500, goldPerSec: GOLD_PER_TICK * TICKS_PER_SECOND, attackRatio: 0.3, tilesOwned: 20, tilesOwnedPct: 0.1, rank: 40, cityLevels: 0, portLevels: 0, factoryLevels: 0, defensePosts: 0, samLaunchers: 0, incomingAttacks: [], alliances: [], buildings: buildingTypes.map(type => ({ type, count: 0, nextCost: buildCost(type, 0) })) },
      events: [{ id: "event-0", tick: 0, kind: "info", text: "Spawn selected." }],
    };
    Object.assign(this.state.self!, { goldEarned: 0, tradeGold: 0, trainGold: 0, piracyGold: 0, readyMissiles: 0 });
  }

  setSpeed(speed: MockSpeed): void { this.speed = speed; }
  getSnapshot(): GameSnapshot { return structuredClone(this.state); }
  subscribeGame(cb: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.getSnapshot());
    if (!this.timer) this.timer = setInterval(() => {
      for (let i = 0; i < this.speed; i++) this.step();
      // One emission every 300ms (3.33Hz); game simulation remains exactly 10 ticks/s at 1x.
      if (++this.emissionTicks >= 3) {
        this.emissionTicks = 0;
        for (const listener of this.listeners) listener(this.getSnapshot());
      }
    }, 100);
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) { clearInterval(this.timer); this.timer = undefined; this.emissionTicks = 0; }
    };
  }

  private event(kind: GameEventKind, text: string, playerId?: string): void {
    this.state.events.push({ id: `event-${this.state.tick}-${kind}`, tick: this.state.tick, kind, text, ...(playerId ? { playerId } : {}) });
    this.state.events = this.state.events.slice(-50);
  }

  private step(): void {
    const s = this.state;
    const self = s.self!;
    if (s.phase === "ended") return;
    s.tick++;
    const t = s.elapsedSec = s.tick / TICKS_PER_SECOND;
    const phase = t < 5 ? "spawn" : "playing";
    // Events belong to the phase that produced them, like the live feed: spawn reports end with spawn.
    if (phase !== s.phase) s.events = [];
    s.phase = phase;
    const dip = Math.max(0, Math.sin(t / 29)) * Math.min(1.5, t / 130);
    self.tilesOwnedPct = Math.max(0.1, Math.min(31, 0.1 + t / 30 - dip));
    self.tilesOwned = Math.round(self.tilesOwnedPct * 200);
    self.maxTroops = maxTroops(self.tilesOwned, self.cityLevels);
    self.troops = Math.min(self.maxTroops, self.troops + troopGrowthPerTick(self.troops, self.maxTroops));
    self.goldPerSec = GOLD_PER_TICK * TICKS_PER_SECOND;
    self.gold += GOLD_PER_TICK;
    self.goldEarned = (self.goldEarned ?? 0) + GOLD_PER_TICK;
    if (s.tick % 600 === 0) {
      const income = 80_000 + Math.floor(this.random() * 40_000);
      self.gold += income;
      self.tradeGold = (self.tradeGold ?? 0) + income;
      self.goldEarned += income;
      this.event("info", `Trade delivered ${Math.round(income / 1000)}K gold.`);
    }
    // Scripted visible decisions recreate the playtest arc; never drive a real game.
    if ((s.tick % 900 === 0 && (t < 330 || t >= 480)) || s.tick === 4800) {
      const candidates = self.buildings.filter(b => b.nextCost <= self.gold && (t >= 480 || b.type !== "City"));
      const building = s.tick === 4800 ? candidates.find(b => b.type === "City") : candidates[Math.floor(this.random() * candidates.length)];
      if (building) {
        self.gold -= building.nextCost; building.count++;
        this.event("info", `${building.type.replace(/([a-z])([A-Z])/g, "$1 $2")} completed.`);
      }
    }
    // Modest expansion keeps troops near productive levels until gold/troops are hoarded.
    if (t < 330 && s.tick % 200 === 0 && self.troops > self.maxTroops * 0.5) {
      self.troops -= Math.floor(self.troops * self.attackRatio); this.outgoingUntil = s.tick + 80;
    }
    self.outgoingAttacks = s.tick < this.outgoingUntil ? 1 : 0;
    if (s.tick === 4400) self.attackRatio = 0.8;
    if (s.tick === 4500) {
      self.troops -= Math.floor(self.troops * self.attackRatio); this.outgoingUntil = s.tick + 80;
      this.event("info", "Large push: 80% of troops sent.");
    }
    if (s.tick === 4540) {
      self.incomingAttacks = [{ from: "RetroCityUKF", troops: 130_000 }];
      this.event("incomingAttack", "Incoming 13.0K from RetroCityUKF", "player-2");
    }
    if (s.tick === 4700) {
      self.troops = Math.max(0, self.troops - 130_000);
      self.incomingAttacks = [];
      self.attackRatio = 0.3;
    }
    if (s.tick % 2400 === 1200) {
      const ally = s.players.find(p => p.id !== "self" && p.isAlive && !p.isAlly);
      if (ally) { self.alliances.push({ with: ally.id, expiresAtTick: s.tick + 1800 }); ally.isAlly = true; this.event("allianceRequest", `${ally.name}: alliance formed (mock).`, ally.id); }
    }
    self.alliances = self.alliances.filter(a => {
      if (a.expiresAtTick === undefined || a.expiresAtTick > s.tick) return true;
      const player = s.players.find(p => p.id === a.with)!;
      player.isAlly = false; this.event("allianceExpired", `Alliance with ${player.name} expired.`, player.id);
      return false;
    });
    if (s.tick > 1000 && s.tick % 280 === 0) {
      const victim = [...s.players].reverse().find(p => p.id !== "self" && p.isAlive && !p.isAlly);
      if (victim) { victim.isAlive = false; this.event("playerEliminated", `${victim.name} was eliminated.`, victim.id); }
    }
    if (s.tick === 4200 || s.tick === 7200) this.event("incomingNuke", "Nuclear launch warning.");
    if (s.tick === 4260) { const b = self.buildings.find(b => b.count > 0); if (b) { b.count--; this.event("buildingDestroyed", `${b.type} destroyed by the strike.`); } }
    // In this mock every building is level one, so counts equal level sums.
    const count = (type: string) => self.buildings.find(b => b.type === type)!.count;
    self.cityLevels = count("City"); self.portLevels = count("Port"); self.factoryLevels = count("Factory");
    self.defensePosts = count("DefensePost"); self.samLaunchers = count("SAMLauncher");
    for (const building of self.buildings) {
      building.nextCost = buildCost(building.type, building.type === "Port" || building.type === "Factory" ? self.portLevels + self.factoryLevels : building.count);
    }
    self.maxTroops = maxTroops(self.tilesOwned, self.cityLevels);
    self.troops = Math.min(self.troops, self.maxTroops);
    self.troopGrowthPerSec = troopGrowthPerSec(self.troops, self.maxTroops);
    const opponents = s.players.filter(p => p.id !== "self" && p.isAlive);
    const totalWeight = opponents.reduce((sum, p) => sum + 1 + Number(p.id.split("-")[1]) % 7, 0);
    for (const player of s.players) {
      if (player.id === "self") { player.tilesOwnedPct = self.tilesOwnedPct; player.troops = self.troops; player.gold = self.gold; }
      else {
        player.tilesOwnedPct = player.isAlive ? (Math.min(98, 20 + t / 9) - self.tilesOwnedPct) * (1 + Number(player.id.split("-")[1]) % 7) / totalWeight : 0;
        player.troops = player.isAlive ? Math.round(player.tilesOwnedPct * 35000) : 0;
        player.gold = player.isAlive ? Math.round(2500 + t * 90) : 0;
      }
    }
    self.rank = 1 + opponents.filter(p => p.tilesOwnedPct > self.tilesOwnedPct).length;
    this.practice.observe(t, s.phase, self.troops / self.maxTroops, self.portLevels);
    s.practiceGoal = this.practice.progress(s.tick === 9000, s.tick === 9000);
    if (s.tick === 9000) { s.phase = "ended"; this.event("info", "Mock match complete."); }
  }

  async getLobbies() { return [
    { id: "lobby-1", map: "Dyslexdria", mode: "FFA", players: 34, maxPlayers: 40, startsInSec: Math.max(0, 90 - Math.floor(this.state.elapsedSec % 120)) },
    { id: "lobby-2", map: "Europe", mode: "Teams", teamsLabel: "20 teams of 3", players: 48, maxPlayers: 60, startsInSec: 120 },
    { id: "lobby-3", map: "Archipelago", mode: "Custom", players: 12, maxPlayers: 20, startsInSec: 180, custom: true },
  ]; }
  async getProfile(nameOrId: string) { return ["self", "ember"].includes(nameOrId.toLowerCase()) ? structuredClone(this.history.profile) : null; }
  async getMatches(publicId: string, limit = 20) { return publicId === "self" ? structuredClone(this.history.matches.slice(0, Math.max(0, Number.isFinite(limit) ? limit : 20))) : []; }
  async getMatch(gameId: string) { return structuredClone(this.history.matches.find(m => m.gameId === gameId) ?? null); }
}
