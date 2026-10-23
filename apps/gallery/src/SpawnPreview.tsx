import { useEffect, useRef, useState } from "react";
import { spawnWorldToScreen, type HeatGrid, type GameSnapshot, type SpawnPosition } from "@flashfront/core";
import { HudRoot } from "@flashfront/ui";

export function SpawnPreview({ snapshot, editing, onEdit }: { snapshot: GameSnapshot; editing: boolean; onEdit: (value: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1920, height: 1080 });
  const [elapsed, setElapsed] = useState(0);
  const [positions, setPositions] = useState<SpawnPosition[]>([]);
  const [grid, setGrid] = useState<HeatGrid | null>(null);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const start = Date.now(); setElapsed(0); setPositions([]);
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000 % 24), 250);
    let cancelled = false;
    void import("@flashfront/core/heat-data").then(async ({ heatGridFor, decodeHeatGrid }) => {
      const grid = heatGridFor(snapshot.map); if (cancelled) return; setGrid(grid); if (!grid) return;
      const cells = await decodeHeatGrid(grid);
      const land = Array.from(cells.keys()).filter(i => cells[i]! >= 20);
      const step = grid.width / grid.columns * (snapshot.mapSize === "Compact" ? 0.5 : 1);
      const picks = Array.from({ length: 8 }, (_, i) => land[Math.floor(land.length * (i + 1) / 10)]!).filter(i => i !== undefined)
        .map(i => ({ x: (i % grid.columns + 0.5) * step, y: (Math.floor(i / grid.columns) + 0.5) * step }));
      if (!cancelled) setPositions(picks);
    }).catch(() => { /* The HUD displays the unavailable-data note. */ });
    return () => { cancelled = true; clearInterval(timer); };
  }, [snapshot.map, snapshot.mapSize]);
  // Space is the heat key. The mock player lets go of it from 4 s to 10 s, so the dock shows the "Hold Space"
  // keycap hint; holding the real Space bar shows heat at any time.
  const [spaceDown, setSpaceDown] = useState(false);
  useEffect(() => {
    const set = (down: boolean) => (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(down); };
    const onDown = set(true), onUp = set(false);
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);
  const heatHeld = spaceDown || elapsed < 4 || elapsed >= 10;
  const factor = snapshot.mapSize === "Compact" ? 0.5 : 1;
  const width = (grid?.width ?? 2000) * factor; const height = (grid?.height ?? 1000) * factor;
  const scale = Math.min(size.width / width, size.height / height) * (elapsed >= 8 && elapsed < 20 ? 1.15 : 0.85);
  const camera = { scale, mapWidth: width, mapHeight: height,
    offsetX: (width - size.width) / (2 * scale) + (elapsed >= 12 ? 80 : 0), offsetY: (height - size.height) / (2 * scale),
    left: 0, top: 0, width: size.width, height: size.height, viewportWidth: size.width, viewportHeight: size.height };
  const others = positions.slice(0, Math.min(5, Math.floor(elapsed / 3))).map((p, i) => i === 0 && elapsed >= 14 ? positions[6] ?? p : p);
  const own = elapsed >= 5 ? positions[elapsed >= 10 ? 7 : 5] : undefined;
  const mock: GameSnapshot = { ...snapshot, phase: elapsed < 20 ? "spawn" : "playing",
    spawnHeat: elapsed < 20 ? { camera, others, own, remainingSec: 20 - elapsed } : undefined };
  const origin = spawnWorldToScreen({ x: 0, y: 0 }, camera);
  return <div ref={root} className="spawn-preview">
    {grid && <img className="spawn-preview-map" src={`minimaps/${grid.folder}.png`} alt={`${snapshot.map} mock map`} style={{ left: origin.x, top: origin.y, width: width * scale, height: height * scale }} />}
    {elapsed < 20 && [...others.map(p => ({ ...p, own: false })), ...(own ? [{ ...own, own: true }] : [])].map((p, i) => {
      const screen = spawnWorldToScreen(p, camera);
      return <span key={i} className={`spawn-preview-player ${p.own ? "own" : ""}`} style={{ left: screen.x, top: screen.y }} aria-label={p.own ? "Your mock spawn" : "Landed mock player"} />;
    })}
    <HudRoot snapshot={mock} editMode={editing} onEditModeChange={onEdit} heatHeld={heatHeld} />
    <span className="spawn-preview-caption">Mock spawn · {elapsed < 20 ? `${Math.ceil(20 - elapsed)}s · ${others.length} landed` : "Spawn ended"} · repeats every 24s</span>
  </div>;
}
