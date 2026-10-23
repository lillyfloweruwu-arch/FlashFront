import { expect, it } from "vitest";
import { spawnWorldToScreen, type SpawnCamera } from "@flashfront/core";
import { CameraPredictor, heatCanvasTransform, MOTION_FADE, motionFade } from "./hud/heat-camera";

it("maps canvas pixels to the same viewport positions as spawnWorldToScreen", () => {
  for (const scale of [0.5, 1, 2.4]) for (const factor of [0.5, 1, 1.5]) {
    const camera: SpawnCamera = { scale, offsetX: -250, offsetY: 125, mapWidth: 2000, mapHeight: 1000, left: 16, top: 24, width: 1900, height: 1000, viewportWidth: 1920, viewportHeight: 1080 };
    const grid = { columns: 500, rows: 250 };
    const result = heatCanvasTransform(grid, camera, { width: 1920 * factor, height: 1080 * factor });
    for (const point of [{ x: 0, y: 0 }, { x: 234, y: 456 }, { x: 2000, y: 1000 }]) {
      const expected = spawnWorldToScreen(point, camera);
      expect(result.left + result.x + point.x / camera.mapWidth * grid.columns * result.scaleX).toBeCloseTo(expected.x * factor);
      expect(result.top + result.y + point.y / camera.mapHeight * grid.rows * result.scaleY).toBeCloseTo(expected.y * factor);
    }
  }
});

// Live 2026-10-19: panning was "smoother, still a little steppy" with ease-to-last-sample. The
// predictor projects the camera along its recent velocity for a short, capped lead.
const cam = (offsetX: number, scale = 1): SpawnCamera => ({ scale, offsetX, offsetY: 0, mapWidth: 2000, mapHeight: 1000, left: 0, top: 0, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080 });
it("predicts a steady pan ahead by the display lead, and holds still when samples stop", () => {
  const p = new CameraPredictor();
  expect(p.at(0)).toBeUndefined();
  p.push(cam(0), 0); expect(p.at(5)!.offsetX).toBe(0);                 // one sample: no velocity yet
  p.push(cam(16), 16);                                                     // 1 unit per ms
  expect(p.at(24)!.offsetX).toBeCloseTo(16 + (8 + CameraPredictor.LEAD_MS));
  expect(p.at(16 + 200)!.offsetX).toBe(16);                                // stale: no extrapolation
  p.push(cam(16), 32); p.push(cam(16), 48);                                // stopped
  expect(p.at(56)!.offsetX).toBeCloseTo(16, 0);
});
it("caps the lead so a fast flick never overshoots far", () => {
  const p = new CameraPredictor();
  p.push(cam(0), 0); p.push(cam(100), 10);                                 // 10 units per ms
  expect(p.at(10 + CameraPredictor.STALE_MS + 10)!.offsetX).toBe(100);     // past the stale limit
  expect(p.at(20)!.offsetX).toBeLessThanOrEqual(100 + 10 * CameraPredictor.MAX_LEAD_MS);
});
it("never extrapolates zoom, and ignores samples that arrive too close together", () => {
  const p = new CameraPredictor();
  p.push(cam(0, 1), 0); p.push(cam(0, 1.16), 16);
  expect(p.at(16)!.scale).toBe(1.16);                                      // zoom steps: newest scale only
  p.push(cam(0), 20); p.push(cam(32), 36);                                 // 2 units per ms
  p.push(cam(33), 36.5);                                                   // 0.5 ms apart: keeps 2 units per ms
  expect(p.at(36.5)!.offsetX).toBeCloseTo(33 + 2 * CameraPredictor.LEAD_MS);
});

// Clip 2026-10-19 20-27-42: whipping the map moved it hundreds of pixels a frame and the tint landed
// about a frame off. The tint fades while the map moves fast and comes back once it settles.
it("fades the tint while the map moves fast and brings it back gently", () => {
  expect(motionFade(1, 1, 16)).toBe(1);                                    // ordinary pan: full tint
  expect(motionFade(1, MOTION_FADE.hiddenPxPerMs + 5, 16)).toBe(0);         // whip: hidden at once
  const half = (MOTION_FADE.startPxPerMs + MOTION_FADE.hiddenPxPerMs) / 2;
  expect(motionFade(1, half, 16)).toBeCloseTo(0.5);
  expect(motionFade(0, 0, 16)).toBeCloseTo(16 / MOTION_FADE.fadeInMs);      // settles: fades back in
  expect(motionFade(0.95, 0, 100)).toBe(1);
});
