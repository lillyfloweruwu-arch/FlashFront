import { Icon } from "../icons";
import { useMemo } from "react";
import { MAP_ATTRIBUTION, spotsFor, type GameSnapshot } from "@flashfront/core";

export type MinimapSource = (folder: string) => string | undefined;
const bundledMinimap: MinimapSource = folder => `./minimaps/${folder}.png`;
export function SpawnPanel({ snapshot, minimapSource = bundledMinimap }: {
  snapshot: Pick<GameSnapshot, "phase" | "map" | "mapSize">; minimapSource?: MinimapSource;
}) {
  const map = useMemo(() => spotsFor(snapshot.map, snapshot.mapSize), [snapshot.map, snapshot.mapSize]);
  if (snapshot.phase !== "spawn") return null;
  const image = map && minimapSource(map.folder);
  return <div className="spawn-content">
    <h2 className="panel-title" aria-label={`Spawn spots · ${map?.displayName ?? snapshot.map}`}>SPAWN · {map?.displayName ?? snapshot.map}</h2>
    {map ? <>
      {image ? <div className="spawn-minimap" style={{ width: Math.min(246, 104 * map.width / map.height), aspectRatio: `${map.width} / ${map.height}` }}>
        <img src={image} alt={`${map.displayName} terrain minimap`} width={map.width} height={map.height} />
        {map.picks.map((pick, i) => <span key={i} className="spawn-marker" aria-label={`Spawn spot ${i + 1}`} style={{ left: `${pick.x / map.width * 100}%`, top: `${pick.y / map.height * 100}%` }}>{i + 1}</span>)}
      </div> : <p className="muted">Minimap not bundled in this preview.</p>}
      <div className="spawn-details" tabIndex={0} aria-label="Spawn reasons and community tips">
        {map.note && <p className="spawn-note">{map.note}. Terrain reasons use Normal-map distances.</p>}
        {map.teamAreas && <p className="spawn-note">Team spawn areas may restrict these picks.</p>}
        {!map.picks.length && <p className="muted">No large enough connected land area for a recommendation.</p>}
        <ol className="spawn-picks">{map.picks.map((pick, i) => <li key={i}>
          <span className="spawn-pick-number" aria-hidden="true">{i + 1}</span>
          <div><span className="spawn-coordinate">({pick.x}, {pick.y}) · Top {Math.max(1, Math.ceil(100 * (1 - pick.percentile)))}% of this map</span><div className="spawn-reasons">{pick.reasons.map(reason => <span className="spawn-chip" title={reason} key={reason}>{reason.replace(/\s*\(top \d+% of map\)/, "")}</span>)}</div>{pick.warning && <p className="spawn-note spawn-warning" title={pick.warning}>{pick.warning}</p>}</div>
        </li>)}</ol>
        {map.community && <details className="spawn-community"><summary><Icon name="chevron" className="disclosure-chevron" />Community tips</summary><ul>{map.community.tips.map(tip => <li key={tip}>{tip}</li>)}</ul><p className="muted">{map.community.source.name} · {map.community.source.date}</p></details>}
      </div>
    </> : <p className="muted">No spawn data for this map yet.</p>}
    <span className="spawn-why muted" tabIndex={0} title="Players with more cheap land within ~120 tiles did better; being next to an AI nation did worse.">Why these spots?</span>
    <p className="spawn-note muted" title="Terrain-based suggestions, fitted to 145 real games. Terrain explains a small part of results; your call.">Terrain estimates; your call.</p>
    <footer className="spawn-footer">{MAP_ATTRIBUTION}</footer>
  </div>;
}
