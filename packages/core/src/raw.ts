/** Read-only adapter payload; unavailable getters remain absent. */
export interface RawExtract {
  spawnHeat?: import("./types").SpawnHeat;
  inGame: boolean; visible: boolean; tick?: number; gameId?: string;
  /** Land tiles on the map (g.numLandTiles()): own land % when the leaderboard shows no % column. */
  landTiles?: number;
  /** True in the replay viewer (config isReplay or #replay-viewer= hash). */
  replay?: boolean;
  /** The game window's own position (screenX/screenY/outerWidth/outerHeight, DIP). hidden = minimized/occluded. */
  window?: { x: number; y: number; width: number; height: number; hidden: boolean };
  /** From g.config().gameConfig(): e.g. map "World", mode "Free For All", type "Singleplayer". */
  game?: { map?: string; mapSize?: string; mode?: string; type?: string; difficulty?: string;
    /** Set only in ranked matches ("1v1" | "2v2" | "ffa" | "clanwars"); gameType is then "Public". */
    rankedType?: string; teams?: string; cheats?: boolean };
  inSpawnPhase?: boolean; gameOver?: boolean; gameVersion?: string;
  me?: {
    clientId?: string; profilePublicId?: string;
    name?: string; displayName?: string; clanTag?: string; troops?: number; gold?: string;
    goldEarned?: string; tradeGold?: string; trainGold?: string; piracyGold?: string; readyMissiles?: number;
    tiles?: number; alive?: boolean; maxTroops?: number; troopRatePerTick?: number; attackRatio?: number;
    incoming?: { from: string; troops: number }[]; outgoingCount?: number;
    alliances?: { with: string; expiresInTicks?: number; renewRequested?: boolean }[];
    cityLevels?: number; portLevels?: number; factoryLevels?: number;
    defensePosts?: number; samLaunchers?: number; silos?: number;
  };
  leaderboard?: { rank: number; name: string; landPct: number; gold: string; troops: string; isMe: boolean }[];
}
