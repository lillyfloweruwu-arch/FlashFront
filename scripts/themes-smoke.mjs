import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Only built FlashFront pages and mock state. No game process or connection.
const roots = { gallery: resolve('apps/gallery/dist'), launcher: resolve('apps/launcher/out/renderer') };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const [, surface, ...parts] = pathname.split('/');
  const root = roots[surface] ?? roots.gallery;
  const relative = roots[surface] ? parts.join('/') || 'index.html' : pathname.slice(1);
  const file = resolve(root, relative);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' })[extname(file)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = process.env.FLASHFRONT_CDP_URL
  ? await chromium.connectOverCDP(process.env.FLASHFRONT_CDP_URL)
  : await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('test-results', { recursive: true });
try {
  await page.addInitScript(() => {
    const settings = { theme: 'abyss', port: 9222, toggleHotkey: 'Ctrl+Alt+H', editHotkey: 'Ctrl+Alt+E', ranked: true, startHidden: false, reserveFloor: 35 };
    const state = { settings, status: 'port-closed', snapshot: null, raw: null, errors: [], editing: false, hudEnabled: true, launching: false, setupNeeded: false };
    let listener;
    window.flashfront = {
      getState: async () => structuredClone(state), subscribe: cb => { listener = cb; return () => {}; },
      saveSettings: async next => { state.settings = next; listener?.(structuredClone(state)); },
      copyPreset: async id => { window.copiedPreset = id; },
    };
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage?.({ data: JSON.stringify({ snapshot: null, theme: 'ember' }) }), 50); }
      close() {}
    };
  });
  await page.goto(`${base}/launcher/index.html`);
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await expect(page.locator('.theme-preview')).toHaveCount(4);
  for (const theme of ['Front', 'Daylight', 'Ember', 'Signal']) {
    const card = page.getByRole('article', { name: theme, exact: true });
    await card.getByRole('button', { name: 'Use this theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ff-theme', (theme === "Front" ? "abyss" : theme.toLowerCase()));
    await card.getByRole('button', { name: 'Copy map preset' }).click();
    expect(await page.evaluate(() => window.copiedPreset)).toBe(theme.toLowerCase());
    await card.locator('summary').click();
    expect(JSON.parse(await card.locator('pre').innerText())).not.toHaveProperty('cosmetics');
    await card.locator('summary').click();
    await card.getByRole('slider').focus(); await page.keyboard.press('End');
    await expect(card.locator('.attack-preview')).toHaveAttribute('data-zone', 'exposed');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await card.screenshot({ path: `test-results/v6-${theme.toLowerCase()}-card.png` });
    const clipped = await card.locator('.theme-preview .panel').evaluateAll(panels => panels.some(p => p.scrollHeight > p.clientHeight + 1));
    expect(clipped, `${theme} preview clipping`).toBe(false);
  }
  await page.setViewportSize({ width: 460, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/v6-launcher-narrow.png', fullPage: true });
  await page.goto(`${base}/launcher/obs.html?theme=signal`);
  await expect(page.locator('html')).toHaveAttribute('data-ff-theme', 'signal');
  await page.goto(`${base}/launcher/obs.html`);
  await expect(page.locator('html')).toHaveAttribute('data-ff-theme', 'ember');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${base}/gallery/#/hud?phase=playing&nofonts=1`);
  await expect(page.locator('[data-panel="gauge"]')).toBeVisible();
  const geometry = () => page.locator('[data-panel]:not([hidden])').evaluateAll(nodes => nodes.map(n => [n.dataset.panel, n.style.left, n.style.top, n.getBoundingClientRect().width, n.getBoundingClientRect().height]));
  const before = await geometry();
  for (const theme of ['abyss', 'daylight', 'ember', 'signal']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-ff-theme', theme);
    expect(await geometry()).toEqual(before);
    await page.screenshot({ path: `test-results/v6-${theme}-hud.png`, fullPage: true });
  }
  const colors = await page.locator('.zone-sweet').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(colors).toBe('rgb(86, 180, 233)');
  expect(errors).toEqual([]);
  console.log('PASS: four previews, selection, clipboard IDs, JSON, Signal colors, fixed HUD positions/sizes, narrow launcher, OBS override/default.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
