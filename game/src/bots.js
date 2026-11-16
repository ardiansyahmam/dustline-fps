// DUSTLINE — bots: waypoint navigation, sight/hearing perception, hold and
// push tactics, plant/defuse behaviour. One brain per bot, no allocation
// in the per-frame path (paths are small reused arrays).

import { angleDiff, angleLerp, clamp, hasLOS } from './utils.js';
import { fireWeapon, canFire } from './weapons.js';

const VISION_RANGE = 30;
const VISION_HALF = 1.0;      // ~115 deg cone
const HEAR_RANGE = 26;

export function createBrain(role, holdNode) {
  return {
    role,                       // 'atk' | 'def'
    mode: 'hold',               // hold | push | investigate | plant | defuse
    wp: holdNode,               // current waypoint index
    path: [], pathI: 0,         // BFS path (indices)
    tx: 0, tz: 0,               // steering target
    holdT: 0,                   // seconds left holding this spot
    site: null,                 // assigned site 'A' | 'B'
    seen: null,                 // currently visible enemy agent
    lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
    reactAt: 0, aimErr: 0,
    burstLeft: 0, burstAt: 0, pauseUntil: 0,
    perceiveAt: 0,              // staggered perception timer
    plantT: 0, defuseT: 0,
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
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((s.x - x0) * dx + (s.z - z0) * dz) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = x0 + dx * t - s.x, pz = z0 + dz * t - s.z;
    if (px * px + pz * pz < 3.4 * 3.4) return true;
  }
  return false;
}

function perceive(state, bot, now) {
  const b = bot.brain;
  b.seen = null;
  const eyeY = 1.5;
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
    const diff = Math.max(0.3, 0.68 - state.round * 0.045);
    if (b.reactAt < now) b.reactAt = now + diff * (0.7 + state.rng() * 0.6);
    b.aimErr = Math.max(0.016, 0.038 - state.round * 0.0025) + dist * 0.0011;
    return;
  }
}

// A gunshot was fired: nearby enemies investigate the sound.
export function botHeardShot(state, shooter) {
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

function followPath(state, bot, dt) {
  const b = bot.brain;
  const wps = state.mapData.waypoints;
  if (b.pathI >= b.path.length) return true; // arrived
  const node = wps[b.path[b.pathI]];
  const d = steerTo(bot, node[0], node[1], 3.6);
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
    // Burst fire with pauses.
    if (now >= b.pauseUntil) {
      if (b.burstLeft <= 0) b.burstLeft = 3 + ((rng() * 3) | 0);
      if (canFire(bot, now)) {
        const saveYaw = bot.yaw, savePitch = bot.pitch;
        bot.yaw += (rng() - 0.5) * 2 * b.aimErr;
        bot.pitch += (rng() - 0.5) * 2 * b.aimErr;
        fireWeapon(state, bot, rng, shotOut);
        bot.yaw = saveYaw; bot.pitch = savePitch;
        b.burstLeft--;
        if (b.burstLeft <= 0) b.pauseUntil = now + 0.5 + rng() * 0.7;
        return shotOut; // sim draws tracers + sound from this
      }
    }
    // Hold position while fighting (strafe a little).
    steerTo(bot, bot.x + Math.sin(now * 0.7 + bot.id) * 0.4, bot.z + Math.cos(now * 0.6 + bot.id) * 0.4, 0.8);
    return null;
  }

  // --- objective behaviour ---
  const sp = state.spike;
  if (b.role === 'atk') {
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
    // Push toward the assigned site.
    if (b.mode !== 'push' || b.pathI >= b.path.length) {
      const siteNode = b.site === 'A' ? 16 : 15;
      const from = nearestWaypoint(wps, bot.x, bot.z);
      findPath(wps, from, siteNode, b.path);
      b.pathI = 0;
      b.mode = 'push';
    }
    followPath(state, bot, dt);
  } else {
    // Defenders.
    if (sp.state === 'planted') {
      // Converge on the planted spike; nearest one defuses.
      const dSpike = Math.hypot(sp.x - bot.x, sp.z - bot.z);
      if (dSpike < 2.2) {
        b.mode = 'defuse';
        return null;
      }
      if (b.mode !== 'push' || b.pathI >= b.path.length) {
        const from = nearestWaypoint(wps, bot.x, bot.z);
        const target = sp.site === 'A' ? 16 : 15;
        findPath(wps, from, target, b.path);
        b.pathI = 0;
        b.mode = 'push';
      }
      followPath(state, bot, dt);
    } else if (b.mode === 'investigate') {
      const d = steerTo(bot, b.lastSeenX, b.lastSeenZ, 3.8);
      if (d < 1.5) { b.mode = 'hold'; b.holdT = 2 + rng() * 3; }
    } else {
      // Hold a site angle, shift spots now and then.
      b.holdT -= dt;
      if (b.holdT <= 0) {
        const site = sites[b.site];
        const a = rng() * Math.PI * 2;
        const r = 2 + rng() * 4;
        b.tx = site.x + Math.cos(a) * r;
        b.tz = site.z + Math.sin(a) * r;
        b.holdT = 4 + rng() * 5;
      }
      steerTo(bot, b.tx, b.tz, 2.2);
      // Scan: slow yaw sweep while holding.
      bot.yaw += Math.sin(now * 0.5 + bot.id * 2) * dt * 0.5;
    }
  }
  return null;
}
