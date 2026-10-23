import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.env.FLASHFRONT_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('test-results', { recursive: true });
try {
  const start = new Date('2026-10-18T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  await page.goto(`${base}/#/hud?phase=spawn&map=World`);
  const canvas = page.locator('.spawn-heat canvas');
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('[data-panel="spawn"]')).toHaveCount(0);
  const geometry = async () => {
    const tint = await canvas.boundingBox(); const map = await page.locator('.spawn-preview-map').boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(tint[key] - map[key])).toBeLessThan(0.1);
  };
  await geometry();
  const alphas = await canvas.evaluate(el => {
    const bytes = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    const values = new Set(); for (let i = 3; i < bytes.length; i += 4) values.add(bytes[i]);
    return [...values].sort((a, b) => a - b);
  });
  expect(alphas).toEqual([0, 82]);
  await page.clock.fastForward(6000);
  await expect(page.getByLabel('Landed mock player', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Your mock spawn', { exact: true })).toHaveCount(1);
  await page.locator('.hud-stage').screenshot({ path: 'test-results/heatmap-world.png' });
  await page.clock.fastForward(11_000);
  await geometry();
  await expect(page.locator('.spawn-heat')).toHaveCSS('opacity', '0.6');
  await page.locator('.hud-stage').screenshot({ path: 'test-results/heatmap-fade.png' });
  await page.clock.fastForward(3000);
  await expect(page.locator('.spawn-heat')).toHaveCount(0);
  await page.clock.fastForward(5000);
  await expect(canvas).toHaveCount(1);
  await page.goto(`${base}/#/hud?phase=spawn&map=Iceland&size=Compact`);
  await expect(canvas).toHaveCount(1); await geometry();
  await page.locator('.hud-stage').screenshot({ path: 'test-results/heatmap-compact.png' });
  await page.goto(`${base}/#/hud?phase=spawn&map=Unknown`);
  await expect(page.getByText('No spawn heat data for this map yet.')).toBeVisible();
  await expect(canvas).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('Heat map browser smoke passed: mask, alignment, pan/zoom, landings, fade, end, repeat, Compact, missing grid.');
} finally { await browser.close(); }
