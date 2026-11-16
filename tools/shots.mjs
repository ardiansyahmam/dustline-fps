// DUSTLINE — screenshot tool: serves nothing itself, just drives the game
// in headless Chromium (Playwright) and saves JPEGs per shots.json.
// Usage: node tools/shots.mjs [port] [only-name-substring]

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/custom-skills/claude-animation-kit/node_modules/playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const port = Number(process.argv[2] || 8080);
const only = process.argv[3] || '';
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));

for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  const url = `http://127.0.0.1:${port}/${shot.query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__dustlineReady === true, null, { timeout: 20000 });
  } catch {
    console.log(`[warn] ${shot.name}: __dustlineReady never fired`);
  }
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ type: 'jpeg', quality: 82 });
  const out = join(root, 'screenshots', shot.name);
  writeFileSync(out, buf);
  console.log(`${shot.name}: ${buf.length} bytes`);
}
await browser.close();
console.log('done');
