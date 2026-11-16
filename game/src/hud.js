// DUSTLINE — HUD: DOM overlay (crosshair, bars, timers, feed, banners,
// buy menu, scoreboard). Reads state only; the sim never touches the DOM.
// Cheap updates: text is rewritten only when it changes.

import { WEAPONS, ARMOR_PRICE, FRAG_PRICE, SMOKE_PRICE, buyItem, currentSpread } from './weapons.js';
import { PHASE, TEAM } from './state.js';

const BUY_ITEMS = [
  { id: 'vulture', name: 'Vulture AR-7', desc: 'Rifle seimbang — andalan', price: WEAPONS.vulture.price, key: '1' },
  { id: 'dune', name: 'Dune-47', desc: 'Damage besar, recoil besar', price: WEAPONS.dune.price, key: '2' },
  { id: 'kestrel', name: 'Kestrel-9', desc: 'SMG cepat, jarak dekat', price: WEAPONS.kestrel.price, key: '3' },
  { id: 'breacher', name: 'Breacher-12', desc: 'Shotgun — mematikan dekat', price: WEAPONS.breacher.price, key: '4' },
  { id: 'armor', name: 'Vest Anti-Peluru', desc: 'Armor +50', price: ARMOR_PRICE, key: '5' },
  { id: 'frag', name: 'Spark Frag', desc: 'Granat ledak', price: FRAG_PRICE, key: '6' },
  { id: 'smoke', name: 'Dust Charge', desc: 'Granat asap', price: SMOKE_PRICE, key: '7' },
];

function el(id) { return document.getElementById(id); }
function setText(node, text) { if (node && node._t !== text) { node._t = text; node.textContent = text; } }

export function createHud(state) {
  const hud = {
    buyOpen: false,
    lastFeed: '',
    lastAmmo: '',
  };
  state.buyOpen = false;

  // Build the buy menu.
  const itemsEl = el('buy-items');
  for (const item of BUY_ITEMS) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-key">${item.key}</span>
      <span class="buy-name">${item.name}</span>
      <span class="buy-desc">${item.desc}</span>
      <span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => {
      const msg = buyItem(state, item.id);
      setText(el('buy-msg'), msg === 'ok' ? `${item.name} dibeli.` : msg);
      refreshBuy(state);
    });
    itemsEl.appendChild(row);
  }
  // Buy hotkeys 1-7 while the menu is open.
  window.addEventListener('keydown', (e) => {
    if (!hud.buyOpen) return;
    const item = BUY_ITEMS.find((b) => b.key === e.code.replace('Digit', ''));
    if (!item) return;
    const msg = buyItem(state, item.id);
    setText(el('buy-msg'), msg === 'ok' ? `${item.name} dibeli.` : msg);
    refreshBuy(state);
  });

  function refreshBuy(s) {
    document.querySelectorAll('.buy-row').forEach((row) => {
      const item = BUY_ITEMS.find((b) => b.id === row.dataset.id);
      const owned = item.id !== 'armor' && item.id !== 'frag' && item.id !== 'smoke'
        && s.player.weapons[0] && s.player.weapons[0].def.id === item.id;
      row.classList.toggle('cant', s.money < item.price && !owned);
      row.classList.toggle('owned', !!owned);
    });
    setText(el('buy-money'), `$${s.money}`);
  }
  hud.refreshBuy = refreshBuy;

  hud.toggleBuy = (force) => {
    const want = force !== undefined ? force : !hud.buyOpen;
    if (want && state.phase !== PHASE.BUY) return;
    hud.buyOpen = want;
    state.buyOpen = want;
    el('buy').classList.toggle('open', want);
    if (want) refreshBuy(state);
  };
  return hud;
}

export function updateHud(hud, state) {
  const p = state.player;
  const input = state.input;

  // Buy menu toggle (B).
  if (input.buy) hud.toggleBuy();

  // Timer.
  const t = Math.max(0, Math.ceil(state.phaseT));
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  setText(el('timer'), state.phase === PHASE.LIVE || state.phase === PHASE.BUY ? `${mm}:${ss}` : '—');
  el('timer').classList.toggle('urgent', state.phase === PHASE.LIVE && t <= 10);
  setText(el('phase-label'), { menu: 'MENU', buy: 'FASE BELI', live: 'RONDE ' + state.round, end: 'RONDE SELESAI', match: 'SELESAI' }[state.phase]);

  // Score + alive.
  setText(el('score-atk'), String(state.score[TEAM.ATK]));
  setText(el('score-def'), String(state.score[TEAM.DEF]));
  const aliveAtk = state.agents.filter((a) => a.team === TEAM.ATK && a.alive).length;
  const aliveDef = state.agents.filter((a) => a.team === TEAM.DEF && a.alive).length;
  setText(el('alive-atk'), '●'.repeat(aliveAtk) + '○'.repeat(3 - aliveAtk));
  setText(el('alive-def'), '●'.repeat(aliveDef) + '○'.repeat(3 - aliveDef));

  // Health / armor / ammo / money.
  el('health-bar').style.width = `${Math.max(0, p.hp)}%`;
  el('health-bar').classList.toggle('low', p.hp <= 30);
  setText(el('health-num'), String(Math.max(0, Math.ceil(p.hp))));
  setText(el('armor-num'), String(Math.ceil(p.armor)));
  const w = p.weapon;
  const ammo = w ? `${w.ammo} / ${w.reserve}` : '—';
  setText(el('ammo'), ammo);
  setText(el('weapon-name'), w ? w.def.name : '—');
  setText(el('money'), `$${state.money}`);
  setText(el('grenades'), `Frag ${p.grenades.frag} · Smoke ${p.grenades.smoke}`);

  // Crosshair spread.
  const spread = w ? currentSpread(p) : 0.02;
  const gap = 7 + spread * 420 + p.spread * 260;
  el('crosshair').style.setProperty('--sp', `${gap.toFixed(1)}px`);
  el('crosshair').style.display = (hud.buyOpen || state.phase === PHASE.MENU || state.phase === PHASE.MATCH || !p.alive) ? 'none' : 'block';

  // Hitmarker + damage vignette.
  el('hitmarker').classList.toggle('show', state.hitmark > 0);
  el('hitmarker').classList.toggle('kill', state.hitmarkKill);
  el('vignette').style.opacity = String(Math.min(0.85, p.flash * 3 + (p.hp <= 25 && p.alive ? 0.25 : 0)));

  // Bomb status.
  const sp = state.spike;
  let bombText = 'Spike: dibawa';
  if (sp.state === 'planted') bombText = `SPIKE DITANAM — ${Math.ceil(sp.timer)} dtk`;
  else if (sp.state === 'planting') bombText = 'Menanam spike…';
  else if (sp.state === 'defusing') bombText = 'Musuh menjinakkan spike!';
  else if (sp.state === 'dropped') bombText = 'Spike terjatuh — ambil!';
  else if (sp.state === 'exploded') bombText = 'Spike meledak';
  else if (sp.state === 'defused') bombText = 'Spike dijinakkan';
  setText(el('bomb-status'), bombText);
  el('bomb-status').classList.toggle('danger', sp.state === 'planted');

  // Plant / defuse progress.
  const prog = el('progress');
  if (sp.state === 'planting' || sp.state === 'defusing') {
    prog.style.display = 'block';
    setText(el('progress-label'), sp.state === 'planting' ? 'MENANAM SPIKE…' : 'SPIKE DIJINAKKAN MUSUH…');
    el('progress-bar').style.width = `${Math.round(sp.progress * 100)}%`;
  } else {
    prog.style.display = 'none';
  }

  // Kill feed.
  const feedStr = state.feed.join('\n');
  if (feedStr !== hud.lastFeed) {
    hud.lastFeed = feedStr;
    el('feed').innerHTML = state.feed.map((f) => `<div>${f}</div>`).join('');
  }

  // Banner.
  const banner = el('banner');
  banner.classList.toggle('show', state.bannerT > 0);
  if (state.bannerT > 0) {
    setText(el('banner-title'), state.banner);
    setText(el('banner-sub'), state.bannerSub);
  }

  // Buy hint.
  el('buy-hint').style.display = state.phase === PHASE.BUY && !hud.buyOpen ? 'block' : 'none';

  // Overlays.
  el('menu').classList.toggle('show', state.phase === PHASE.MENU);
  el('match').classList.toggle('show', state.phase === PHASE.MATCH);
  if (state.phase === PHASE.MATCH) {
    setText(el('match-title'), state.matchWinner === TEAM.ATK ? 'KEMENANGAN!' : 'KEKALAHAN');
    setText(el('match-sub'), `Skor akhir ${state.score[0]} — ${state.score[1]} · Klik untuk main lagi`);
  }

  // Scoreboard (Tab).
  el('scoreboard').classList.toggle('show', !!input.score);
  if (input.score) {
    el('score-rows').innerHTML = state.agents.map((a) => {
      const team = a.team === TEAM.ATK ? 'PENYERANG' : 'BERTAHAN';
      const st = a.alive ? `${Math.ceil(a.hp)} HP` : 'TEWAS';
      return `<tr><td>${a.name}</td><td>${team}</td><td>${a.weapon ? a.weapon.def.name : '—'}</td><td>${st}</td></tr>`;
    }).join('');
  }

  // Buy menu money line.
  if (hud.buyOpen) setText(el('buy-money'), `$${state.money}`);
}
