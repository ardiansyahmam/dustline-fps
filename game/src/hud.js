// DUSTLINE — HUD: DOM overlay (crosshair, bars, timers, feed, banners,
// buy menu, scoreboard). Reads state only; the sim never touches the DOM.
import { WEAPONS, ARMOR_PRICE, HELMET_PRICE, KIT_PRICE, BLINK_PRICE, HAZE_PRICE, buyItem, currentSpread } from './weapons.js';
import { PHASE, TEAM } from './state.js';

// Buy menu — card grid: name + role on top, weapon silhouette middle,
// BIG price + orange BUY button. Unaffordable items dim; equipped gets
// an EQUIPPED badge. Keys 1-5 weapons, 6-9/0 the rest (buy phase is 12 s).
const BUY_ITEMS = [
  { id: 'vesper', name: 'Vesper-9', desc: 'SMG — close entry', price: WEAPONS.vesper.price, key: '1', art: 'smg', color: '#2fd8c8', scope: '1x — iron sights' },
  { id: 'talon', name: 'Talon-5', desc: 'Rifle — all-rounder', price: WEAPONS.talon.price, key: '2', art: 'rifle', color: '#ff7a2e', scope: '2x' },
  { id: 'cinder', name: 'Cinder .50', desc: 'Magnum — one hard hit', price: WEAPONS.cinder.price, key: '3', art: 'magnum', color: '#ffc93c', scope: '2x' },
  { id: 'brine', name: 'Brine-12', desc: 'Shotgun — deadly up close', price: WEAPONS.brine.price, key: '4', art: 'shotgun', color: '#e8402e', scope: '1x — iron sights' },
  { id: 'rift', name: 'Rift-47', desc: 'Rifle — heavy damage', price: WEAPONS.rift.price, key: '5', art: 'rifle2', color: '#9ab83c', scope: '3x' },
  { id: 'armor', name: 'Bulletproof Vest', desc: 'Armor +50', price: ARMOR_PRICE, key: '6', art: 'vest', color: '#2fa8a0' },
  { id: 'helmet', name: 'Helmet', desc: 'Headshot −35%', price: HELMET_PRICE, key: '7', art: 'helmet', color: '#c9a86a' },
  { id: 'kit', name: 'Defuse Kit', desc: 'Defuse in 4s', price: KIT_PRICE, key: '8', art: 'kit', color: '#37c978' },
  { id: 'blink', name: 'Blink Flash', desc: 'Flash grenade — blinds', price: BLINK_PRICE, key: '9', art: 'blink', color: '#ffd27a' },
  { id: 'haze', name: 'Haze Smoke', desc: 'Smoke grenade — 5 m radius', price: HAZE_PRICE, key: '0', art: 'haze', color: '#cfc4b0' },
];

// Siluet item digambar sebagai SVG sebaris (tanpa file eksternal).
function buyArt(kind) {
  const F = 'fill="currentColor"';
  if (kind === 'smg') return `<svg viewBox="0 0 120 48" width="120" height="48"><g ${F}><rect x="18" y="20" width="86" height="5"/><rect x="26" y="15" width="42" height="10"/><rect x="96" y="17" width="16" height="9"/><polygon points="44,25 52,25 50,40 42,40"/><polygon points="58,25 66,25 64,42 56,42"/><rect x="66" y="11" width="10" height="4"/></g></svg>`;
  if (kind === 'rifle') return `<svg viewBox="0 0 120 48" width="120" height="48"><g ${F}><rect x="6" y="20" width="104" height="5"/><rect x="34" y="15" width="46" height="10"/><polygon points="80,15 110,19 110,28 80,25"/><polygon points="48,25 56,25 54,39 46,39"/><polygon points="62,25 72,25 70,41 60,41"/><rect x="44" y="11" width="8" height="4"/></g></svg>`;
  if (kind === 'rifle2') return `<svg viewBox="0 0 120 48" width="120" height="48"><g ${F}><rect x="6" y="20" width="104" height="5"/><rect x="34" y="15" width="46" height="10"/><polygon points="80,15 110,19 110,28 80,25"/><polygon points="48,25 56,25 54,39 46,39"/><polygon points="62,25 74,25 70,42 58,42"/><rect x="44" y="11" width="8" height="4"/></g></svg>`;
  if (kind === 'magnum') return `<svg viewBox="0 0 120 48" width="120" height="48"><g ${F}><rect x="28" y="16" width="58" height="7"/><rect x="28" y="23" width="40" height="4"/><polygon points="42,27 54,27 50,43 40,43"/><rect x="78" y="12" width="6" height="5"/></g></svg>`;
  if (kind === 'shotgun') return `<svg viewBox="0 0 120 48" width="120" height="48"><g ${F}><rect x="4" y="19" width="110" height="4"/><rect x="4" y="24" width="110" height="3"/><rect x="52" y="27" width="26" height="6"/><polygon points="82,27 110,27 110,32 82,32"/><polygon points="40,30 48,30 46,42 38,42"/><rect x="30" y="14" width="8" height="5"/></g></svg>`;
  if (kind === 'vest') return `<svg viewBox="0 0 48 48" width="48" height="48"><g ${F}><path d="M12 6h24v8h6v28H6V14h6z"/><rect x="14" y="18" width="20" height="3" fill="#0c0906" opacity="0.35"/><rect x="14" y="28" width="20" height="3" fill="#0c0906" opacity="0.35"/></g></svg>`;
  if (kind === 'helmet') return `<svg viewBox="0 0 48 48" width="48" height="48"><g ${F}><path d="M6 32a18 18 0 0 1 36 0v2H6z"/><rect x="4" y="32" width="40" height="5"/></g></svg>`;
  if (kind === 'kit') return `<svg viewBox="0 0 48 48" width="48" height="48"><g ${F}><rect x="6" y="12" width="36" height="28" rx="3"/><rect x="20" y="20" width="8" height="16" fill="#0c0906" opacity="0.4"/><rect x="16" y="24" width="16" height="8" fill="#0c0906" opacity="0.4"/></g></svg>`;
  if (kind === 'blink') return `<svg viewBox="0 0 48 48" width="48" height="48"><g ${F}><polygon points="24,2 28,18 44,18 31,27 36,43 24,33 12,43 17,27 4,18 20,18"/></g></svg>`;
  return `<svg viewBox="0 0 48 48" width="48" height="48"><g ${F}><ellipse cx="16" cy="30" rx="11" ry="9"/><ellipse cx="26" cy="24" rx="12" ry="11"/><ellipse cx="35" cy="31" rx="9" ry="8"/></g></svg>`;
}

const fmtMoney = (n) => '$' + n.toLocaleString('en-US');

function el(id) { return document.getElementById(id); }
function setText(node, text) { if (node && node._t !== text) { node._t = text; node.textContent = text; } }

export function createHud(state) {
  const hud = {
    buyOpen: false,
    lastFeed: '',
    lastAmmo: '',
  };
  state.buyOpen = false;

  // Build the buy menu (card grid).
  const itemsEl = el('buy-items');
  for (const item of BUY_ITEMS) {
    const card = document.createElement('div');
    card.className = 'buy-card';
    card.dataset.id = item.id;
    card.innerHTML = `<span class="buy-key">${item.key}</span>
      <span class="buy-badge">EQUIPPED</span>
      <div class="buy-name">${item.name}</div>
      <div class="buy-desc">${item.desc}</div>
      ${item.scope ? `<div class="buy-scope">Scope ${item.scope}</div>` : ''}
      <div class="buy-art" style="color:${item.color}">${buyArt(item.art)}</div>
      <div class="buy-price">${fmtMoney(item.price)}</div>
      <button class="buy-btn" tabindex="-1">BUY</button>`;
    card.style.borderTop = `3px solid ${item.color}`;
    card.addEventListener('click', () => {
      const msg = buyItem(state, item.id);
      setText(el('buy-msg'), msg === 'ok' ? `${item.name} bought.` : msg);
      refreshBuy(state);
    });
    itemsEl.appendChild(card);
  }
  // Buy hotkeys 1-9, 0 while the menu is open; Esc closes it (B11).
  window.addEventListener('keydown', (e) => {
    if (!hud.buyOpen) return;
    if (e.code === 'Escape') { hud.toggleBuy(false); return; }
    const item = BUY_ITEMS.find((b) => b.key === e.code.replace('Digit', ''));
    if (!item) return;
    const msg = buyItem(state, item.id);
    setText(el('buy-msg'), msg === 'ok' ? `${item.name} bought.` : msg);
    refreshBuy(state);
  });

  function refreshBuy(s) {
    document.querySelectorAll('.buy-card').forEach((card) => {
      const item = BUY_ITEMS.find((b) => b.id === card.dataset.id);
      const p = s.player;
      let owned = false, maxed = false;
      if (item.id === 'helmet') owned = p.helmet;
      else if (item.id === 'kit') owned = p.kit;
      else if (item.id === 'armor') owned = p.armor >= 100;
      else if (item.id === 'blink') maxed = p.grenades.blink >= 2;
      else if (item.id === 'haze') maxed = p.grenades.haze >= 2;
      else owned = !!(p.weapons[0] && p.weapons[0].def.id === item.id);
      const cant = (s.money < item.price && !owned) || maxed;
      card.classList.toggle('cant', cant);
      card.classList.toggle('owned', owned);
      const btn = card.querySelector('.buy-btn');
      btn.textContent = owned ? 'EQUIPPED' : maxed ? 'FULL' : cant ? 'NOT ENOUGH MONEY' : 'BUY';
    });
    el('buy-money').innerHTML = `<small>MONEY</small> ${fmtMoney(s.money)}`;
  }
  hud.refreshBuy = refreshBuy;

  hud.toggleBuy = (force) => {
    const want = force !== undefined ? force : !hud.buyOpen;
    if (want && state.phase !== PHASE.BUY) return;
    hud.buyOpen = want;
    state.buyOpen = want;
    el('buy').classList.toggle('open', want);
    // Pointer lock (B10): free the cursor while shopping so cards can
    // be clicked, re-lock when the shop closes (buy/live only).
    if (want) { refreshBuy(state); document.exitPointerLock(); }
    else if (state.phase === PHASE.BUY || state.phase === PHASE.LIVE) {
      const r = el('game').requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    }
  };
  return hud;
}

export function updateHud(hud, state) {
  const p = state.player;
  const input = state.input;

  // Shop closes the moment the buy phase ends (B09).
  if (hud.buyOpen && state.phase !== PHASE.BUY) hud.toggleBuy(false);

  // Buy menu toggle (B).
  if (input.buy) hud.toggleBuy();

  // Timer.
  const t = Math.max(0, Math.ceil(state.phaseT));
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  setText(el('timer'), state.phase === PHASE.LIVE || state.phase === PHASE.BUY ? `${mm}:${ss}` : '—');
  el('timer').classList.toggle('urgent', state.phase === PHASE.LIVE && t <= 10);
  // Live bar round info under the timer — same rule as the scoreboard:
  // NO overtime in DUSTLINE; at 6-6, round 13 is the DECIDER (first-to-7).
  const isDecider = state.round >= 13;
  const roundInfo = isDecider ? 'ROUND 13 · DECIDER' : `ROUND ${state.round} · first to 7`;
  setText(el('phase-label'), { menu: 'MENU',
    buy: isDecider ? 'BUY PHASE · ROUND 13 · DECIDER' : `BUY PHASE · ROUND ${state.round}`,
    live: roundInfo, end: 'ROUND OVER', match: 'MATCH OVER' }[state.phase]);

// Score + alive — ROSTER scores (B01): left slot is always the
  // player's roster (teal), right the enemy roster (orange); side
  // names follow whichever side each roster currently plays.
  const plAtk = p.team === TEAM.ATK;
  setText(el('tnL'), plAtk ? 'ATTACKERS' : 'DEFENDERS');
  setText(el('tnR'), plAtk ? 'DEFENDERS' : 'ATTACKERS');
  setText(el('snL'), plAtk ? 'ATTACKERS' : 'DEFENDERS');
  setText(el('snR'), plAtk ? 'DEFENDERS' : 'ATTACKERS');
  setText(el('stL'), plAtk ? 'ATTACKERS' : 'DEFENDERS');
  setText(el('stR'), plAtk ? 'DEFENDERS' : 'ATTACKERS');
  setText(el('score-atk'), String(state.score[0]));
  setText(el('score-def'), String(state.score[1]));
  const aliveAtk = state.agents.filter((a) => a.team === p.team && a.alive).length;
  const aliveDef = state.agents.filter((a) => a.team !== p.team && a.alive).length;
  const cl = (n) => Math.max(0, Math.min(3, n));
  setText(el('alive-atk'), '●'.repeat(cl(aliveAtk)) + '○'.repeat(3 - cl(aliveAtk)));
  setText(el('alive-def'), '●'.repeat(cl(aliveDef)) + '○'.repeat(3 - cl(aliveDef)));

  // Live bar pips — thin 13-round history under the bar (same data as
  // the Tab scoreboard; rebuilt only when it changes).
  let pips = '';
  for (let r = 0; r < 13; r++) {
    const w = state.roundHistory[r];
    pips += w === TEAM.ATK ? '<span class="pip-atk">●</span>'
      : w === TEAM.DEF ? '<span class="pip-def">●</span>' : '<span class="pip-todo">○</span>';
  }
  if (pips !== hud.lastTopPips) { hud.lastTopPips = pips; el('top-pips').innerHTML = pips; }

  // Health / armor / ammo / money.
  el('health-bar').style.width = `${Math.max(0, p.hp)}%`;
  el('health-bar').classList.toggle('low', p.hp <= 30);
  setText(el('health-num'), String(Math.max(0, Math.ceil(p.hp))));
  setText(el('armor-num'), String(Math.ceil(p.armor)));
  const w = p.weapon;
  const ammo = w ? `${w.ammo} / ${w.reserve}` : '—';
  setText(el('ammo'), ammo);
  setText(el('weapon-name'), w ? w.def.name : '—');
  setText(el('money'), fmtMoney(state.money));
  setText(el('grenades'), `Blink ${p.grenades.blink} · Haze ${p.grenades.haze}`);
  // Gear (vest/helmet/kit) + flashbang overlay (layar memutih saat buta).
  const gear = [];
  if (p.armor > 0) gear.push('Vest ' + Math.ceil(p.armor));
  if (p.helmet) gear.push('Helmet');
  if (p.kit) gear.push('Kit');
  setText(el('gear'), gear.join(' · '));
  const blindLeft = Math.max(0, p.blindUntil - state.time);
  el('flashbang').style.opacity = blindLeft > 0 ? Math.min(0.95, blindLeft).toFixed(2) : 0;

  // Crosshair spread.
  const spread = w ? currentSpread(p) : 0.02;
  const gap = (7 + spread * 420 + p.spread * 260) * (p.aiming ? 0.4 : 1);
  el('crosshair').style.setProperty('--sp', `${gap.toFixed(1)}px`);
  el('crosshair').style.display = (hud.buyOpen || state.phase === PHASE.MENU || state.phase === PHASE.MATCH || !p.alive || input.score) ? 'none' : 'block';
  // Scope overlay (2x/3x circle mask) + zoom label near the ammo.
  el('scope').classList.toggle('show', !!p.aiming && !!w && w.def.zoom > 1 && p.alive && state.phase === PHASE.LIVE && !hud.buyOpen && !input.score);
  setText(el('zoom'), p.aiming && w && state.phase === PHASE.LIVE ? w.def.zoom + 'x' : '');

  // Hitmarker + damage vignette.
  el('hitmarker').classList.toggle('show', state.hitmark > 0);
  el('hitmarker').classList.toggle('kill', state.hitmarkKill);
  el('vignette').style.opacity = String(Math.min(0.85, p.flash * 3 + (p.hp <= 25 && p.alive ? 0.25 : 0)));

  // Bomb status.
  const sp = state.spike;
  let bombText = 'Spike: carried';
  if (sp.state === 'planted') bombText = `SPIKE PLANTED — ${Math.ceil(sp.timer)}s`;
  else if (sp.state === 'planting') bombText = 'Planting spike…';
  else if (sp.state === 'defusing') bombText = 'Enemy defusing the spike!';
  else if (sp.state === 'dropped') bombText = 'Spike dropped — pick it up!';
  else if (sp.state === 'exploded') bombText = 'Spike detonated';
  else if (sp.state === 'defused') bombText = 'Spike defused';
  setText(el('bomb-status'), bombText);
  el('bomb-status').classList.toggle('danger', sp.state === 'planted');

  // Plant / defuse progress.
  const prog = el('progress');
  if (sp.state === 'planting' || sp.state === 'defusing') {
    prog.style.display = 'block';
    setText(el('progress-label'), sp.state === 'planting' ? 'PLANTING SPIKE…' : 'ENEMY DEFUSING SPIKE…');
    el('progress-bar').style.width = `${Math.round(sp.progress * 100)}%`;
  } else {
    prog.style.display = 'none';
  }

  // Kill feed — colored by content: kill = gold, headshot = orange,
  // spike events = teal (see .feed-kill / .feed-hs / .feed-spike).
  const feedStr = state.feed.join('\n');
  if (feedStr !== hud.lastFeed) {
    hud.lastFeed = feedStr;
    el('feed').innerHTML = state.feed.map((f) => {
      const cls = f.includes('HEADSHOT') ? 'feed-hs' : f.includes('▸') ? 'feed-kill' : f.includes('Spike') ? 'feed-spike' : '';
      return `<div class="${cls}">${f}</div>`;
    }).join('');
  }

  // Banner — hidden while the scoreboard is held, so the big round
  // banner never bleeds through the scoreboard panel.
  const banner = el('banner');
  banner.classList.toggle('show', state.bannerT > 0 && !input.score);
  // Always write the text (empty when the banner is off) so no stale
  // result lingers in the DOM under the match overlay (B16).
  setText(el('banner-title'), state.bannerT > 0 ? state.banner : '');
  setText(el('banner-sub'), state.bannerT > 0 ? state.bannerSub : '');

  // Buy hint.
  el('buy-hint').style.display = state.phase === PHASE.BUY && !hud.buyOpen ? 'block' : 'none';

  // Overlays.
  el('menu').classList.toggle('show', state.phase === PHASE.MENU);
  el('match').classList.toggle('show', state.phase === PHASE.MATCH);
  if (state.phase === PHASE.MATCH) {
    // Result follows the player's ROSTER (B01): 0 = player roster won.
    setText(el('match-title'), state.matchWinner === 0 ? 'VICTORY!' : 'DEFEAT');
    setText(el('match-sub'), `Final score ${state.score[0]} — ${state.score[1]} · Click to play again`);
  }

  // Scoreboard (Tab): two team panels, per-player K/D/damage, round pips,
  // MVP highlight, bomb status + timer, team money. Rebuilt only when
  // the signature changes (Tab is held, so this runs while open).
  el('scoreboard').classList.toggle('show', !!input.score);
  if (input.score) {
    const mvp = state.agents.reduce((best, a) => {
      if (!best) return a;
      return (a.kills > best.kills || (a.kills === best.kills && a.dmg > best.dmg)) ? a : best;
    }, null);
    const sig = state.agents.map((a) => `${a.kills}/${a.deaths}/${a.dmg}/${a.alive ? Math.ceil(a.hp) : 0}`).join('|')
      + `|${state.score}|${state.round}|${state.spike.state}|${Math.ceil(state.phaseT)}|${state.money}|${state.roundHistory}`;
    if (sig !== hud.lastScoreSig) {
      hud.lastScoreSig = sig;
      const t = Math.max(0, Math.ceil(state.phaseT));
      const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
      // Header like the reference score bar: big scores beside the team
      // names, timer in the middle, round info under the timer. NO
      // overtime: at 6-6, round 13 is the DECIDER (first-to-7).
      const isDecider = state.round >= 13;
      setText(el('sb-timer'), state.phase === PHASE.LIVE || state.phase === PHASE.BUY ? mm + ':' + ss : '—');
      setText(el('sb-round'), isDecider ? 'ROUND 13 · DECIDER'
        : `ROUND ${state.round} · first to 7`);
      const sp = state.spike;
      const bombTxt = sp.state === 'planted' ? `SPIKE PLANTED at Site ${sp.site} — detonates in ${Math.ceil(sp.timer)}s`
        : sp.state === 'planting' ? 'Planting spike…' : sp.state === 'defusing' ? 'Enemy defusing the spike!'
        : sp.state === 'dropped' ? 'Spike dropped — pick it up!' : sp.state === 'exploded' ? 'Spike detonated'
        : sp.state === 'defused' ? 'Spike defused' : `Spike: carried${sp.carrier ? ' by ' + sp.carrier.name : ''}`;
      setText(el('sb-bomb'), bombTxt);
      el('sb-bomb').classList.toggle('danger', sp.state === 'planted');
      let pips = '';
      for (let r = 0; r < 13; r++) {
        const w = state.roundHistory[r];
        pips += w === TEAM.ATK ? '<span class="pip-atk">●</span>'
          : w === TEAM.DEF ? '<span class="pip-def">●</span>' : '<span class="pip-todo">○</span>';
      }
      el('sb-pips').innerHTML = pips + ` <span style="opacity:.6;font-size:12px">round history (first to 7)</span>`;
      setText(el('sb-atk-score'), String(state.score[0]));
      setText(el('sb-def-score'), String(state.score[1]));
      const rowHtml = (a) => {
        const hp = a.alive ? `<span class="sb-hp${a.hp <= 30 ? ' low' : ''}"><i style="width:${Math.max(0, a.hp)}%"></i></span> ${Math.ceil(a.hp)}`
          : '<span style="opacity:.6">DEAD</span>';
        const cls = `${a === mvp && (a.kills > 0 || a.dmg > 0) ? 'mvp' : ''}${!a.alive ? ' dead' : ''}${a.isPlayer ? ' me' : ''}`;
        const star = a === mvp && (a.kills > 0 || a.dmg > 0) ? ' ★' : '';
        return `<tr class="${cls}"><td>${a.name}${star}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.dmg}</td><td>${a.weapon ? a.weapon.def.name : '—'}</td><td>${hp}</td></tr>`;
      };
      el('sb-atk-rows').innerHTML = state.agents.filter((a) => a.team === p.team).map(rowHtml).join('');
      el('sb-def-rows').innerHTML = state.agents.filter((a) => a.team !== p.team).map(rowHtml).join('');
      setText(el('sb-mvp'), mvp && (mvp.kills > 0 || mvp.dmg > 0) ? `★ MVP: ${mvp.name} — ${mvp.kills} kills, ${mvp.dmg} damage` : '');
      setText(el('sb-money'), `Team money: ${fmtMoney(state.money)} · Hold Tab to view · Release to close`);
    }
  } else {
    hud.lastScoreSig = '';
  }

  // Buy menu money line.
  if (hud.buyOpen) el('buy-money').innerHTML = `<small>MONEY</small> ${fmtMoney(state.money)}`;
}
