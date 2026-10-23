import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.FLASHFRONT_URL ?? 'http://127.0.0.1:5173';
const browser = process.env.FLASHFRONT_CDP_URL
  ? await chromium.connectOverCDP(process.env.FLASHFRONT_CDP_URL)
  : await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
const errors = [];
const external = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', request => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) external.add(request.url()); });
await mkdir('test-results', { recursive: true });
const visit = async path => { await page.goto(`${base}/#${path}`); await page.locator('#root').waitFor(); };
const capture = async name => { await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }); };
try {
  await visit('/');
  await expect(page.getByRole('heading', { name: 'Read the field. Plan your next move.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px Inter') && document.fonts.check('24px "Antonio Variable"'))).toBe(true);
  await capture('landing-desktop');

  await visit('/hud?phase=playing');
  await expect(page.locator('[data-panel]')).toHaveCount(10);
  expect(await page.locator('.hud-layer').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.locator('[data-panel]:not([hidden])')).toHaveCount(8);
  await expect(page.locator('[data-panel="opening"]')).toContainText('Ally a neighbour');
  await expect(page.locator('[data-panel="trade"]')).toContainText('Share of gold this match');
  await expect(page.locator('[data-panel="goal"]')).toContainText('Stay under 70% of max');
  await expect(page.locator('[data-panel="attack"]')).toContainText('Max send that keeps 35%');
  await page.getByRole('button', { name: 'Edit HUD', exact: true }).click();
  await page.getByRole('button', { name: 'Show Match overview', exact: true }).click();
  await page.getByRole('button', { name: 'Finish editing' }).click();
  const initial = await page.locator('[data-panel="clock"] .clock').innerText();
  await page.getByLabel('Simulation speed').selectOption('20');
  await expect(page.locator('[data-panel="clock"] .clock')).not.toHaveText(initial);
  await page.keyboard.press('Control+Alt+H');
  await expect(page.locator('.hud-layer')).toBeHidden();
  await page.keyboard.press('Control+Alt+E');
  await expect(page.getByRole('button', { name: 'Move Match overview' })).toBeVisible();
  const handle = page.getByRole('button', { name: 'Move Match overview' });
  const bounds = await handle.boundingBox();
  await page.mouse.move(bounds.x + 35, bounds.y + 10);
  await page.mouse.down(); await page.mouse.move(bounds.x + 125, bounds.y + 55, { steps: 5 }); await page.mouse.up();
  const moved = await page.locator('[data-panel="clock"]').evaluate(el => ({ x: el.style.left, y: el.style.top }));
  expect(parseFloat(moved.x)).toBeGreaterThan(30);
  await page.getByLabel('Match overview opacity').fill('0.65');
  await page.getByRole('button', { name: 'Collapse Troop growth' }).click();
  await page.reload();
  await expect(page.locator('[data-panel="clock"]')).toHaveCSS('opacity', '0.65');
  expect(await page.locator('[data-panel="clock"]').evaluate(el => ({ x: el.style.left, y: el.style.top }))).toEqual(moved);
  await expect(page.locator('[data-panel="gauge"] .hud-panel-content')).toBeHidden();
  await page.getByRole('button', { name: 'Edit HUD', exact: true }).click();
  await page.getByRole('button', { name: 'Expand Troop growth' }).click();
  await page.getByLabel('Match overview opacity').fill('1');
  await page.getByRole('button', { name: 'Finish editing' }).click();
  await page.getByLabel('Simulation seed').fill('73'); await page.getByRole('button', { name: 'Apply seed' }).click();
  await page.getByLabel('Simulation speed').selectOption('20');
  await expect(page.locator('[data-panel="clock"] .clock')).not.toHaveText('0:00');
  await capture('hud-desktop');

  await visit('/stream');
  await expect(page.locator('[data-widget]')).toHaveCount(5);
  await expect(page.locator('[data-widget="stats"] svg')).toHaveCount(4);
  await capture('stream-desktop');
  await visit('/stream/obs?widgets=card,top&scale=0.75&anchor=br');
  await expect(page.locator('[data-widget]')).toHaveCount(2);
  await expect(page.locator('.stream-obs')).toHaveClass(/anchor-br/);
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('.site-header')).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 }); await capture('obs-transparent');
  await visit('/stream/obs?widgets=card,stats,top,lobby,result&scale=1&anchor=tl');
  await expect(page.locator('[data-widget]')).toHaveCount(5);
  const resultBox = await page.locator('[data-widget="result"]').boundingBox();
  expect(resultBox.y + resultBox.height).toBeLessThanOrEqual(1080);

  await page.setViewportSize({ width: 1440, height: 1080 });
  await visit('/stats');
  await expect(page.locator('.match-table tbody tr')).toHaveCount(20);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.getByRole('button', { name: /Placement/ }).click();
  await expect(page.locator('.match-table tbody tr').first()).toContainText('#1');
  await page.locator('.chart svg').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tooltip')).toBeVisible();
  await capture('stats-desktop');
  await page.locator('.match-table tbody a').first().click();
  await expect(page.getByRole('heading', { name: 'Buildings constructed' })).toBeVisible();
  await expect(page.locator('.detail .chart > svg')).toHaveCount(3);
  await capture('match-detail-desktop');
  await visit('/stats/match/missing'); await expect(page.getByRole('heading', { name: 'Match not found' })).toBeVisible();
  await visit('/missing'); await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => localStorage.clear());
  await visit('/hud?nofonts=1&phase=playing');
  await expect(page.locator('[data-panel]:not([hidden])')).toHaveCount(8);
  await expect(page.locator('style[data-flashfront-fonts]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show game UI zones' }).check();
  await expect(page.locator('[data-game-zone]')).toHaveCount(6);
  const rectangles = await page.evaluate(() => ({
    panels: [...document.querySelectorAll('[data-panel]:not([hidden])')].map(el => ({ id: el.dataset.panel, ...el.getBoundingClientRect().toJSON() })),
    zones: [...document.querySelectorAll('[data-game-zone]')].map(el => ({ id: el.dataset.gameZone, ...el.getBoundingClientRect().toJSON() })),
  }));
  for (const panel of rectangles.panels) for (const zone of rectangles.zones) {
    expect(panel.x < zone.right && panel.right > zone.x && panel.y < zone.bottom && panel.bottom > zone.y, `${panel.id} overlaps ${zone.id}`).toBe(false);
  }
  await capture('hud-v1-nofonts-zones');
  await page.clock.install();
  await page.getByLabel('Simulation seed').fill('123'); await page.getByRole('button', { name: 'Apply seed' }).click();
  await page.getByLabel('Simulation speed').selectOption('20');
  await page.clock.runFor(19_500);
  await expect(page.locator('.growth-gauge')).toHaveAttribute('data-zone', 'wasting');
  await expect(page.locator('.idle-gold')).toContainText('+250K max troops');
  await capture('hud-v1-wasting');
  await page.clock.runFor(3300);
  await expect(page.locator('.growth-gauge')).toHaveAttribute('data-zone', 'exposed');
  await expect(page.locator('.attack-preview')).toContainText('This push leaves you exposed.');
  await expect(page.locator('.attack-preview')).toContainText('Incoming 13.0K from RetroCityUKF');
  for (const panel of await page.locator('[data-panel]:not([hidden])').all()) {
    expect(await panel.evaluate(el => el.scrollHeight <= el.clientHeight), 'panel content fits its bounds').toBe(true);
  }
  await capture('hud-v1-exposed');
  await page.goto(`${base}/#/hud`);
  await expect(page.locator('style[data-flashfront-fonts]')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await capture('hud-v1-fonts');

  await page.evaluate(() => localStorage.clear());
  for (const map of ['World', 'Iceland', 'Europe', 'Four Islands']) {
    await visit(`/hud?phase=spawn&map=${encodeURIComponent(map)}`);
    await expect(page.locator('.spawn-marker')).toHaveCount(3);
    await expect(page.locator('.spawn-coordinate')).toHaveCount(3);
    for (const label of await page.locator('.spawn-coordinate').allTextContents()) expect(label).toMatch(/Top \d+% of this map/);
    await expect(page.locator('.spawn-why')).toHaveAttribute('title', 'Players with more cheap land within ~120 tiles did better; being next to an AI nation did worse.');
    await expect(page.locator('.spawn-footer')).toHaveText('Map data © OpenFront contributors, CC BY-SA 4.0');
    await expect(page.locator('[data-panel="gauge"]')).toBeHidden();
    await expect(page.locator('[data-panel="attack"]')).toBeHidden();
    await expect(page.locator('.spawn-minimap img')).toBeVisible();
    expect(await page.locator('.spawn-minimap img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.locator('[data-panel="spawn"]').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    await capture(`spawn-${map.toLowerCase().replaceAll(' ', '-')}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [name, route] of [['landing', '/'], ['hud', '/hud?phase=playing'], ['stream', '/stream'], ['stats', '/stats']]) {
    await visit(route);
    if (route === '/stats') await expect(page.locator('.match-table tbody tr')).toHaveCount(20);
    if (name === 'hud') await expect(page.locator('[data-panel]')).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capture(`${name}-mobile`);
  }
  expect(errors).toEqual([]);
  expect([...external]).toEqual([]);
  console.log('PASS: all routes; live simulation; HUD toggle/edit/drag/collapse/opacity/persistence; stream filters/scale/anchors/transparency; OBS 1080p fit; sorting; chart keyboard tooltip; mobile widths; reduced motion; bundled fonts; v1 UI zones; font fallback; wasting/exposed arc; incoming attacks; idle gold.');
  console.log('Console/page/request errors: 0. External asset requests: 0. Screenshots: test-results/*.png');
} finally {
  await context.close();
  await browser.close();
}
