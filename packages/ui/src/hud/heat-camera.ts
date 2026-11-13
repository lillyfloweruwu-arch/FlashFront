import { heatCameraMatches, spawnWorldToScreen, type HeatGrid, type SpawnCamera } from "@flashfront/core";

export type CameraSubscription = (cb: (camera: SpawnCamera) => void) => () => void;
export function heatCanvasTransform(grid: Pick<HeatGrid, "columns" | "rows">, camera: SpawnCamera, viewport: { width: number; height: number }) {
  const origin = spawnWorldToScreen({ x: 0, y: 0 }, camera);
  const x = viewport.width / camera.viewportWidth, y = viewport.height / camera.viewportHeight;
  return { left: camera.left * x, top: camera.top * y, width: camera.width * x, height: camera.height * y,
    x: (origin.x - camera.left) * x, y: (origin.y - camera.top) * y,
    scaleX: camera.mapWidth * camera.scale / grid.columns * x, scaleY: camera.mapHeight * camera.scale / grid.rows * y };
}

/**
 * Projects the game camera a short way ahead along its recent velocity, so the heat canvas keeps up
 * with panning between samples and makes up for sample-to-screen delay. Live 2026-10-19: easing to
 * the last sample was "smoother, still a little steppy". The lead is capped and a stale camera
 * (no sample for STALE_MS) holds still, so a stop never overshoots for long.
 */
export class CameraPredictor {
  // Measured from a 2026-10-19 clip: the tint trailed the map by about 20-30 ms at a 16 ms lead.
  static readonly LEAD_MS = 32;
  static readonly MAX_LEAD_MS = 64;
  static readonly STALE_MS = 80;
  private last?: { camera: SpawnCamera; t: number };
  private velocity = { offsetX: 0, offsetY: 0, scale: 0 };
  push(camera: SpawnCamera, t: number): void {
    const prev = this.last;
    if (prev) {
      const dt = t - prev.t;
      // Samples under 2 ms apart carry no usable velocity; keep the previous estimate.
      if (dt >= 2) this.velocity = { offsetX: (camera.offsetX - prev.camera.offsetX) / dt,
        offsetY: (camera.offsetY - prev.camera.offsetY) / dt, scale: (camera.scale - prev.camera.scale) / dt };
    }
    this.last = { camera, t };
  }
  at(now: number): SpawnCamera | undefined {
    if (!this.last) return undefined;
    const { camera, t } = this.last;
    const age = now - t;
    if (age > CameraPredictor.STALE_MS) return camera;
    const lead = Math.min(Math.max(0, age) + CameraPredictor.LEAD_MS, CameraPredictor.MAX_LEAD_MS);
    // Zoom is never extrapolated: OpenFront zooms in steps per wheel click, so a projected scale
    // overshot and flashed the tint at the wrong size (same clip).
    return { ...camera,
      offsetX: camera.offsetX + this.velocity.offsetX * lead, offsetY: camera.offsetY + this.velocity.offsetY * lead };
  }
}

/**
 * Opacity of the heat tint for how fast the map moves on screen. A whip of hundreds of pixels per
 * frame cannot be tracked from outside the game (clip 2026-10-19 20-27-42: about a frame off), so
 * the tint fades out while the map moves fast and fades back in once it settles.
 */
export const MOTION_FADE = { startPxPerMs: 4, hiddenPxPerMs: 12, fadeInMs: 150 };
export function motionFade(current: number, pxPerMs: number, dtMs: number): number {
  const target = pxPerMs <= MOTION_FADE.startPxPerMs ? 1
    : Math.max(0, 1 - (pxPerMs - MOTION_FADE.startPxPerMs) / (MOTION_FADE.hiddenPxPerMs - MOTION_FADE.startPxPerMs));
  if (target <= current) return target;                                        // hide at once
  return Math.min(target, current + Math.max(0, dtMs) / MOTION_FADE.fadeInMs); // reappear gently
}

/** Only DOM transforms change between camera samples; React and the color worker stay idle. */
export function attachHeatCamera(canvas: HTMLCanvasElement, clip: HTMLDivElement, grid: HeatGrid, initial: SpawnCamera,
  compact: boolean, subscribe?: CameraSubscription, lite = false) {
  const predictor = new CameraPredictor();
  let lastFast = -Infinity, frame = 0, fade = 1;
  let prev: { x: number; y: number; w: number; t: number } | undefined;
  const paint = (camera: SpawnCamera, now?: number) => {
    const host = clip.parentElement!;
    const t = heatCanvasTransform(grid, camera, { width: host.clientWidth || camera.viewportWidth, height: host.clientHeight || camera.viewportHeight });
    clip.style.left = `${t.left}px`; clip.style.top = `${t.top}px`; clip.style.width = `${t.width}px`; clip.style.height = `${t.height}px`;
    canvas.style.transform = `matrix(${t.scaleX}, 0, 0, ${t.scaleY}, ${t.x}, ${t.y})`;
    const w = grid.columns * t.scaleX;
    if (now === undefined) fade = 1;
    else if (prev && now > prev.t) {
      // Zoom counts as motion too: the size change at the canvas edge, in screen pixels.
      const moved = Math.hypot(t.left + t.x - prev.x, t.top + t.y - prev.y) + Math.abs(w - prev.w) / 2;
      fade = motionFade(fade, moved / (now - prev.t), now - prev.t);
    }
    prev = now === undefined ? undefined : { x: t.left + t.x, y: t.top + t.y, w, t: now };
    canvas.style.opacity = fade >= 1 ? "" : fade.toFixed(2);
  };
  // While fast samples arrive, repaint every display frame from the prediction; stop once stale.
  const animate = (now: number) => {
    frame = 0;
    const camera = predictor.at(now);
    if (camera) paint(camera, now);
    if (now - lastFast < CameraPredictor.STALE_MS * 4) frame = requestAnimationFrame(animate);
  };
  const update = (camera: SpawnCamera, fast = false) => {
    if (!heatCameraMatches(grid, camera, compact ? "Compact" : "Normal")) return;
    const now = performance.now();
    if (!fast && now - lastFast < 250) return;
    if (fast) {
      lastFast = now;
      if (lite) { paint(camera); return; }
      predictor.push(camera, now);
      if (!frame) frame = requestAnimationFrame(animate);
    } else { cancelAnimationFrame(frame); frame = 0; predictor.push(camera, now); paint(camera); }
  };
  paint(initial);
  const off = subscribe?.(camera => update(camera, true));
  return { update, close() { off?.(); cancelAnimationFrame(frame); } };
}
