// DUSTLINE — HUD: DOM overlay (crosshair, bars, timers, feed, banners,
// buy menu, scoreboard). Reads state only; the sim never touches the DOM.
// Cheap updates: text is rewritten only when it changes.

import { WEAPONS, ARMOR_PRICE, HELMET_PRICE, KIT_PRICE, BLINK_PRICE, HAZE_PRICE, buyItem, currentSpread } from './weapons.js';
import { PHASE, TEAM } from './state.js';

// Buy menu — grid kartu ala toko referensi: nama + peran di atas, siluet
// senjata di tengah, harga BESAR dengan $, tombol BELI oranye. Uang di
// atas menu; item tak terjangkau redup + tombol nonaktif; senjata yang
// dipakai berbadge DIPAKAI. Tombol 1-5 senjata + 6-9,0 sisanya tetap
// jalan sebagai jalan pintas keyboard (fase beli cuma 12 dtk).
const BUY_ITEMS = [
  { id: 'vesper', name: 'Vesper-9', desc: 'SMG — entry dekat', price: WEAPONS.vesper.price, key: '1', art: 'smg' },
  { id: 'talon', name: 'Talon-5', desc: 'Rifle — serba bisa', price: WEAPONS.talon.price, key: '2', art: 'rifle' },
  { id: 'cinder', name: 'Cinder .50', desc: 'Magnum — 1 tembakan sakit', price: WEAPONS.cinder.price, key: '3', art: 'magnum' },
  { id: 'brine', name: 'Brine-12', desc: 'Shotgun — rapat mematikan', price: WEAPONS.brine.price, key: '4', art: 'shotgun' },
  { id: 'rift', name: 'Rift-47', desc: 'Rifle — damage berat', price: WEAPONS.rift.price, key: '5', art: 'rifle2' },
  { id: 'armor', name: 'Vest Anti-Peluru', desc: 'Armor +50', price: ARMOR_PRICE, key: '6', art: 'vest' },
  { id: 'helmet', name: 'Helmet', desc: 'Headshot −35%', price: HELMET_PRICE, key: '7', art: 'helmet' },
  { id: 'kit', name: 'Defuse Kit', desc: 'Jinakkan 4 dtk', price: KIT_PRICE, key: '8', art: 'kit' },
  { id: 'blink', name: 'Blink Flash', desc: 'Granat kilat — butakan', price: BLINK_PRICE, key: '9', art: 'blink' },
  { id: 'haze', name: 'Haze Smoke', desc: 'Granat asap — radius 5 m', price: HAZE_PRICE, key: '0', art: 'haze' },
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

const fmtMoney = (n) => '$' + n.toLocaleString('id-ID');

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
      <span class="buy-badge">DIPAKAI</span>
      <div class="buy-name">${item.name}</div>
      <div class="buy-desc">${item.desc}</div>
      <div class="buy-art">${buyArt(item.art)}</div>
      <div class="buy-price">${fmtMoney(item.price)}</div>
      <button class="buy-btn" tabindex="-1">BELI</button>`;
    card.addEventListener('click', () => {
      const msg = buyItem(state, item.id);
      setText(el('buy-msg'), msg === 'ok' ? `${item.name} dibeli.` : msg);
      refreshBuy(state);
    });
    itemsEl.appendChild(card);
  }
  // Buy hotkeys 1-9, 0 while the menu is open.
  window.addEventListener('keydown', (e) => {
    if (!hud.buyOpen) return;
    const item = BUY_ITEMS.find((b) => b.key === e.code.replace('Digit', ''));
    if (!item) return;
    const msg = buyItem(state, item.id);
    setText(el('buy-msg'), msg === 'ok' ? `${item.name} dibeli.` : msg);
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
      btn.textContent = owned ? 'DIPAKAI' : maxed ? 'PENUH' : cant ? 'UANG KURANG' : 'BELI';
    });
    el('buy-money').innerHTML = `<small>UANG</small> ${fmtMoney(s.money)}`;
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
  setText(el('money'), fmtMoney(state.money));
  setText(el('grenades'), `Blink ${p.grenades.blink} · Haze ${p.grenades.haze}`);
  // Gear (vest/helmet/kit) + flashbang overlay (layar memutih saat buta).
  const gear = [];
  if (p.armor > 0) gear.push('Vest ' + Math.ceil(p.armor));
  if (p.helmet) gear.push('Helm');
  if (p.kit) gear.push('Kit');
  setText(el('gear'), gear.join(' · '));
  const blindLeft = Math.max(0, p.blindUntil - state.time);
  el('flashbang').style.opacity = blindLeft > 0 ? Math.min(0.95, blindLeft).toFixed(2) : 0;

  // Crosshair spread.
  const spread = w ? currentSpread(p) : 0.02;
  const gap = 7 + spread * 420 + p.spread * 260;
  el('crosshair').style.setProperty('--sp', `${gap.toFixed(1)}px`);
  el('crosshair').style.display = (hud.buyOpen || state.phase === PHASE.MENU || state.phase === PHASE.MATCH || !p.alive || input.score) ? 'none' : 'block';

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
      // Header ala bar skor referensi: skor besar di samping nama tim,
      // timer di tengah, info ronde di bawah timer. TIDAK ADA overtime:
      // bila 6-6, ronde ke-13 langsung jadi PENENTU (first-to-7).
      const isDecider = state.round >= 13;
      setText(el('sb-timer'), state.phase === PHASE.LIVE || state.phase === PHASE.BUY ? mm + ':' + ss : '—');
      setText(el('sb-round'), isDecider ? 'RONDE 13 · PENENTU'
        : `RONDE ${state.round} · pertama ke 7`);
      const sp = state.spike;
      const bombTxt = sp.state === 'planted' ? `SPIKE DITANAM di Site ${sp.site} — meledak ${Math.ceil(sp.timer)} dtk`
        : sp.state === 'planting' ? 'Menanam spike…' : sp.state === 'defusing' ? 'Musuh menjinakkan spike!'
        : sp.state === 'dropped' ? 'Spike terjatuh — ambil!' : sp.state === 'exploded' ? 'Spike meledak'
        : sp.state === 'defused' ? 'Spike dijinakkan' : `Spike: dibawa${sp.carrier ? ' oleh ' + sp.carrier.name : ''}`;
      setText(el('sb-bomb'), bombTxt);
      el('sb-bomb').classList.toggle('danger', sp.state === 'planted');
      let pips = '';
      for (let r = 0; r < 13; r++) {
        const w = state.roundHistory[r];
        pips += w === TEAM.ATK ? '<span class="pip-atk">●</span>'
          : w === TEAM.DEF ? '<span class="pip-def">●</span>' : '<span class="pip-todo">○</span>';
      }
      el('sb-pips').innerHTML = pips + ` <span style="opacity:.6;font-size:12px">riwayat ronde (pertama ke 7)</span>`;
      setText(el('sb-atk-score'), String(state.score[TEAM.ATK]));
      setText(el('sb-def-score'), String(state.score[TEAM.DEF]));
      const rowHtml = (a) => {
        const hp = a.alive ? `<span class="sb-hp${a.hp <= 30 ? ' low' : ''}"><i style="width:${Math.max(0, a.hp)}%"></i></span> ${Math.ceil(a.hp)}`
          : '<span style="opacity:.6">TEWAS</span>';
        const cls = `${a === mvp && (a.kills > 0 || a.dmg > 0) ? 'mvp' : ''}${!a.alive ? ' dead' : ''}${a.isPlayer ? ' me' : ''}`;
        const star = a === mvp && (a.kills > 0 || a.dmg > 0) ? ' ★' : '';
        return `<tr class="${cls}"><td>${a.name}${star}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.dmg}</td><td>${a.weapon ? a.weapon.def.name : '—'}</td><td>${hp}</td></tr>`;
      };
      el('sb-atk-rows').innerHTML = state.agents.filter((a) => a.team === TEAM.ATK).map(rowHtml).join('');
      el('sb-def-rows').innerHTML = state.agents.filter((a) => a.team === TEAM.DEF).map(rowHtml).join('');
      setText(el('sb-mvp'), mvp && (mvp.kills > 0 || mvp.dmg > 0) ? `★ MVP: ${mvp.name} — ${mvp.kills} kill, ${mvp.dmg} damage` : '');
      setText(el('sb-money'), `Uang tim: $${state.money} · Tahan Tab untuk melihat · Lepas untuk menutup`);
    }
  } else {
    hud.lastScoreSig = '';
  }

  // Buy menu money line.
  if (hud.buyOpen) el('buy-money').innerHTML = `<small>UANG</small> ${fmtMoney(state.money)}`;
}
