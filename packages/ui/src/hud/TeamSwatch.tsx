import type { GameSnapshot } from "@flashfront/core";

export interface OwnTeam { team?: string; teamColor?: string; }
export function TeamSwatch({ snapshot, team }: { snapshot: GameSnapshot; team?: OwnTeam }) {
  if (snapshot.phase !== "spawn" || snapshot.mode !== "Teams" || snapshot.observer || !team?.team) return null;
  const color = /^#[0-9a-f]{6}$/i.test(team.teamColor ?? "") ? team.teamColor : undefined;
  return <div className="team-swatch" data-heat-legend>{color && <i style={{ background: color }} />}<span>Your team: {team.team}</span></div>;
}
