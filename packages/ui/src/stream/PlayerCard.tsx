import { FlashFrontMark } from "../icons";
import type { PlayerProfile } from "@flashfront/core";
import { AnimatedNumber, integer, Wordmark } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function PlayerCard({ profile, flag, wins = 0, losses = 0 }: { profile: PlayerProfile; flag?: string; wins?: number; losses?: number }) {
  const session = <><span className="gain"><AnimatedNumber value={wins} format={integer} /> W</span><span className="muted"> / </span><AnimatedNumber value={losses} format={integer} /> L</>;
  return <StreamWidget className="player-card" title="Player" icon="profile">
    <div className="stream-brand"><FlashFrontMark size={24} /><Wordmark /></div>
    <div className="identity"><div className="avatar" aria-hidden="true">{profile.name.slice(0, 1)}</div><div><h2>{profile.clanTag && <span className="muted">[{profile.clanTag}] </span>}{profile.name}</h2>
      {(flag || profile.rankedTier) && <span className="label">{flag && <span className="flag" aria-label={`Country ${flag}`}>{flag} </span>}{profile.rankedTier}</span>}</div></div>
    {profile.rankedElo !== undefined
      ? <div className="spread"><strong className="elo"><AnimatedNumber value={profile.rankedElo} format={integer} /><small className="muted"> ELO</small></strong><span className="session">{session}<small className="muted">Session</small></span></div>
      : <p className="stream-oneline" data-elo-unavailable><span className="label">ELO unavailable</span><span className="session-inline"><span className="label">Session</span>{session}</span></p>}
  </StreamWidget>;
}
