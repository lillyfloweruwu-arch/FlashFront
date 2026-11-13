import { createPortal } from "react-dom";
import type { LauncherState } from "../../shared";

/** Only plot a known own spawn whose map and coordinate space match the backdrop. */
export function PlaySpawnPin({ state }: { state: LauncherState }) {
  const heat = state.snapshot?.spawnHeat;
  const point = heat?.own;
  const camera = heat?.camera;
  // Recordings omit map size. Without a known coordinate space, do not invent a pin.
  if (state.snapshot?.map.toLowerCase() !== "europe" || !point || !camera
    || ![point.x, point.y, camera.mapWidth, camera.mapHeight].every(Number.isFinite)
    || camera.mapWidth <= 0 || camera.mapHeight <= 0
    || point.x < 0 || point.y < 0 || point.x >= camera.mapWidth || point.y >= camera.mapHeight) return null;
  const shell = document.querySelector(".launcher-shell");
  if (!shell) return null;
  return createPortal(<svg className="play-spawn-pin" aria-label="Your last spawn" role="img"
    viewBox={`0 0 ${camera.mapWidth} ${camera.mapHeight}`} preserveAspectRatio="xMidYMid slice">
    <g transform={`translate(${point.x} ${point.y})`}>
      <circle className="spawn-halo outer" r="21" /><circle className="spawn-halo" r="13" />
      <circle className="spawn-dot" r="5" /><text x="30" y="4">Your last spawn</text>
    </g>
  </svg>, shell);
}
