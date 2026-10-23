import { formatDuration, type LobbyInfo } from "@flashfront/core";
import { AnimatedNumber, integer, Meter } from "../shared";
import { StreamWidget } from "./StreamWidget";
export function LobbyCard({ lobby }: { lobby: LobbyInfo }) {
  return <StreamWidget title="Next deployment" icon="clock"><div className="spread"><div><h2>{lobby.map}</h2><span className="muted">{lobby.mode}{lobby.teamsLabel && ` · ${lobby.teamsLabel}`}</span></div><strong className="clock"><AnimatedNumber value={lobby.startsInSec} format={formatDuration} /></strong></div><div className="spread lobby-count"><span className="muted">Players ready</span><span><AnimatedNumber value={lobby.players} format={integer} /> / {lobby.maxPlayers}</span></div><Meter tone="muted" value={lobby.players} max={lobby.maxPlayers} label="Lobby occupancy" /></StreamWidget>;
}
