import { FlashFrontMark } from "../icons";
import { formatDuration, type PlayerProfile } from "@flashfront/core";
import type { StreamSnapshot } from "./StreamRoot";
import { AnimatedNumber, integer, Wordmark } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function PlayerCard({ profile, flag, wins = 0, losses = 0, snapshot }: { profile: PlayerProfile; flag?: string; wins?: number; losses?: number; snapshot?: Pick<StreamSnapshot, "map" | "mode" | "elapsedSec"> }) {
  const session = <><span className="gain"><AnimatedNumber value={wins} format={integer} /> W</span><span className="muted"> / </span><AnimatedNumber value={losses} format={integer} /> L</>;
  return <StreamWidget className="player-card" title="Player" icon="profile">
    <div className="stream-brand"><FlashFrontMark size={24} /><Wordmark /></div>
    <div className="identity"><div className="avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</div><div><h2>{profile.clanTag && <span className="muted">[{profile.clanTag}] </span>}{profile.name}</h2>
      {(flag || profile.rankedTier) && <span className="label">{flag && <span className="flag" aria-label={`Country ${flag}`}>{flag} </span>}{profile.rankedTier}</span>}</div></div>
    {snapshot && <p className="stream-map-context">{snapshot.map} · {snapshot.mode} · {formatDuration(snapshot.elapsedSec)}</p>}
    {profile.rankedElo !== undefined
      ? <div className="spread"><strong className="elo"><AnimatedNumber value={profile.rankedElo} format={integer} /><small className="muted"> ELO</small></strong><span className="session">{session}<small className="muted">Session</small></span></div>
      : <p className="stream-oneline" data-elo-unavailable><span className="label">ELO unavailable</span><span className="session-inline"><span className="label">Session</span>{session}</span></p>}
  </StreamWidget>;
}
