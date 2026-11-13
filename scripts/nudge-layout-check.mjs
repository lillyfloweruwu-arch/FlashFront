import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { NUDGE_LINES, nudgeLine } from '../packages/core/src/nudge-lines.ts';
// A local Chromium fixture only: no Electron, game, profile or launcher settings are opened.
const requireUi = createRequire(new URL('../packages/ui/package.json', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 340, height: 88 }, reducedMotion: 'reduce' });
  const css = await readFile('apps/launcher/src/renderer/src/nudge.css', 'utf8');
  const font = await readFile(requireUi.resolve('@fontsource/inter/files/inter-latin-500-normal.woff2'));
  await page.setContent(`<style>@font-face { font-family: Inter; font-style: normal; font-weight: 500; src: url(data:font/woff2;base64,${font.toString('base64')}); }${css}</style><div id="nudge"></div>`);
  await page.evaluate(() => document.fonts.load('500 14px Inter'));
  const clipped = [];
  let checked = 0;
  for (const [kind, entry] of Object.entries(NUDGE_LINES)) {
    for (let pick = 0; pick < entry.lines.length; pick++) {
      const text = nudgeLine(kind, 'fixture', { incoming: '160K', troops: '200K', percent: 18, floor: 35, pick });
      for (const anchor of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']) {
        const metrics = await page.evaluate(({ text, urgent, anchor }) => {
          const el = document.getElementById('nudge');
          el.className = `nudge anchor-${anchor}${urgent ? ' urgent' : ''}`;
          el.textContent = text;
          const b = el.getBoundingClientRect();
          return { height: el.clientHeight, content: el.scrollHeight, x: b.x, y: b.y, right: b.right, bottom: b.bottom };
        }, { text, anchor, urgent: ['danger', 'allianceEnding', 'noPosts'].includes(kind) });
        checked++;
        if (metrics.content > metrics.height || metrics.x < 0 || metrics.y < 0 || metrics.right > 340 || metrics.bottom > 88) clipped.push({ kind, pick, anchor, ...metrics });
      }
    }
  }
  assert.equal(clipped.length, 0, `Coach text clipped: ${JSON.stringify(clipped.slice(0, 3))}`);
  console.log(`${checked} coach line/anchor layouts fit without clipping.`);
} finally { await browser.close(); }
