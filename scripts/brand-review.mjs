import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Renderer-only review: bridge fixtures never start Electron, Steam or OpenFront.
const gallery = 'http://127.0.0.1:5173';
const launcher = process.env.FLASHFRONT_RENDERER_URL ?? 'http://127.0.0.1:5175';
const browser = process.env.FLASHFRONT_CDP_URL ? await chromium.connectOverCDP(process.env.FLASHFRONT_CDP_URL) : await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 720 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results/v7', { recursive: true });
const capture = name => page.screenshot({ path: `test-results/v7/${name}.png`, fullPage: true });
try {
  await page.goto(gallery);
  const fixture = await page.evaluate(async url => {
    const { MockDataSource } = await import(url);
    const source = new MockDataSource();
    return { snapshot: source.getSnapshot(), profile: await source.getProfile('self') };
  }, `/@fs/${resolve('packages/core/src/index.ts').replaceAll('\\', '/')}`);
  await page.addInitScript(({ snapshot, profile }) => {
    let state = { status: 'port-closed', version: '0.35.1', settings: { theme: 'abyss', port: 9222, toggleHotkey: 'Ctrl+Alt+H', editHotkey: 'Ctrl+Alt+E', reserveFloor: 35, ranked: true, startHidden: false }, snapshot: null, raw: null, editing: false, hudEnabled: true, launching: false, setupNeeded: true, errors: [] };
    const listeners = new Set();
    const publish = () => listeners.forEach(fn => fn({ ...state }));
    window.reviewState = patch => { state = { ...state, ...patch }; publish(); };
    window.reviewSnapshot = snapshot;
    window.flashfront = {
      getState: async () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      launch: async () => { state.launching = true; publish(); },
      saveSettings: async settings => { state.settings = settings; publish(); },
      toggleHud: async () => { state.hudEnabled = !state.hudEnabled; publish(); },
      toggleEdit: async () => { state.editing = !state.editing; publish(); },
      copySetup: async () => {}, copyPreset: async () => {}, reportShape: () => {},
      listMatches: async () => [{ file: 'fixture', startedAt: '2026-10-17T00:00:00Z', map: 'World', mode: 'FFA', durationSec: 480, finalRank: 8, sparkline: [{ t: 0, value: 25 }, { t: 100, value: 56 }] }],
      getMatch: async () => ({ version: 1, recordedBy: 'FlashFront', gameId: 'fixture', startedAt: '2026-10-17T00:00:00Z', map: 'World', mode: 'FFA', durationSec: 480, samples: [], events: [], summary: { finalRank: 8, exposedPushes: 0, idleGoldSeconds: 0, pushes: 0, timeInZone: { exposed: 0, low: 0, sweet: 0, high: 0, wasting: 0 } } }),
      showMatch: async () => {}, deleteMatch: async () => {},
      stats: async path => ({ status: 200, body: path.endsWith('/games') ? { results: [{ gameId: 'fixture', map: 'World', result: 'victory', duration: 480 }] } : { username: profile.name, stats: { Public: { total: '42', wins: '8' } } } }),
    };
  }, fixture);
  await page.goto(launcher);
  await expect(page.getByRole('heading', { name: 'READY TO LAUNCH' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Next match', exact: true })).toContainText('No observed pushes');
  for (const theme of ['abyss', 'ember']) {
    await page.evaluate(theme => window.reviewState({ settings: { theme, port: 9222, toggleHotkey: 'Ctrl+Alt+H', editHotkey: 'Ctrl+Alt+E', reserveFloor: 35, ranked: true, startHidden: false } }), theme);
    await expect(page.locator('html')).toHaveAttribute('data-ff-theme', theme);
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(10, 10, 11)');
    expect(await page.locator('.launcher-topbar').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 19, 22)');
  }
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('40px "Antonio Variable"'))).toBe(true);
  await capture('launcher-play');
  await page.getByRole('switch').click(); await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  for (const view of ['Matches', 'Profile', 'Themes', 'Settings']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await capture(`launcher-${view.toLowerCase()}`);
  }
  await page.getByLabel('Reserve floor: 35% of max').fill('45');
  await expect(page.getByLabel('Debug port')).not.toBeVisible();
  await page.getByText('Advanced', { exact: true }).click();
  await expect(page.getByLabel('Debug port')).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.evaluate(() => window.reviewState({ status: 'connected-game', snapshot: window.reviewSnapshot, raw: { inGame: true }, settings: { theme: 'abyss', port: 9222, toggleHotkey: 'Ctrl+Alt+H', editHotkey: 'Ctrl+Alt+E', reserveFloor: 45, ranked: true, startHidden: false, publicId: 'OWN12345' } }));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'IN MATCH' })).toBeVisible();
  await capture('launcher-live');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy public ID' })).toBeVisible();
  await expect(page.getByText('Loading public stats…')).not.toBeVisible();
  await expect(page.getByLabel('Public ID', { exact: true })).not.toBeVisible();
  await capture('launcher-profile-loaded');
  await page.setViewportSize({ width: 900, height: 600 });
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await capture('launcher-minimum');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const route of ['/', '/brand', '/hud?phase=playing', '/hud?phase=spawn&map=World', '/stream', '/stats']) {
    await page.goto(`${gallery}/#${route}`);
    await page.locator('.site-header').waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (route.includes('/hud')) await expect(page.locator('[data-panel]:not([hidden])').first()).toBeVisible();
    await capture(`gallery-${route === '/' ? 'play' : route.includes('spawn') ? 'spawn' : route.split('?')[0].slice(1)}`);
  }
  await page.goto(`${gallery}/#/hud?phase=playing`);
  // Emulate the in-page HUD, which deliberately does not load fonts.css.
  await page.evaluate(() => {
    document.querySelectorAll('style').forEach(style => { if (style.textContent.includes('@font-face')) style.remove(); });
    document.fonts.clear();
  });
  for (const row of await page.locator('.build-row').all()) {
    const box = await row.evaluate(el => {
      const s = getComputedStyle(el);
      return { display: s.display, height: el.getBoundingClientRect().height, wrap: s.whiteSpace, overflow: el.scrollWidth > el.clientWidth };
    });
    expect(box.display).toBe('grid'); expect(box.height).toBeGreaterThanOrEqual(28);
    expect(box.wrap).toBe('nowrap'); expect(box.overflow).toBe(false);
  }
  for (const list of await page.locator('.event-list').all()) expect(await list.evaluate(el => getComputedStyle(el).overflowX)).toBe('hidden');
  await capture('hud-fallback-fonts');
  await page.getByLabel('Show game UI zones').check();
  const geometry = await page.evaluate(() => ({
    panels: [...document.querySelectorAll('[data-panel]:not([hidden])')].map(el => ({ id: el.dataset.panel, ...el.getBoundingClientRect().toJSON() })),
    zones: [...document.querySelectorAll('[data-game-zone]')].map(el => ({ id: el.dataset.gameZone, ...el.getBoundingClientRect().toJSON() })),
  }));
  for (const panel of geometry.panels) for (const zone of geometry.zones) expect(panel.x < zone.right && panel.right > zone.x && panel.y < zone.bottom && panel.bottom > zone.y, `${panel.id}/${zone.id}`).toBe(false);
  await page.evaluate(() => document.documentElement.classList.add('ff-static'));
  for (const panel of await page.locator('[data-panel]:not([hidden])').all()) {
    const style = await panel.evaluate(el => { const s = getComputedStyle(el); return [s.boxShadow, s.backdropFilter, s.animationName, s.transitionDuration]; });
    expect(style).toEqual(['none', 'none', 'none', '0s']);
  }
  await capture('hud-static-zones');
  await page.goto(`${gallery}/#/stream/obs?widgets=card,stats,top,lobby,result&anchor=bl`);
  await expect(page.locator('[data-widget]')).toHaveCount(5);
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await capture('obs');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/brand', '/stream', '/stats']) {
    await page.goto(`${gallery}/#${route}`);
    await page.locator('.site-header').waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  expect(errors).toEqual([]);
  console.log('PASS: launcher views, bridge fixtures, settings, preview/live, 900px minimum, gallery/brand, zones, ff-static, OBS transparency, mobile widths; no page errors.');
} finally { await context.close(); await browser.close(); }
