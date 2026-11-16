// DUSTLINE — bots: waypoint nav, sight/hearing, hold/push tactics,
// plant/defuse. One brain per bot. 5 roles/round (entry/support/mid/
// anchor/lurker); sight cone 105° to 26 m; hearing 17 m (35 m on the
// Pump Duct grate); reaction 0.25-0.55 s; never shoot through walls.

import { angleDiff, angleLerp, clamp, hasLOS } from './utils.js';
import { fireWeapon, canFire } from './weapons.js';
import { TEAM } from './state.js';

const VISION_RANGE = 26;
const VISION_HALF = 0.916;    // 105 deg cone / 2
const HEAR_RANGE = 35;         // tembakan
const FOOTSTEP_RANGE = 17;     // langkah
const DUCT_HEAR_RANGE = 35;    // langkah di atas grate Pump Duct

// Tingkat kesulitan per ronde (celah desain, nilai isi sendiri):
// reaksi + konsistensi aim + koordinasi naik tiap tier — BUKAN
// wallhack atau damage lebih besar.
function diffFor(round) {
  if (round <= 2) return { react: 0.55, aim: 0.038, callout: false };
  if (round <= 4) return { react: 0.45, aim: 0.032, callout: true };
  if (round <= 6) return { react: 0.38, aim: 0.027, callout: true };
  return { react: 0.30, aim: 0.022, callout: true };
}

export function createBrain(side, holdNode) {
  return {
    side,                       // 'atk' | 'def' (sisi tim)
    role: 'anchor',             // entry | support | mid | anchor | lurker (per ronde)
    mode: 'hold',               // hold | push | investigate | plant | defuse
    wp: holdNode,               // current waypoint index
    path: [], pathI: 0,         // BFS path (indices)
    tx: 0, tz: 0,               // steering target
    holdT: 0,                   // seconds left holding this spot
    site: null,                 // assigned site 'A' | 'B'
    seen: null,                 // currently visible enemy agent
    lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
    reactAt: 0, aimErr: 0, settleUntil: 0,
    burstLeft: 0, burstAt: 0, pauseUntil: 0,
    perceiveAt: 0,              // staggered perception timer
    plantT: 0, defuseT: 0,
    relocate: false,            // anchor: pindah sudut setelah burst
  };
}

// Breadth-first path on the waypoint graph. Writes into out (reused).
export function findPath(waypoints, from, to, out) {
  out.length = 0;
  if (from === to) { out.push(to); return out; }
  const prev = new Int16Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of waypoints[cur][2]) {
      if (prev[n] === -1) { prev[n] = cur; queue.push(n); }
    }
  }
  if (prev[to] === -1) { out.push(to); return out; }
  let c = to;
  const rev = [];
  while (c !== from) { rev.push(c); c = prev[c]; }
  rev.push(from);
  for (let i = rev.length - 1; i >= 0; i--) out.push(rev[i]);
  return out;
}

// Path via an intermediate waypoint (rotasi lewat jalur tertentu:
// Solar Spine = waypoint 17, Pump Duct = waypoint 14).
export function pathVia(waypoints, from, via, to, out) {
  const first = [];
  findPath(waypoints, from, via, first);
  const second = [];
  findPath(waypoints, via, to, second);
  out.length = 0;
  for (const n of first) out.push(n);
  for (let i = 1; i < second.length; i++) out.push(second[i]);
  return out;
}

function nearestWaypoint(waypoints, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const dx = waypoints[i][0] - x, dz = waypoints[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Segment vs smoke puff (2D circle). True when the shot's view is blocked.
function smokeBlocks(x0, z0, x1, z1, smokes) {
  for (const s of smokes) {
    if (!s) continue;
    const R = s.r || 3.4;
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((s.x - x0) * dx + (s.z - z0) * dz) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = x0 + dx * t - s.x, pz = z0 + dz * t - s.z;
    if (px * px + pz * pz < R * R) return true;
  }
  return false;
}

// Catat intel: defender terlihat/terdengar di dekat sebuah site.
function noteIntel(state, x, z) {
  const sites = state.mapData.sites;
  for (const key of ['A', 'B']) {
    const s = sites[key];
    if (Math.hypot(s.x - x, s.z - z) < 12) state.intel[key] = state.time;
  }
}

function perceive(state, bot, now) {
  const b = bot.brain;
  const prevSeen = b.seen;
  b.seen = null;
  // Buta oleh Blink flash: tidak bisa melihat sama sekali.
  if (bot.blindUntil > now) return;
  const eyeY = 1.5;
  const diff = diffFor(state.round);
  for (const e of state.agents) {
    if (e.team === bot.team || !e.alive) continue;
    const dx = e.x - bot.x, dz = e.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISION_RANGE) continue;
    // Vision cone (bots look where they face, unless recently alerted)
    const wantYaw = Math.atan2(-dx, -dz);
    if (Math.abs(angleDiff(bot.yaw, wantYaw)) > VISION_HALF && now - b.lastSeenT > 1.2) continue;
    if (!hasLOS(bot.x, bot.z, e.x, e.z, eyeY, state.solids)) continue;
    if (smokeBlocks(bot.x, bot.z, e.x, e.z, state.smokes)) continue;
    b.seen = e;
    b.lastSeenX = e.x; b.lastSeenZ = e.z; b.lastSeenT = now;
    // Intel: defender yang terlihat dicatat per site (penyerang memilih
    // site dari intel ini).
    if (e.team === TEAM.DEF) noteIntel(state, e.x, e.z);
    // Reaksi 0,25-0,55 dtk (tier makin cepat), lalu aim settle
    // 0,35-0,8 dtk: bidikan mulai goyang 2x lalu mengunci.
    if (b.reactAt < now) {
      const base = diff.react * (0.7 + state.rng() * 0.6);
      b.reactAt = now + clamp(base, 0.25, 0.55);
    }
    if (prevSeen !== e) b.settleUntil = now + 0.35 + state.rng() * 0.45;
    b.aimErr = Math.max(0.016, diff.aim) + dist * 0.0011;
    // Callout (tier 2+): rekan mendapat posisi musuh yang sama.
    if (diff.callout) {
      for (const t of state.agents) {
        if (!t.isBot || t === bot || t.team !== bot.team || !t.alive) continue;
        if (t.brain.lastSeenT < now) {
          t.brain.lastSeenX = e.x; t.brain.lastSeenZ = e.z; t.brain.lastSeenT = now;
        }
      }
    }
    return;
  }
}

// A gunshot was fired: nearby enemies investigate the sound (35 m).
export function botHeardShot(state, shooter) {
  if (shooter.team === TEAM.DEF) noteIntel(state, shooter.x, shooter.z);
  for (const a of state.agents) {
    if (!a.isBot || !a.alive || a.team === shooter.team) continue;
    const d = Math.hypot(a.x - shooter.x, a.z - shooter.z);
    if (d > HEAR_RANGE) continue;
    const b = a.brain;
    if (b.mode === 'plant' || b.mode === 'defuse') continue;
    b.lastSeenX = shooter.x + (state.rng() - 0.5) * 6;
    b.lastSeenZ = shooter.z + (state.rng() - 0.5) * 6;
    b.lastSeenT = state.time;
    if (b.mode !== 'investigate') { b.mode = 'investigate'; b.holdT = 0; }
  }
}

// Footsteps: a bot investigates the nearest enemy mover it can hear.
// Langkah terdengar 17 m; di atas grate Pump Duct 35 m (lebih berisik).
export function botHeardSteps(state) {
  const duct = state.mapData.zones ? state.mapData.zones.duct : null;
  for (const a of state.agents) {
    if (!a.isBot || !a.alive) continue;
    const b = a.brain;
    if (b.mode === 'plant' || b.mode === 'defuse' || b.seen) continue;
    let best = null, bestD = Infinity;
    for (const e of state.agents) {
      if (e.team === a.team || !e.alive) continue;
      const spd = Math.hypot(e.vx, e.vz);
      if (spd < 2.5) continue;
      const d = Math.hypot(e.x - a.x, e.z - a.z);
      const inDuct = duct && e.x >= duct.x0 && e.x <= duct.x1 && e.z >= duct.z0 && e.z <= duct.z1;
      const range = inDuct ? DUCT_HEAR_RANGE : FOOTSTEP_RANGE;
      if (d < range && d < bestD) { best = e; bestD = d; }
    }
    if (best && state.time - b.lastSeenT > 1.5) {
      b.lastSeenX = best.x; b.lastSeenZ = best.z; b.lastSeenT = state.time;
      if (b.mode !== 'investigate') { b.mode = 'investigate'; b.holdT = 0; }
    }
  }
}

function steerTo(bot, x, z, speed) {
  const b = bot.brain;
  b.tx = x; b.tz = z;
  const dx = x - bot.x, dz = z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) { bot.tx = bot.x; bot.tz = bot.z; return 0; }
  bot.tx = bot.x + (dx / d) * speed;
  bot.tz = bot.z + (dz / d) * speed;
  return d;
}

function followPath(state, bot, dt, speed = 3.6) {
  const b = bot.brain;
  const wps = state.mapData.waypoints;
  if (b.pathI >= b.path.length) return true; // arrived
  const node = wps[b.path[b.pathI]];
  const d = steerTo(bot, node[0], node[1], speed);
  if (d < 1.3) b.pathI++;
  return b.pathI >= b.path.length;
}

export function updateBot(state, bot, dt, rng, shotOut) {
  const b = bot.brain;
  const now = state.time;
  const wps = state.mapData.waypoints;
  const sites = state.mapData.sites;

  // --- perception (staggered) ---
  if (now >= b.perceiveAt) {
    b.perceiveAt = now + 0.15;
    perceive(state, bot, now);
  }

  // --- combat: aim and fire at the seen enemy ---
  if (b.seen && b.seen.alive && now >= b.reactAt) {
    const e = b.seen;
    const dx = e.x - bot.x, dz = e.z - bot.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    bot.yaw = angleLerp(bot.yaw, wantYaw, Math.min(1, dt * 9));
    const eyeY = bot.crouched ? 1.12 : 1.62;
    const wantPitch = Math.atan2((e.y + 1.3) - (bot.y + eyeY), dist);
    bot.pitch = angleLerp(bot.pitch, wantPitch, Math.min(1, dt * 9));
    // Aim settle: bidikan masih goyang 2x selama 0,35-0,8 dtk pertama.
    const settle = now < b.settleUntil ? 2 : 1;
    // Burst fire with pauses.
    if (now >= b.pauseUntil) {
      if (b.burstLeft <= 0) b.burstLeft = 3 + ((rng() * 3) | 0);
      if (canFire(bot, now)) {
        const saveYaw = bot.yaw, savePitch = bot.pitch;
        bot.yaw += (rng() - 0.5) * 2 * b.aimErr * settle;
        bot.pitch += (rng() - 0.5) * 2 * b.aimErr * settle;
        fireWeapon(state, bot, rng, shotOut);
        bot.yaw = saveYaw; bot.pitch = savePitch;
        b.burstLeft--;
        if (b.burstLeft <= 0) {
          b.pauseUntil = now + 0.5 + rng() * 0.7;
          // Anchor: peek singkat lalu PINDAH sudut setelah 1-2 burst.
          if (b.role === 'anchor') b.holdT = 0;
        }
        return shotOut; // sim draws tracers + sound from this
      }
    }
    // Hold position while fighting (strafe a little).
    steerTo(bot, bot.x + Math.sin(now * 0.7 + bot.id) * 0.4, bot.z + Math.cos(now * 0.6 + bot.id) * 0.4, 0.8);
    return null;
  }

  // --- objective behaviour ---
  const sp = state.spike;
  const elapsed = now - (state.roundT0 || 0); // seconds into the round
  if (b.side === 'atk') {
    // Carrier plants when it reaches its site with no enemy in sight.
    if (sp.carrier === bot && sp.state === 'carried') {
      const site = sites[b.site];
      const dSite = Math.hypot(site.x - bot.x, site.z - bot.z);
      if (dSite < 2.5) {
        b.mode = 'plant';
        return null;
      }
    }
    if (b.mode === 'plant') return null; // sim advances the channel
    // Push toward the assigned site, per role.
    const siteNode = b.site === 'A' ? 16 : 15;
    const approachNode = b.site === 'A' ? 12 : 10;
    const entryBot = state.agents.find((a) => a.isBot && a.team === bot.team && a.brain.role === 'entry' && a !== bot);
    let target = siteNode, speed = 3.6, via = -1;
    if (b.role === 'lurker') {
      // Rute panjang lewat Solar Spine (waypoint 17), lebih lambat.
      target = siteNode; speed = 3.0; via = 17;
    } else if (b.role === 'support') {
      // Ikuti entry: tahan di akses site sampai entry dekat site.
      const site = sites[b.site];
      const entryNear = entryBot && Math.hypot(entryBot.x - site.x, entryBot.z - site.z) < 6;
      target = entryNear || elapsed > 20 ? siteNode : approachNode;
      speed = 3.4;
    } else if (b.role === 'mid') {
      // Mid-control: kuasai mid dulu 15 dtk, lalu dorong ke site.
      const intelFresh = state.agents.some((a) => a.team === bot.team && a.isBot && now - a.brain.lastSeenT < 3);
      if (elapsed < 15 && !intelFresh && sp.state !== 'planted') {
        steerTo(bot, wps[9][0], wps[9][1], 3.6);
        bot.yaw += Math.sin(now * 0.5 + bot.id * 2) * dt * 0.5;
        return null;
      }
      target = siteNode; speed = 3.6;
    } else {
      // Entry: paling dulu ke site.
      target = siteNode; speed = 4.0;
    }
    if (b.mode !== 'push' || b.pathI >= b.path.length || b._target !== target) {
      const from = nearestWaypoint(wps, bot.x, bot.z);
      if (via >= 0) pathVia(wps, from, via, target, b.path);
      else findPath(wps, from, target, b.path);
      b.pathI = 0;
      b.mode = 'push';
      b._target = target;
    }
    followPath(state, bot, dt, speed);
  } else {
    // Defenders.
    if (sp.state === 'planted') {
      // Retake: converge on the SPIKE itself (B04 — the site waypoint is
      // not the target; the spike can sit metres from it). Close in
      // direct, farther out path to the nearest waypoint of the spike.
      const dSpike = Math.hypot(sp.x - bot.x, sp.z - bot.z);
      if (dSpike < 2.2) {
        b.mode = 'defuse';
        return null;
      }
      if (dSpike < 6) { steerTo(bot, sp.x, sp.z, 3.8); return null; }
      if (b.mode !== 'push' || b.pathI >= b.path.length) {
        const from = nearestWaypoint(wps, bot.x, bot.z);
        const target = nearestWaypoint(wps, sp.x, sp.z);
        const alreadyPushing = state.agents.filter((a) => a.isBot && a.team === bot.team
          && a !== bot && a.brain.mode === 'push').length;
        if (alreadyPushing >= 1) pathVia(wps, from, 14, target, b.path);
        else findPath(wps, from, target, b.path);
        b.pathI = 0;
        b.mode = 'push';
      }
      followPath(state, bot, dt, 3.8);
    } else if (b.mode === 'defuse' && sp.state === 'defusing') {
      // Mid-defuse: hold still on the spike, never wander off.
      steerTo(bot, bot.x, bot.z, 0);
      return null;
    } else if (b.mode === 'investigate') {
      const d = steerTo(bot, b.lastSeenX, b.lastSeenZ, 3.8);
      if (d < 1.5) { b.mode = 'hold'; b.holdT = 2 + rng() * 3; }
    } else {
      // Hold, per role: anchor di sudut site (pindah setelah burst —
      // holdT direset di blok combat), mid di Inverter Court (wp 9),
      // lurker di Solar Spine (wp 17), support di akses site.
      b.holdT -= dt;
      if (b.holdT <= 0) {
        if (b.role === 'mid') { b.tx = wps[9][0]; b.tz = wps[9][1]; }
        else if (b.role === 'lurker') { b.tx = wps[17][0]; b.tz = wps[17][1]; }
        else if (b.role === 'support') {
          const node = b.site === 'A' ? 12 : 10;
          b.tx = wps[node][0]; b.tz = wps[node][1];
        } else {
          const site = sites[b.site];
          const a = rng() * Math.PI * 2;
          const r = 2 + rng() * 4;
          b.tx = site.x + Math.cos(a) * r;
          b.tz = site.z + Math.sin(a) * r;
        }
        b.holdT = 4 + rng() * 5;
      }
      steerTo(bot, b.tx, b.tz, 2.2);
      // Scan: slow yaw sweep while holding.
      bot.yaw += Math.sin(now * 0.5 + bot.id * 2) * dt * 0.5;
    }
  }
  return null;
}
