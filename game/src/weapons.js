// DUSTLINE — weapons: fictional loadout, hitscan fire, damage per body
// part, recoil/spread, reload, economy prices. Pure data + functions.
import { rayVsBox } from './utils.js';

// Loadout (Supra): 5 weapons + free pistol. Damage is absolute per body
// part (head/body/leg, 100 HP); spread in radians (half-cone angle);
// recoil per shot, armor penetration, movement penalty, kill reward,
// long-range falloff. Values below.
export const WEAPONS = {
  // Vivid per-weapon color identity (viewmodel + buy card + bot gun):
  // slate-blue pistol, teal SMG, rust-orange rifle, gold magnum,
  // brick-red shotgun, olive rifle.
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    color: 0x8fa3c8, colorDark: 0x4a5a78,
    damage: 20, head: 36, leg: 14, rpm: 320, mag: 12, reserve: 48,
    reload: 1.6, spread: 0.006, moveSpread: 0.016, airSpread: 0.05,
    recoil: 0.028, auto: false, pellets: 1, range: 55,
    pen: 0.5, killReward: 200, speed: 1.0, zoom: 1,
  },
  vesper: {
    id: 'vesper', name: 'Vesper-9', kind: 'smg', price: 1750,
    color: 0x2fd8c8, colorDark: 0x1d7a74,
    damage: 22, head: 38, leg: 16, rpm: 750, mag: 32, reserve: 128,
    reload: 1.9, spread: 0.007, moveSpread: 0.016, airSpread: 0.06,
    recoil: 0.011, auto: true, pellets: 1, range: 60,
    pen: 0.5, killReward: 300, speed: 1.0, zoom: 1,
  },
  talon: {
    id: 'talon', name: 'Talon-5', kind: 'rifle', price: 2500,
    color: 0xff7a2e, colorDark: 0xa34a16,
    damage: 27, head: 54, leg: 20, rpm: 600, mag: 30, reserve: 90,
    reload: 2.2, spread: 0.005, moveSpread: 0.011, airSpread: 0.055,
    recoil: 0.016, auto: true, pellets: 1, range: 85,
    pen: 0.65, killReward: 200, speed: 0.97, zoom: 2,
  },
  cinder: {
    id: 'cinder', name: 'Cinder .50', kind: 'magnum', price: 650,
    color: 0xffc93c, colorDark: 0xa67c00,
    damage: 48, head: 90, leg: 36, rpm: 240, mag: 6, reserve: 24,
    reload: 2.4, spread: 0.004, moveSpread: 0.022, airSpread: 0.06,
    recoil: 0.07, auto: false, pellets: 1, range: 90,
    pen: 0.85, killReward: 300, speed: 0.94, zoom: 2,
  },
  brine: {
    id: 'brine', name: 'Brine-12', kind: 'shotgun', price: 1850,
    color: 0xe8402e, colorDark: 0x8f1f14,
    damage: 6, head: 8, leg: 4, rpm: 78, mag: 8, reserve: 32,
    reload: 2.8, spread: 0.057, moveSpread: 0.01, airSpread: 0.06,
    recoil: 0.06, auto: false, pellets: 8, range: 26,
    pen: 0.4, killReward: 500, speed: 0.95, zoom: 1, falloff: 'shotgun',
  },
  rift: {
    id: 'rift', name: 'Rift-47', kind: 'rifle', price: 2850,
    color: 0x9ab83c, colorDark: 0x55631f,
    damage: 31, head: 62, leg: 23, rpm: 540, mag: 30, reserve: 90,
    reload: 2.4, spread: 0.008, moveSpread: 0.017, airSpread: 0.06,
    recoil: 0.026, auto: true, pellets: 1, range: 85,
    pen: 0.6, killReward: 200, speed: 0.95, zoom: 3,
  },
};

export const ARMOR_PRICE = 650;   // vest: +50 armor
export const HELMET_PRICE = 350;  // helmet: headshot -35% while worn
export const KIT_PRICE = 400;     // defuse kit: defuse 4 dtk (bukan 6)
export const BLINK_PRICE = 250;   // flashbang
export const HAZE_PRICE = 300;    // smoke

export function makeWeapon(id) {
  const def = WEAPONS[id];
  return { def, ammo: def.mag, reserve: def.reserve };
}

export function canFire(agent, now) {
  if (!agent.weapon || agent.reloading || !agent.alive) return false;
  if (agent.weapon.ammo <= 0) return false;
  return now - agent.lastShot >= 60 / agent.weapon.def.rpm;
}

// Effective spread (radians) for a shooter right now.
export function currentSpread(agent) {
  const w = agent.weapon.def;
  const moving = Math.hypot(agent.vx, agent.vz);
  let s = w.spread + agent.spread;
  if (moving > 0.5) s += w.moveSpread * Math.min(1, moving / 4.5);
  if (!agent.onGround) s += w.airSpread;
  if (agent.crouched) s *= 0.7;
  if (agent.aiming) s *= [0, 0.45, 0.35, 0.3][w.zoom];
  return s;
}

// One trigger pull. Returns an array of pellet results written into `out`
// (caller reuses it): {hit: agent|null, part: 'head'|'body'|'legs'|null,
// point: [x,y,z], dist}. Also consumes one ammo and sets lastShot.
export function fireWeapon(state, shooter, rng, out) {
  const w = shooter.weapon;
  const def = w.def;
  out.length = 0;
  if (w.ammo <= 0) return out;
  w.ammo--;
  shooter.lastShot = state.time;
  shooter.spread = Math.min(0.09, shooter.spread + def.recoil * 0.9);
  shooter.recoil = Math.min(0.22, shooter.recoil + def.recoil);
  state.shotsFired++;

  const eyeY = shooter.crouched ? 1.12 : 1.62;
  const ox = shooter.x, oy = shooter.y + eyeY, oz = shooter.z;
  const spread = currentSpread(shooter);
  for (let p = 0; p < def.pellets; p++) {
    // Base direction from yaw/pitch, plus a random cone offset.
    const yaw = shooter.yaw + (rng() - 0.5) * 2 * spread + (rng() - 0.5) * shooter.spread;
    const pitch = shooter.pitch + (rng() - 0.5) * 2 * spread;
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    out.push(traceShot(state, shooter, ox, oy, oz, dx, dy, dz, def.range));
  }
  return out;
}

// Trace one hitscan ray. Returns {hit, part, point, dist} (reused object ok).
export function traceShot(state, shooter, ox, oy, oz, dx, dy, dz, range) {
  let bestDist = range;
  let bestHit = null, bestPart = null;
  // Walls first (they block everything).
  const solids = state.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i];
    const d = rayVsBox(ox, oy, oz, dx, dy, dz, range, { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y0: 0, y1: b.y1 });
    if (d >= 0 && d < bestDist) bestDist = d;
  }
  // Agents on the other team.
  for (const a of state.agents) {
    if (a === shooter || !a.alive || a.team === shooter.team) continue;
    const r = hitAgent(ox, oy, oz, dx, dy, dz, bestDist, a);
    if (r) { bestDist = r.dist; bestHit = a; bestPart = r.part; }
  }
  return {
    hit: bestHit, part: bestPart,
    point: [ox + dx * bestDist, oy + dy * bestDist, oz + dz * bestDist],
    dist: bestDist,
  };
}

// Ray vs an agent's three hitboxes. Returns {dist, part} or null.
function hitAgent(ox, oy, oz, dx, dy, dz, maxDist, a) {
  const boxes = [
    { part: 'head', x0: a.x - 0.2, x1: a.x + 0.2, z0: a.z - 0.2, z1: a.z + 0.2, y0: a.y + 1.45, y1: a.y + 1.78 },
    { part: 'body', x0: a.x - 0.3, x1: a.x + 0.3, z0: a.z - 0.2, z1: a.z + 0.2, y0: a.y + 0.85, y1: a.y + 1.45 },
    { part: 'legs', x0: a.x - 0.3, x1: a.x + 0.3, z0: a.z - 0.2, z1: a.z + 0.2, y0: a.y, y1: a.y + 0.85 },
  ];
  let best = null;
  for (const b of boxes) {
    const d = rayVsBox(ox, oy, oz, dx, dy, dz, maxDist, b);
    if (d >= 0 && (!best || d < best.dist)) best = { dist: d, part: b.part };
  }
  return best;
}

// Falloff jarak jauh (celah desain, nilai isi sendiri):
// shotgun turun tajam setelah 7 m (x0,5) dan 14 m (x0,25); senjata lain
// x0,85 setelah 25 m dan x0,7 setelah 40 m.
function falloffMult(def, dist) {
  if (def.falloff === 'shotgun') {
    if (dist > 14) return 0.25;
    if (dist > 7) return 0.5;
    return 1;
  }
  if (dist > 40) return 0.7;
  if (dist > 25) return 0.85;
  return 1;
}

// Apply damage. Returns 'kill' | 'hit' | 'none'. `raw` is the body damage
// (kept for callers without a weapon); with a weapon the absolute
// head/body/leg values from the def are used instead.
export function applyDamage(state, target, raw, part, attacker, dist = 0) {
  if (!target.alive) return 'none';
  const def = attacker && attacker.weapon ? attacker.weapon.def : null;
  let dmg = raw;
  if (def) {
    if (part === 'head') dmg = def.head;
    else if (part === 'legs') dmg = def.leg;
    else dmg = def.damage;
    dmg *= falloffMult(def, dist);
    // Helmet: headshot -35% while worn (helmet does not break).
    if (part === 'head' && target.helmet) dmg *= 0.65;
  }
  // Armor: penetration — only (1 - pen) of the damage can be absorbed.
  // (pen 0,5 = perilaku lama: setengah diserap.)
  if (target.armor > 0) {
    const pen = def ? def.pen : 0.5;
    const soaked = Math.min(target.armor, dmg * (1 - pen));
    target.armor -= soaked;
    dmg -= soaked;
  }
  target.hp -= dmg;
  target.flash = 0.18;
  // Screen shake ringan saat pemain kena tembak.
  if (target.isPlayer) state.cameraShake = Math.max(state.cameraShake, 0.35);
  if (attacker) {
    attacker.dmg += Math.round(dmg);
    if (part === 'head') attacker.hs++;
  }
  if (attacker && attacker.isPlayer) {
    state.hitmark = 0.25;
    state.hitmarkKill = target.hp <= 0;
    state.shotsHit++;
  }
  if (target.hp > 0) return 'hit';
  target.hp = 0;
  target.alive = false;
  target.vx = 0; target.vz = 0;
  // Death costs the loadout (B08): primary, grenades and gear are lost.
  // Here, not in onKill — every death path (shots AND the spike blast)
  // funnels through applyDamage, so nothing can keep a dead loadout.
  if (target.isPlayer) {
    target.weapons[0] = null; target.weapon = target.weapons[1]; target.slot = 1;
    target.grenades.blink = 0; target.grenades.haze = 0;
    target.armor = 0; target.helmet = false; target.kit = false;
  }
  return 'kill';
}

export function startReload(agent, now) {
  if (!agent.weapon || agent.reloading) return false;
  const w = agent.weapon;
  if (w.ammo >= w.def.mag || w.reserve <= 0) return false;
  agent.reloading = true;
  agent.reloadWeapon = w; // the mag lands on THIS weapon (B12), even
  agent.reloadEnd = now + w.def.reload; // if the holder switches mid-reload
  return true;
}

export function finishReload(agent) {
  const w = agent.reloadWeapon || agent.weapon;
  const need = w.def.mag - w.ammo;
  const take = Math.min(need, w.reserve);
  w.ammo += take;
  w.reserve -= take;
  agent.reloading = false;
  agent.reloadWeapon = null;
}

// Buy phase purchases. Returns a message string ('' on success is 'ok').
export function buyItem(state, itemId) {
  const p = state.player;
  if (state.phase !== 'buy' && state.phase !== 'menu') return 'Shop is only open during the buy phase.';
  const spend = (cost) => {
    if (state.money < cost) return 'Not enough money.';
    state.money -= cost;
    return 'ok';
  };
  if (itemId === 'armor') {
    if (p.armor >= 100) return 'Armor already full.';
    const r = spend(ARMOR_PRICE);
    if (r === 'ok') p.armor = Math.min(100, p.armor + 50);
    return r;
  }
  if (itemId === 'helmet') {
    if (p.helmet) return 'Helmet already worn.';
    const r = spend(HELMET_PRICE);
    if (r === 'ok') p.helmet = true;
    return r;
  }
  if (itemId === 'kit') {
    if (p.kit) return 'Kit already owned.';
    const r = spend(KIT_PRICE);
    if (r === 'ok') p.kit = true;
    return r;
  }
  if (itemId === 'blink') {
    if (p.grenades.blink >= 2) return 'Grenades full.';
    const r = spend(BLINK_PRICE);
    if (r === 'ok') p.grenades.blink = Math.min(2, p.grenades.blink + 1);
    return r;
  }
  if (itemId === 'haze') {
    if (p.grenades.haze >= 2) return 'Grenades full.';
    const r = spend(HAZE_PRICE);
    if (r === 'ok') p.grenades.haze = Math.min(2, p.grenades.haze + 1);
    return r;
  }
  const def = WEAPONS[itemId];
  if (!def) return 'Unknown item.';
  if (p.weapons[0] && p.weapons[0].def.id === itemId) return 'Weapon already owned.';
  const r = spend(def.price);
  if (r !== 'ok') return r;
  const w = makeWeapon(itemId);
  p.weapons[0] = w;
  p.weapon = w;
  p.slot = 0;
  return 'ok';
}
