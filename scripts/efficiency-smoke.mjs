// Production renderer only, with a fixture preload bridge. Never connects to or launches the game.
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("apps/launcher/out/renderer");
const server = createServer(async (req, res) => {
  const file = resolve(root, "." + new URL(req.url, "http://localhost").pathname);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" })[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; const requests = [];
page.on("pageerror", e => errors.push(e.message)); page.on("request", r => requests.push(r.url()));
const dims = JSON.parse(await readFile("packages/core/src/spawn/heat-dims.json", "utf8")).World;
const camera = { scale: 0.8, offsetX: 0, offsetY: 0, left: 0, top: 0, width: 1920, height: 1080, viewportWidth: 1920, viewportHeight: 1080, mapWidth: dims[0], mapHeight: dims[1] };
const state = { status: "connected-game", editing: false, hudEnabled: true, launching: false, setupNeeded: false, errors: [], spawnHeatHeld: false,
  settings: { theme: "abyss", setupDone: true, hudPreset: "custom", reserveFloor: 35, ranked: true, port: 9222, textSize: "compact", toggleHotkey: "Ctrl+Alt+H", editHotkey: "Ctrl+Alt+E", snoozeHotkey: "Ctrl+Alt+S" },
  raw: { inGame: true, visible: true }, health: { growth: "verified", attack: "verified", build: "verified", trade: "verified", alliances: "verified", spawnHeat: "verified" },
  overlayViewport: { offsetX: 0, offsetY: 0, width: 1920, height: 1080 },
  snapshot: { gameId: "fixture", phase: "playing", map: "World", mode: "FFA", tick: 1, ticksPerSecond: 10, elapsedSec: 0, winTargetPct: 80, self: null, players: [], events: [] } };
try {
  await page.addInitScript(state => {
    window.fixtureState = state;
    window.flashfront = { getState: async () => state, subscribe: cb => { window.publishFixture = cb; return () => {}; },
      subscribeCamera: cb => { window.cameraFixture = cb; return () => { window.cameraFixture = undefined; }; },
      onSurfaceActive: cb => { window.activityFixture = cb; return () => {}; }, onViewport: () => () => {},
      reportShape: () => {}, reportDecision: () => {}, listMatches: async () => [], onMatchesChanged: () => () => {}, stats: async () => ({ status: 503 }) };
  }, state);
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/index.html?surface=launcher`); await expect(page.locator(".launcher-shell")).toBeVisible();
  expect(requests.some(url => /heat-data|heat\.worker/.test(url))).toBe(false);
  await page.goto(`${base}/index.html?surface=overlay`); await expect(page.locator(".hud-layer")).toBeVisible();
  expect(requests.some(url => /heat-data|heat\.worker/.test(url))).toBe(false);
  await page.evaluate(camera => {
    window.fixtureState.snapshot = { ...window.fixtureState.snapshot, phase: "spawn", spawnHeat: { camera, others: [], remainingSec: 20 } };
    window.publishFixture({ ...window.fixtureState });
  }, camera);
  await expect(page.getByText("Hold Space: spawn heat")).toBeVisible();
  await expect.poll(() => requests.some(url => /heat-data/.test(url))).toBe(true);
  expect(requests.some(url => /heat\.worker/.test(url))).toBe(false);
  await page.evaluate(() => { window.fixtureState.spawnHeatHeld = true; window.publishFixture({ ...window.fixtureState }); });
  const canvas = page.locator(".spawn-heat canvas");
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => canvas.evaluate(el => el.getContext("2d").getImageData(0, 0, el.width, el.height).data.some((value, i) => i % 4 === 3 && value === 82))).toBe(true);
  const before = await canvas.evaluate(el => el.style.transform);
  await page.evaluate(camera => window.cameraFixture({ ...camera, offsetX: 120, scale: 1.1 }), camera);
  await expect.poll(() => canvas.evaluate(el => el.style.transform)).not.toBe(before);
  await page.evaluate(() => { window.fixtureState.spawnHeatHeld = false; window.publishFixture({ ...window.fixtureState }); });
  await expect(canvas).toHaveCount(0); expect(await page.evaluate(() => window.cameraFixture)).toBeUndefined();
  await page.evaluate(() => { window.fixtureState.spawnHeatHeld = true; window.publishFixture({ ...window.fixtureState }); });
  await expect(canvas).toHaveCount(1);
  await page.evaluate(() => window.activityFixture(false)); await expect(canvas).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log("Production fixture passed: cold launcher/overlay, lazy grid, worker pixels, camera IPC transforms, release/reactivation, hidden-window pause.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
