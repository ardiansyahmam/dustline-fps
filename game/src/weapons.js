// DUSTLINE — weapons: fictional loadout, hitscan fire, damage per body part,
// recoil/spread that punishes firing on the move, reload, economy prices.
// Pure data + pure-ish functions: the sim calls these, render draws tracers.

import { rayVsBox } from './utils.js';

export const WEAPONS = {
  mule: {
    id: 'mule', name: 'Mule .45', kind: 'pistol', price: 0,
    damage: 48, headMult: 3, legMult: 0.75, rpm: 320, mag: 12, reserve: 48,
    reload: 1.6, spread: 0.010, moveSpread: 0.02, airSpread: 0.05,
    recoil: 0.030, auto: false, pellets: 1, range: 55,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel-9', kind: 'smg', price: 1200,
    damage: 22, headMult: 3, legMult: 0.75, rpm: 750, mag: 28, reserve: 112,
    reload: 1.9, spread: 0.021, moveSpread: 0.03, airSpread: 0.06,
    recoil: 0.011, auto: true, pellets: 1, range: 60,
  },
  vulture: {
    id: 'vulture', name: 'Vulture AR-7', kind: 'rifle', price: 2700,
    damage: 30, headMult: 3, legMult: 0.75, rpm: 600, mag: 25, reserve: 100,
    reload: 2.2, spread: 0.014, moveSpread: 0.025, airSpread: 0.055,
    recoil: 0.016, auto: true, pellets: 1, range: 85,
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', kind: 'shotgun', price: 1100,
    damage: 11, headMult: 2.5, legMult: 0.7, rpm: 75, mag: 6, reserve: 24,
    reload: 2.6, spread: 0.05, moveSpread: 0.03, airSpread: 0.06,
    recoil: 0.06, auto: false, pellets: 8, range: 26,
  },
  dune: {
    id: 'dune', name: 'Dune-47', kind: 'rifle', price: 2500,
    damage: 36, headMult: 3, legMult: 0.75, rpm: 545, mag: 30, reserve: 90,
    reload: 2.4, spread: 0.018, moveSpread: 0.03, airSpread: 0.06,
    recoil: 0.024, auto: true, pellets: 1, range: 85,
  },
};

export const ARMOR_PRICE = 650;   // vest: +50 armor
export const FRAG_PRICE = 300;
export const SMOKE_PRICE = 300;

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

// Apply damage. Returns 'kill' | 'hit' | 'none'.
export function applyDamage(state, target, raw, part, attacker) {
  if (!target.alive) return 'none';
  const def = attacker && attacker.weapon ? attacker.weapon.def : null;
  let dmg = raw;
  if (def) {
    if (part === 'head') dmg *= def.headMult;
    else if (part === 'legs') dmg *= def.legMult;
  }
  // Armor soaks half the damage while it lasts.
  if (target.armor > 0) {
    const soaked = Math.min(target.armor, dmg * 0.5);
    target.armor -= soaked;
    dmg -= soaked;
  }
  target.hp -= dmg;
  target.flash = 0.18;
  if (attacker && attacker.isPlayer) {
    state.hitmark = 0.25;
    state.hitmarkKill = target.hp <= 0;
    state.shotsHit++;
  }
  if (target.hp > 0) return 'hit';
  target.hp = 0;
  target.alive = false;
  target.vx = 0; target.vz = 0;
  return 'kill';
}

export function startReload(agent, now) {
  if (!agent.weapon || agent.reloading) return false;
  const w = agent.weapon;
  if (w.ammo >= w.def.mag || w.reserve <= 0) return false;
  agent.reloading = true;
  agent.reloadEnd = now + w.def.reload;
  return true;
}

export function finishReload(agent) {
  const w = agent.weapon;
  const need = w.def.mag - w.ammo;
  const take = Math.min(need, w.reserve);
  w.ammo += take;
  w.reserve -= take;
  agent.reloading = false;
}

// Buy phase purchases. Returns a message string ('' on success is 'ok').
export function buyItem(state, itemId) {
  const p = state.player;
  if (state.phase !== 'buy' && state.phase !== 'menu') return 'Toko hanya buka saat fase beli.';
  const spend = (cost) => {
    if (state.money < cost) return 'Uang tidak cukup.';
    state.money -= cost;
    return 'ok';
  };
  if (itemId === 'armor') {
    const r = spend(ARMOR_PRICE);
    if (r === 'ok') p.armor = Math.min(100, p.armor + 50);
    return r;
  }
  if (itemId === 'frag') {
    const r = spend(FRAG_PRICE);
    if (r === 'ok') p.grenades.frag = Math.min(2, p.grenades.frag + 1);
    return r;
  }
  if (itemId === 'smoke') {
    const r = spend(SMOKE_PRICE);
    if (r === 'ok') p.grenades.smoke = Math.min(2, p.grenades.smoke + 1);
    return r;
  }
  const def = WEAPONS[itemId];
  if (!def) return 'Item tidak dikenal.';
  if (p.weapons[0] && p.weapons[0].def.id === itemId) return 'Senjata sudah dimiliki.';
  const r = spend(def.price);
  if (r !== 'ok') return r;
  const w = makeWeapon(itemId);
  p.weapons[0] = w;
  p.weapon = w;
  p.slot = 0;
  return 'ok';
}
