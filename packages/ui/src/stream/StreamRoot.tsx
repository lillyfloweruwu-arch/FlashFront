import { useEffect } from "react";
import type { GameSnapshot, LobbyInfo, MatchSummary, PlayerProfile, RecordedResult } from "@flashfront/core";
import { PlayerCard } from "./PlayerCard";
import { LiveStatsStrip } from "./LiveStatsStrip";
import { TopLeaderboard } from "./TopLeaderboard";
import { LobbyCard } from "./LobbyCard";
import { ResultCard } from "./ResultCard";
import { StreamWidget } from "./StreamWidget";
export type StreamSnapshot = Pick<GameSnapshot, "gameId" | "map" | "mode" | "phase" | "elapsedSec" | "observer"> & {
  self: (Pick<NonNullable<GameSnapshot["self"]>, "id" | "tilesOwnedPct" | "rank"> & { troops: number | null; gold: number | null }) | null;
  /** Land only: other players' troops and gold never reach a stream (fair play). */
  players: Pick<GameSnapshot["players"][number], "id" | "name" | "clanTag" | "flag" | "color" | "isAlive" | "tilesOwnedPct">[];
};
export const widgetNames = ["card", "stats", "top", "lobby", "result"] as const;
export function parseStreamOptions(search: string) {
  const params = new URLSearchParams(search);
  const rawScale = Number(params.get("scale") ?? 1);
  const anchor = params.get("anchor") ?? "tl";
  return { widgets: (params.get("widgets") ?? widgetNames.join(",")).split(",").filter((v): v is typeof widgetNames[number] => widgetNames.some(name => name === v)), scale: Number.isFinite(rawScale) ? Math.min(3, Math.max(0.25, rawScale)) : 1, anchor: ["tl", "tr", "bl", "br"].includes(anchor) ? anchor : "tl" };
}
export interface StreamRootProps { snapshot: StreamSnapshot; profile: PlayerProfile; lobby?: LobbyInfo; result?: MatchSummary | RecordedResult; search?: string; preview?: boolean; placeholders?: boolean; lobbyPlaceholder?: boolean; session?: { wins: number; losses: number }; }
export function StreamRoot({ snapshot, profile, lobby, result, search, preview = false, placeholders = false, lobbyPlaceholder = false, session = { wins: 0, losses: 0 } }: StreamRootProps) {
  const options = parseStreamOptions(search ?? (typeof window === "undefined" ? "" : window.location.hash.split("?")[1] ?? window.location.search));
  useEffect(() => {
    if (preview) return;
    document.documentElement.classList.add("obs-transparent"); document.body.classList.add("obs-transparent");
    return () => { document.documentElement.classList.remove("obs-transparent"); document.body.classList.remove("obs-transparent"); };
  }, [preview]);
  // A widget with nothing to show is absent, so it never leaves an empty grid cell.
  const inMatch = snapshot.self !== null;
  const widgets = {
    card: <PlayerCard profile={profile} flag={snapshot.players.find(p => p.id === profile.publicId)?.flag} {...session} />,
    stats: inMatch || snapshot.observer ? <LiveStatsStrip snapshot={snapshot} /> : null,
    top: snapshot.players.some(p => p.isAlive) ? <TopLeaderboard snapshot={snapshot} /> : null,
    lobby: lobby ? <LobbyCard lobby={lobby} /> : placeholders || (lobbyPlaceholder && !inMatch) ? <StreamWidget className="stream-placeholder" title="Lobby" icon="clock"><p className="muted">Lobby details are not available yet.</p></StreamWidget> : null,
    result: result ? <ResultCard match={result} /> : placeholders ? <StreamWidget className="stream-placeholder" title="Match result" icon="matches"><p className="muted">Results are not available yet.</p></StreamWidget> : null,
  };
  const shown = [...new Set(options.widgets)].filter(name => widgets[name] !== null);
  return <div className={`stream-root ${preview ? "stream-preview" : "stream-obs"} anchor-${options.anchor}`} style={{ transform: `scale(${options.scale})` }}>{shown.map(name => <div key={name} data-widget={name}>{widgets[name]}</div>)}</div>;
}
