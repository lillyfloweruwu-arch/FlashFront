import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Local renderer fixtures only. No Electron main process or game is started.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results/v8', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173');
  await page.evaluate(async base => {
    const React = await import('/node_modules/.vite/deps/react.js');
    const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { HudRoot } = await import(`${base}/packages/ui/src/hud/HudRoot.tsx`);
    const { MockDataSource } = await import(`${base}/packages/core/src/index.ts`);
    const { applyTheme } = await import(`${base}/packages/ui/src/themes.ts`);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;background:#30363A;z-index:9999';
    document.body.append(host);
    document.documentElement.classList.add('ff-static');
    const root = createRoot(host); const s = new MockDataSource().getSnapshot();
    s.phase = 'playing'; s.elapsedSec = 100; s.tick = 1000; s.map = 'World';
    Object.assign(s.self, { troops: 3070000, maxTroops: 3810000, gold: 200000,
      incomingAttacks: [{ from: 'Incoming attack', troops: 3000000 }] });
    const store = { load: () => null, save() {} };
    window.v8Render = (theme, edit = false, signal = 0) => { applyTheme(document.documentElement, theme); root.render(React.createElement(HudRoot, { snapshot: { ...s }, layoutStore: store, editMode: edit, snoozeSignal: signal })); };
    window.v8Render('abyss');
  }, `/@fs/${resolve('.').replaceAll('\\', '/')}`);
  await expect(page.locator('.decision-card')).toContainText('Big attack');
  for (const theme of ['abyss', 'signal']) {
    await page.evaluate(theme => window.v8Render(theme), theme);
    await page.screenshot({ path: `test-results/v8/hud-${theme}.png` });
    const rects = await page.locator('[data-panel]:visible').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { id: el.dataset.panel, x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    console.log(theme, JSON.stringify(rects));
    for (const r of rects) expect(r.y + r.height, `${theme} ${r.id}`).toBeLessThanOrEqual(1080);
    expect(await page.locator('.decision-card button').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  }
  await page.evaluate(() => window.v8Render('abyss', true));
  await page.getByRole('button', { name: /Snooze 2 min/ }).click();
  await expect(page.locator('.decision-card')).not.toContainText('Big attack');
  expect(errors).toEqual([]);
} finally { await browser.close(); }
