import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { attachHeatCamera, type CameraSubscription } from "./heat-camera";
import { HeatJobs } from "./heat-jobs";
import { Keys } from "../controls";
import { ModuleHeader } from "./Module";
import { HEAT_COLORS, heatCameraMatches, heatDimensions, MAP_ATTRIBUTION, spawnHeatOpacity, type GameSnapshot, type HeatGrid, type SpawnHeat } from "@flashfront/core";

/**
 * A full recompute takes ~120 ms with 450 spawns on a large map (measured 2026-10-18); redoing it on
 * every 8 Hz poll queued updates until the tint trailed the camera by seconds. Camera moves only
 * restyle the canvas; colors are recomputed when spawn positions change, at most every 500 ms.
 */
const REDRAW_MS = 500;
export const LITE_REDRAW_MS = 1000;
export function SpawnHeatmap({ snapshot, held = true, subscribeCamera, lite = false }: { snapshot: GameSnapshot; held?: boolean; subscribeCamera?: CameraSubscription; lite?: boolean }) {
  const dimensions = useMemo(() => heatDimensions(snapshot.map), [snapshot.map]);
  const [loaded, setLoaded] = useState<{ map: string; grid: HeatGrid; cells: Uint8Array } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const grid = loaded?.map === snapshot.map ? loaded.grid : undefined;
  const canvas = useRef<HTMLCanvasElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const cameraView = useRef<ReturnType<typeof attachHeatCamera> | null>(null);
  const opacity = spawnHeatOpacity(snapshot);
  const camera = snapshot.spawnHeat?.camera;
  const aligned = !!dimensions && heatCameraMatches(dimensions, camera, snapshot.mapSize);
  useEffect(() => {
    if (!dimensions || !opacity) return;
    let cancelled = false;
    void import("@flashfront/core/heat-data").then(async ({ heatGridFor, decodeHeatGrid }) => {
      const grid = heatGridFor(snapshot.map);
      if (!grid || cancelled) return;
      const cells = await decodeHeatGrid(grid);
      if (!cancelled) setLoaded({ map: snapshot.map, grid, cells });
    }).catch(() => { if (!cancelled) setFailed(snapshot.map); });
    return () => { cancelled = true; };
  }, [snapshot.map, dimensions, opacity > 0]);
  const positions = useMemo(() => snapshot.spawnHeat ? JSON.stringify([snapshot.spawnHeat.others, snapshot.spawnHeat.own]) : "", [snapshot.spawnHeat]);
  const latest = useRef(snapshot); latest.current = snapshot;
  const drawnAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const jobs = useRef<HeatJobs<SpawnHeat> | null>(null);
  const visibleCanvas = held && opacity > 0 && aligned && !!grid;
  useEffect(() => {
    if (!visibleCanvas || !grid || !loaded) return;
    const worker = new Worker(new URL("./heat.worker.ts", import.meta.url), { type: "module" });
    let initialized = false; let active = true;
    let image: ImageData | undefined;
    let recycled: Uint8ClampedArray | undefined;
    const scheduler = new HeatJobs<SpawnHeat>(heat => {
      const pixels = recycled; recycled = undefined;
      worker.postMessage({ heat, compact: latest.current.mapSize === "Compact", pixels,
        ...(!initialized ? { grid, cells: loaded.cells } : {}) }, pixels ? [pixels.buffer] : []);
      initialized = true;
    }, data => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;
      image ??= context.createImageData(grid.columns, grid.rows); image.data.set(data);
      context.putImageData(image, 0, 0);
    });
    jobs.current = scheduler;
    worker.onmessage = ({ data }: MessageEvent<Uint8ClampedArray>) => { if (active) { recycled = data; scheduler.complete(data); } };
    worker.onerror = () => setFailed(latest.current.map);
    drawnAt.current = 0;
    return () => {
      clearTimeout(timer.current); timer.current = undefined;
      active = false; jobs.current = null; worker.terminate();
    };
  }, [visibleCanvas, grid, loaded]);
  useEffect(() => {
    if (!visibleCanvas || !positions) return;
    const draw = () => {
      timer.current = undefined;
      const current = latest.current;
      if (!current.spawnHeat || !jobs.current) return;
      drawnAt.current = Date.now(); jobs.current.update(current.spawnHeat, true);
    };
    const wait = (lite ? LITE_REDRAW_MS : REDRAW_MS) - (Date.now() - drawnAt.current);
    if (wait <= 0) draw(); else timer.current ??= setTimeout(draw, wait);
    return () => { clearTimeout(timer.current); timer.current = undefined; };
  }, [grid, loaded, positions, snapshot.mapSize, visibleCanvas, lite]);
  useLayoutEffect(() => {
    if (!visibleCanvas || !grid || !canvas.current || !clip.current || !camera) return;
    const view = attachHeatCamera(canvas.current, clip.current, grid, camera, snapshot.mapSize === "Compact", subscribeCamera, lite);
    cameraView.current = view;
    return () => { view.close(); cameraView.current = null; };
  }, [visibleCanvas, grid, snapshot.mapSize, subscribeCamera, lite]);
  useLayoutEffect(() => { if (camera) cameraView.current?.update(camera); }, [camera]);
  if (!opacity) return null;
  if (!held) return <SpawnHeatHint />;
  const ready = aligned && !!grid;
  const note = !dimensions ? "No spawn heat data for this map yet." : failed === snapshot.map ? "Spawn heat data unavailable."
    : !aligned ? "Spawn heat unavailable: waiting for map alignment." : !ready ? "Loading spawn heat…" : null;
  return <div className="spawn-heat" style={{ opacity }} aria-label="Spawn heat map">
    {ready && camera && <div ref={clip} className="spawn-heat-clip">
      <canvas ref={canvas} width={grid.columns} height={grid.rows} aria-label="Terrain and live spawn crowding" style={{ left: 0, top: 0, width: grid.columns, height: grid.rows, transformOrigin: "0 0", willChange: "transform" }} />
    </div>}

    <section className="panel hud-panel spawn-heat-dock spawn-heat-legend" data-heat-legend aria-label="Spawn heat legend">
      <ModuleHeader title="Spawn heat" icon="spawn" />
      <div className="hud-panel-content">
        {note ? <p className="muted">{note}</p> : <ul className="heat-swatches">
          <li><i style={{ background: HEAT_COLORS[2] }} />Room + coast</li>
          <li><i style={{ background: HEAT_COLORS[1] }} />Mixed</li>
          <li><i style={{ background: HEAT_COLORS[0] }} />Crowded / poor</li>
        </ul>}
        <small className="heat-attribution">{MAP_ATTRIBUTION}</small>
      </div>
    </section>
  </div>;
}
/** Shown in the legend's dock while Space is released; `status` adds a data-health note. */
export function SpawnHeatHint({ status, released = true }: { status?: string; released?: boolean }) {
  return <div className="panel hud-panel spawn-heat-dock spawn-heat-hint" data-heat-legend>
    {released && <>Hold <Keys shortcut="Space" label="Space" />: spawn heat</>}{released && status && " · "}{status}
  </div>;
}
