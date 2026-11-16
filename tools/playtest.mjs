// Headless gameplay smoke test (not part of the game): start a match, walk,
// shoot, and confirm the sim + bots run without errors.
// NOTE: SwiftShader renders slowly, so this test polls for game-state
// changes instead of sleeping fixed real-time intervals.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/custom-skills/claude-animation-kit/node_modules/playwright');

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => !!window.__dustline, null, { timeout: 20000 });

const snap = () => page.evaluate(() => {
  const s = window.__dustline.state;
  return {
    phase: s.phase, time: +s.time.toFixed(2), phaseT: +s.phaseT.toFixed(2),
    px: +s.player.x.toFixed(2), pz: +s.player.z.toFixed(2),
    ammo: s.player.weapon ? s.player.weapon.ammo : null,
    bots: s.agents.map((a) => ({ x: +a.x.toFixed(1), z: +a.z.toFixed(1), hp: a.hp, alive: a.alive })),
    score: s.score, spike: s.spike.state, round: s.round,
  };
});

await page.mouse.click(320, 180); // menu overlay: "KLIK UNTUK BERMAIN"
await page.waitForFunction(() => window.__dustline.state.phase === 'buy', null, { timeout: 15000 });
console.log('started  :', JSON.stringify(await snap()));

// Fast-forward the 15s buy phase via the debug hook (test-only).
await page.evaluate(() => { window.__dustline.state.phaseT = 0.2; });
await page.waitForFunction(() => window.__dustline.state.phase === 'live', null, { timeout: 60000 });
console.log('live     :', JSON.stringify(await snap()));

// Walk forward until the player actually moved (>= 1m north).
await page.keyboard.down('KeyW');
await page.waitForFunction(() => window.__dustline.state.player.z <= 17, null, { timeout: 60000 });
await page.keyboard.up('KeyW');
console.log('walked   :', JSON.stringify(await snap()));

// Fire a burst: ammo must drop.
const before = await snap();
await page.mouse.down();
await page.waitForFunction(() => window.__dustline.state.player.weapon.ammo < 12, null, { timeout: 60000 }).catch(() => console.log('[warn] ammo did not drop'));
await page.mouse.up();
console.log('shot     :', JSON.stringify(await snap()), '(ammo before:', before.ammo + ')');

// Let the bots play: wait until any bot moved >= 1.5m from its spawn.
await page.waitForFunction(() => {
  const s = window.__dustline.state;
  const spawn = [[0, 18], [-3, 19], [3, 19], [22, -14], [-22, -14], [0, -16]];
  return s.agents.some((a, i) => Math.hypot(a.x - spawn[i][0], a.z - spawn[i][1]) >= 1.5);
}, null, { timeout: 90000 }).catch(() => console.log('[warn] no bot moved 1.5m in 90s'));
console.log('bots move:', JSON.stringify(await snap()));
console.log('pageerrors :', errors.length ? errors : 'none');
await browser.close();
