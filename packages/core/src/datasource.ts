import type { GameSnapshot, LobbyInfo, MatchSummary, PlayerProfile } from "./types";

/** Read-only public game information. Adapters must never expose hidden information or send input. */
export interface DataSource {
  readonly name: string;
  subscribeGame(cb: (s: GameSnapshot) => void): () => void;
  getLobbies(): Promise<LobbyInfo[]>;
  getProfile(nameOrId: string): Promise<PlayerProfile | null>;
  getMatches(publicId: string, limit?: number): Promise<MatchSummary[]>;
  getMatch(gameId: string): Promise<MatchSummary | null>;
}
