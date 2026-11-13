export type PlayerId = string;

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  clanTag?: string;
  flag?: string;
  color: string;
  isAlive: boolean;
  isTeammate?: boolean;
  isAlly?: boolean;
  tilesOwnedPct: number;
  troops: number;
  gold: number;
}

export type BuildingType = "City" | "Port" | "DefensePost" | "MissileSilo" | "SAMLauncher" | "Factory";
export interface BuildingCount { type: BuildingType; count: number; nextCost: number; }
export interface AllianceRequest { from: PlayerId; name: string; atWar: boolean; landPct?: number }
export interface Alliance { with: PlayerId; name?: string; expiresAtTick?: number; formedAtTick?: number; /** A renewal request is pending (AllianceView.hasExtensionRequest). */ renewRequested?: boolean; }
export type GameEventKind = "incomingAttack" | "incomingNuke" | "allianceRequest" | "allianceExpired" | "betrayal" | "playerEliminated" | "buildingDestroyed" | "info";
export interface GameEvent { id: string; tick: number; kind: GameEventKind; text: string; playerId?: PlayerId; }

export interface SelfState {
  id: PlayerId;
  troops: number;
  maxTroops: number;
  troopGrowthPerSec: number;
  gold: number;
  goldPerSec: number;
  goldEarned?: number;
  tradeGold?: number;
  trainGold?: number;
  piracyGold?: number;
  readyMissiles?: number;
  attackRatio: number;
  /** Own outgoing attacks in progress (count only). */
  outgoingAttacks?: number;
  cityLevels: number;
  portLevels: number;
  factoryLevels: number;
  defensePosts: number;
  samLaunchers: number;
  incomingAttacks: { from: string; troops: number }[];
  tilesOwned: number;
  tilesOwnedPct: number;
  rank: number;
  buildings: BuildingCount[];
  alliances: Alliance[];
  allianceRequests?: AllianceRequest[];
}

export interface GameSnapshot {
  /** Ephemeral, spawn-phase positions and camera only; never recorded as match telemetry. */
  spawnHeat?: SpawnHeat;
  practiceGoal?: import("./habits").GoalProgress;
  gameId: string;
  map: string;
  mapSize?: "Normal" | "Compact";
  mode: "FFA" | "Teams" | "Ranked" | "Custom";
  teamsLabel?: string;
  tick: number;
  ticksPerSecond: number;
  elapsedSec: number;
  winTargetPct: number;
  self: SelfState | null;
  players: PlayerSummary[];
  events: GameEvent[];
  phase: "lobby" | "spawn" | "playing" | "ended";
  /** Not playing live: a replay, or spectating after elimination. FlashFront gives no live advice then. */
  observer?: "replay" | "spectating";
  /** Lobby has infinite gold/troops or instant build: rates and costs are not meaningful. */
  cheats?: boolean;
}

export interface SpawnPosition { x: number; y: number }
export interface SpawnCamera {
  scale: number; offsetX: number; offsetY: number; mapWidth: number; mapHeight: number;
  left: number; top: number; width: number; height: number; viewportWidth: number; viewportHeight: number;
}
export interface SpawnHeat {
  others: SpawnPosition[]; own?: SpawnPosition; camera?: SpawnCamera;
  /** Absent for singleplayer (no countdown) or unavailable timing. */
  remainingSec?: number;
}

export interface LobbyInfo {
  id: string; map: string; mode: string; teamsLabel?: string;
  players: number; maxPlayers: number; startsInSec: number; custom?: boolean;
}
export interface PlayerProfile {
  publicId: string; name: string; clanTag?: string;
  rankedElo?: number; rankedTier?: string;
  gamesPlayed: number; wins: number;
  eloHistory: { date: string; elo: number }[];
}
export interface MatchSummary {
  gameId: string; map: string; mode: string; startedAt: string; durationSec: number;
  placement: number; playerCount: number; won: boolean;
  peakTilesPct: number; peakTroops: number;
  buildings: Record<BuildingType, number>;
  timeline: { t: number; tilesPct: number; troops: number; gold: number }[];
  eloDelta?: number;
}
