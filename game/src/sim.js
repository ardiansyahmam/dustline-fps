// DUSTLINE — sim: fixed-step (60 Hz) gameplay. Movement, shooting,
// grenades, spike plant/defuse, rounds and economy. Render and HUD only
// read the state; this module is the only writer of gameplay state.

import { PHASE, TEAM, ROUND_TIME, BUY_TIME, END_TIME, WIN_ROUNDS, PLANT_TIME, DEFUSE_TIME, SPIKE_TIME, START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, LOSS_STREAK_BONUS, PLANT_REWARD, createState, createAgent, addFeed, setBanner } from './state.js';
import { circleVsAABB, clamp } from './utils.js';
import { WEAPONS, makeWeapon, canFire, fireWeapon, applyDamage, startReload, finishReload } from './weapons.js';
import { createBrain, updateBot, botHeardShot } from './bots.js';

export const STEP = 1 / 60;

const PLAYER_SPEED = 4.4;
const PLAYER_SLOW = 2.6;
const PLAYER_CROUCH = 2.1;
const BOT_SPEED = 3.6;
const RADIUS = 0.38;
const GRAVITY = 16;
const JUMP_V = 5.4;

export function createSim(state, mapData, rng) {
  state.mapData = mapData;
  state.solids = mapData.colliders;
  state.rng = rng;
  state.tracerQueue = [];
  state.sfx = [];
  state.camAgent = null;
  state.explosion = null;

  // Player + 2 ally bots vs 3 enemy bots.
  const player = createAgent(0, 'You', TEAM.ATK, true, false);
  player.weapons[1] = makeWeapon('mule');
  player.weapons[0] = null;
  player.weapon = player.weapons[1];
  player.slot = 1;
  const rook = createAgent(1, 'Rook', TEAM.ATK, false, true);
  const sable = createAgent(2, 'Sable', TEAM.ATK, false, true);
  const dune = createAgent(3, 'Dune', TEAM.DEF, false, true);
  const vex = createAgent(4, 'Vex', TEAM.DEF, false, true);
  const hollow = createAgent(5, 'Hollow', TEAM.DEF, false, true);
  state.agents = [player, rook, sable, dune, vex, hollow];
  state.player = player;

  rook.brain = createBrain('atk', 0);
  sable.brain = createBrain('atk', 0);
  dune.brain = createBrain('def', 16);
  vex.brain = createBrain('def', 15);
  hollow.brain = createBrain('def', 17);
  rook.weapon = makeWeapon('vulture');
  sable.weapon = makeWeapon('kestrel');
  dune.weapon = makeWeapon('vulture');
  vex.weapon = makeWeapon('dune');
  hollow.weapon = makeWeapon('kestrel');
  return state;
}

export function startMatch(state) {
  state.score = [0, 0];
  state.lossStreak = [0, 0];
  state.round = 1;
  state.money = START_MONEY;
  state.matchWinner = -1;
  startRound(state);
}

function placeAgents(state) {
  const spawns = state.mapData.spawns;
  const atkSpawns = spawns.atk, defSpawns = spawns.def;
  const atk = state.agents.filter((a) => a.team === TEAM.ATK);
  const def = state.agents.filter((a) => a.team === TEAM.DEF);
  atk.forEach((a, i) => {
    const s = atkSpawns[i % atkSpawns.length];
    a.x = s[0]; a.z = s[1]; a.y = 0; a.vx = 0; a.vy = 0; a.vz = 0;
    a.yaw = 0; // face north (-z), toward mid and the sites
    a.pitch = 0; a.hp = 100; a.alive = true;
    a.reloading = false; a.spread = 0; a.recoil = 0;
  });
  def.forEach((a, i) => {
    const s = defSpawns[i % defSpawns.length];
    a.x = s[0]; a.z = s[1]; a.y = 0; a.vx = 0; a.vy = 0; a.vz = 0;
    a.yaw = Math.PI; // face south (+z), toward the attackers
    a.pitch = 0; a.hp = 100; a.alive = true;
    a.reloading = false; a.spread = 0; a.recoil = 0;
  });
  // Bot site assignments alternate by round.
  const atkBots = [state.agents[1], state.agents[2]];
  atkBots[0].brain.site = state.round % 2 === 1 ? 'A' : 'B';
  atkBots[1].brain.site = state.round % 2 === 1 ? 'B' : 'A';
  atkBots.forEach((b) => { b.brain.mode = 'hold'; b.brain.pathI = 99; b.brain.holdT = 0; });
  const defBots = [state.agents[3], state.agents[4], state.agents[5]];
  defBots[0].brain.site = 'A';
  defBots[1].brain.site = 'B';
  defBots[2].brain.site = state.round % 2 === 1 ? 'A' : 'B';
  defBots.forEach((b) => { b.brain.mode = 'hold'; b.brain.holdT = 0; });
}

export function startRound(state) {
  placeAgents(state);
  state.phase = PHASE.BUY;
  state.phaseT = BUY_TIME;
  state.spike = { state: 'carried', carrier: state.player, site: null, x: 0, y: 0, z: 0, progress: 0, timer: 0, beepAt: 0 };
  state.smokes = [null, null, null, null, null, null];
  state.frags = [];
  state.feed = [];
  state.tracerQueue.length = 0;
  state.roundWinner = -1;
  state.roundReason = '';
  state.camAgent = state.player;
  setBanner(state, `RONDE ${state.round}`, 'Fase beli — tekan B untuk belanja', 3);
}

// ---- movement ----

const _out = { x: 0, z: 0 };

function integrateAgent(state, a, dt, wishX, wishZ, maxSpeed) {
  const accel = a.onGround ? 42 : 12;
  const wlen = Math.hypot(wishX, wishZ);
  let tx = wishX, tz = wishZ;
  if (wlen > maxSpeed) { tx = (wishX / wlen) * maxSpeed; tz = (wishZ / wlen) * maxSpeed; }
  a.vx += clamp(tx - a.vx, -accel * dt, accel * dt);
  a.vz += clamp(tz - a.vz, -accel * dt, accel * dt);
  if (wlen < 0.05 && a.onGround) {
    // Friction when idle.
    const f = Math.max(0, 1 - 10 * dt);
    a.vx *= f; a.vz *= f;
    if (Math.abs(a.vx) < 0.05) a.vx = 0;
    if (Math.abs(a.vz) < 0.05) a.vz = 0;
  }
  a.vy -= GRAVITY * dt;
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  a.y += a.vy * dt;
  if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
  else a.onGround = false;
  // Collide with solid boxes (two passes for corners).
  for (let pass = 0; pass < 2; pass++) {
    for (const b of state.solids) {
      if (b.y1 < 0.3) continue;
      _out.x = a.x; _out.z = a.z;
      if (circleVsAABB(a.x, a.z, RADIUS, b, _out)) {
        // Kill velocity into the wall.
        if (_out.x !== a.x) a.vx = 0;
        if (_out.z !== a.z) a.vz = 0;
        a.x = _out.x; a.z = _out.z;
      }
    }
  }
  // Map bounds.
  a.x = clamp(a.x, -31.5, 31.5);
  a.z = clamp(a.z, -21.5, 21.5);
}

function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  if (!p.alive) return;
  // Look.
  p.yaw -= input.lookDX * 0.0022;
  p.pitch = clamp(p.pitch - input.lookDY * 0.0022, -1.5, 1.5);
  input.lookDX = 0; input.lookDY = 0;
  p.crouched = input.crouch;
  p.strafe = input.strafe;
  const speed = input.crouch ? PLAYER_CROUCH : input.slow ? PLAYER_SLOW : PLAYER_SPEED;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const wx = (fx * input.fwd + rx * input.strafe) * speed;
  const wz = (fz * input.fwd + rz * input.strafe) * speed;
  if (input.jump && p.onGround) { p.vy = JUMP_V; p.onGround = false; }
  integrateAgent(state, p, dt, wx, wz, speed);
}

// ---- shooting ----

const _shotOut = [];

function doShoot(state, shooter) {
  const results = fireWeapon(state, shooter, state.rng, _shotOut);
  const eyeY = shooter.crouched ? 1.12 : 1.62;
  for (const r of results) {
    state.tracerQueue.push({
      x0: shooter.x, y0: shooter.y + eyeY, z0: shooter.z,
      x1: r.point[0], y1: r.point[1], z1: r.point[2],
    });
    if (r.hit) {
      const res = applyDamage(state, r.hit, shooter.weapon.def.damage, r.part, shooter);
      if (res === 'kill') onKill(state, shooter, r.hit);
      else state.sfx.push(shooter.isPlayer ? 'hit' : 'hitFar');
    }
  }
  state.flashT = shooter.isPlayer ? 0.05 : 0;
  state.sfx.push(shooter.isPlayer ? 'shot' : 'shotFar');
  botHeardShot(state, shooter);
}

function onKill(state, attacker, victim) {
  addFeed(state, `${attacker.name} ▸ ${victim.name}`);
  if (attacker.isPlayer) {
    state.money += KILL_REWARD;
    state.sfx.push('kill');
  }
  if (victim.isPlayer) state.sfx.push('death');
  // Spike carrier drops the spike.
  if (state.spike.carrier === victim) {
    state.spike.state = 'dropped';
    state.spike.carrier = null;
    state.spike.x = victim.x; state.spike.z = victim.z;
    state.spike.progress = 0;
  }
  checkElimination(state);
}

function checkElimination(state) {
  if (state.phase !== PHASE.LIVE) return;
  if (state.spike.state === 'planted') return; // spike decides the round
  const atkAlive = state.agents.some((a) => a.team === TEAM.ATK && a.alive);
  const defAlive = state.agents.some((a) => a.team === TEAM.DEF && a.alive);
  if (!atkAlive) endRound(state, TEAM.DEF, 'Tim musuh dihabisi');
  else if (!defAlive) endRound(state, TEAM.ATK, 'Tim musuh dihabisi');
}

// ---- spike (bomb) ----

function siteAt(state, x, z) {
  for (const key of ['A', 'B']) {
    const s = state.mapData.sites[key];
    if (Math.hypot(s.x - x, s.z - z) <= s.r) return key;
  }
  return null;
}

function updateSpike(state, dt) {
  const sp = state.spike;
  if (sp.state === 'carried' || sp.state === 'dropped') {
    // Pickup: a living attacker walks over a dropped spike.
    if (sp.state === 'dropped') {
      for (const a of state.agents) {
        if (a.team === TEAM.ATK && a.alive && Math.hypot(a.x - sp.x, a.z - sp.z) < 1.5) {
          sp.state = 'carried'; sp.carrier = a; sp.progress = 0;
          if (a.isPlayer) addFeed(state, 'Kamu mengambil spike');
          break;
        }
      }
    }
    return;
  }
  if (sp.state === 'planting') {
    const c = sp.carrier;
    const ok = c && c.alive && siteAt(state, c.x, c.z) === sp.site;
    if (!ok) { sp.state = 'carried'; sp.progress = 0; return; }
    sp.progress += dt / PLANT_TIME;
    sp.x = c.x; sp.z = c.z;
    if (sp.progress >= 1) {
      sp.state = 'planted';
      sp.timer = SPIKE_TIME;
      sp.progress = 0;
      state.money += PLANT_REWARD;
      addFeed(state, 'Spike ditanam di Site ' + sp.site);
      setBanner(state, 'SPIKE DITANAM', 'Site ' + sp.site + ' — pertahankan sampai meledak', 3);
      state.sfx.push('planted');
    }
    return;
  }
  if (sp.state === 'defusing') {
    const d = state.agents.find((a) => a.brain && a.brain.mode === 'defuse' && a.alive);
    const ok = d && Math.hypot(d.x - sp.x, d.z - sp.z) < 2.4;
    if (!ok) { sp.state = 'planted'; sp.progress = 0; return; }
    sp.progress += dt / DEFUSE_TIME;
    if (sp.progress >= 1) {
      sp.state = 'defused';
      endRound(state, TEAM.DEF, 'Spike berhasil dijinakkan');
    }
    return;
  }
  if (sp.state === 'planted') {
    sp.timer -= dt;
    // Accelerating beeps as the timer runs down.
    const interval = 1.1 - (1 - sp.timer / SPIKE_TIME) * 0.75;
    if (state.time - sp.beepAt > interval) {
      sp.beepAt = state.time;
      state.sfx.push('beep');
    }
    if (sp.timer <= 0) {
      sp.state = 'exploded';
      state.explosion = { x: sp.x, y: 0, z: sp.z };
      state.sfx.push('explosion');
      state.cameraShake = 1;
      for (const a of state.agents) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - sp.x, a.z - sp.z);
        if (d < 13) {
          const dmg = 120 - d * 7;
          if (applyDamage(state, a, dmg, 'body', null) === 'kill') {
            addFeed(state, `${a.name} tewas oleh ledakan`);
          }
        }
      }
      endRound(state, TEAM.ATK, 'Spike meledak');
    }
  }
}

// ---- grenades ----

function throwGrenade(state, agent, kind) {
  if (kind === 'frag' && agent.grenades.frag <= 0) return false;
  if (kind === 'smoke' && agent.grenades.smoke <= 0) return false;
  if (kind === 'frag') agent.grenades.frag--;
  else agent.grenades.smoke--;
  const fx = -Math.sin(agent.yaw), fz = -Math.cos(agent.yaw);
  const eyeY = agent.crouched ? 1.12 : 1.62;
  state.frags.push({
    x: agent.x + fx * 0.5, y: agent.y + eyeY, z: agent.z + fz * 0.5,
    vx: fx * 13, vy: 3.2 + Math.sin(agent.pitch) * 8, vz: fz * 13,
    kind, fuse: 1.5, owner: agent, bounced: false,
  });
  state.sfx.push('throw');
  return true;
}

function updateGrenades(state, dt) {
  for (let i = state.frags.length - 1; i >= 0; i--) {
    const g = state.frags[i];
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    g.fuse -= dt;
    if (g.y <= 0.12) {
      g.y = 0.12;
      if (Math.abs(g.vy) > 1.5) { g.vy = -g.vy * 0.35; g.vx *= 0.7; g.vz *= 0.7; g.bounced = true; }
      else { g.vy = 0; g.vx *= 0.85; g.vz *= 0.85; }
      if (g.kind === 'smoke' && !g.bounced) { /* keep rolling until it stops */ }
    }
    let done = g.fuse <= 0;
    if (g.kind === 'smoke' && g.bounced && Math.hypot(g.vx, g.vz) < 0.6) done = true;
    if (!done) continue;
    if (g.kind === 'frag') {
      state.explosion = { x: g.x, y: g.y, z: g.z, small: true };
      state.sfx.push('explosion');
      const pd = Math.hypot(state.player.x - g.x, state.player.z - g.z);
      if (pd < 14) state.cameraShake = Math.max(state.cameraShake, 1 - pd / 14);
      for (const a of state.agents) {
        if (!a.alive || a === g.owner) continue;
        const d = Math.hypot(a.x - g.x, a.z - g.z);
        if (d < 6.5) {
          const dmg = 95 - d * 11;
          if (applyDamage(state, a, dmg, 'body', g.owner) === 'kill') onKill(state, g.owner, a);
        }
      }
    } else {
      // Smoke: claim the oldest free slot.
      let slot = state.smokes.findIndex((s) => !s);
      if (slot === -1) slot = 0;
      state.smokes[slot] = { x: g.x, y: g.y, z: g.z, life: 14, maxLife: 14 };
      state.sfx.push('smoke');
    }
    state.frags.splice(i, 1);
  }
  for (let i = 0; i < state.smokes.length; i++) {
    const s = state.smokes[i];
    if (s) { s.life -= dt; if (s.life <= 0) state.smokes[i] = null; }
  }
}

// ---- rounds & economy ----

export function endRound(state, winner, reason) {
  if (state.phase !== PHASE.LIVE) return;
  state.score[winner]++;
  state.roundWinner = winner;
  state.roundReason = reason;
  const loser = 1 - winner;
  state.lossStreak[loser] = Math.min(3, state.lossStreak[loser] + 1);
  state.lossStreak[winner] = 0;
  const winPay = WIN_REWARD;
  const lossPay = LOSS_REWARD + (state.lossStreak[loser] - 1) * LOSS_STREAK_BONUS;
  if (winner === TEAM.ATK) state.money += winPay;
  else state.money += lossPay;
  const name = winner === TEAM.ATK ? 'TIM PENYERANG MENANG' : 'TIM BERTAHAN MENANG';
  setBanner(state, name, reason, END_TIME);
  state.sfx.push(winner === TEAM.ATK ? 'roundWin' : 'roundLose');
  state.phase = PHASE.END;
  state.phaseT = END_TIME;
}

function nextPhase(state) {
  if (state.score[TEAM.ATK] >= WIN_ROUNDS || state.score[TEAM.DEF] >= WIN_ROUNDS) {
    state.matchWinner = state.score[TEAM.ATK] >= WIN_ROUNDS ? TEAM.ATK : TEAM.DEF;
    state.phase = PHASE.MATCH;
    setBanner(state, state.matchWinner === TEAM.ATK ? 'KEMENANGAN!' : 'KEKALAHAN',
      `Skor akhir ${state.score[0]} — ${state.score[1]}. Klik untuk main lagi.`, 999);
    return;
  }
  state.round++;
  startRound(state);
}

// ---- the fixed step ----

export function stepSim(state, dt) {
  state.time += dt;
  // Decay timers.
  state.flashT = Math.max(0, state.flashT - dt);
  state.hitmark = Math.max(0, state.hitmark - dt);
  state.cameraShake = Math.max(0, state.cameraShake - dt * 1.6);
  state.bannerT = Math.max(0, state.bannerT - dt);
  for (const a of state.agents) {
    a.flash = Math.max(0, a.flash - dt);
    a.spread = Math.max(0, a.spread - dt * 0.22);
    a.recoil = Math.max(0, a.recoil - dt * 0.4);
    if (a.reloading && state.time >= a.reloadEnd) finishReload(a);
  }

  if (state.phase === PHASE.BUY) {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      state.phase = PHASE.LIVE;
      state.phaseT = ROUND_TIME;
      setBanner(state, 'RONDE DIMULAI', 'Tanam spike atau habisi musuh', 2.5);
      state.sfx.push('roundStart');
    }
    return;
  }
  if (state.phase === PHASE.END) {
    state.phaseT -= dt;
    if (state.phaseT <= 0) nextPhase(state);
    return;
  }
  if (state.phase !== PHASE.LIVE) return;

  // Round timer only runs while the spike is not planted.
  if (state.spike.state !== 'planted') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      endRound(state, TEAM.DEF, 'Waktu habis — spike tidak ditanam');
      return;
    }
  }

  // --- player ---
  const p = state.player;
  const input = state.input;
  if (p.alive) {
    updatePlayer(state, dt);
    // Weapon slots.
    if (input.slot === 0 && p.weapons[0]) { p.weapon = p.weapons[0]; p.slot = 0; }
    if (input.slot === 1 && p.weapons[1]) { p.weapon = p.weapons[1]; p.slot = 1; }
    input.slot = -1;
    // Reload.
    if (input.reload) { startReload(p, state.time); input.reload = false; }
    // Fire: auto weapons hold, semi weapons need a fresh press.
    const wantFire = input.fire && (p.weapon.def.auto || !p._prevFire);
    if (wantFire && canFire(p, state.time)) doShoot(state, p);
    p._prevFire = input.fire;
    // Grenade.
    if (input.grenade) {
      input.grenade = false;
      if (p.grenades.frag > 0) throwGrenade(state, p, 'frag');
      else if (p.grenades.smoke > 0) throwGrenade(state, p, 'smoke');
    }
    // Plant: hold E inside a site while carrying.
    const sp = state.spike;
    if (input.interact && sp.carrier === p && sp.state === 'carried') {
      const site = siteAt(state, p.x, p.z);
      if (site) {
        sp.state = 'planting';
        sp.site = site;
        sp.x = p.x; sp.z = p.z;
        sp.progress = 0;
      }
    }
  }
  // Spectate: camera follows the player, or the first living ally.
  state.camAgent = p.alive ? p : (state.agents.find((a) => a.team === TEAM.ATK && a.alive) || p);
  if (!p.alive) { input.lookDX = 0; input.lookDY = 0; }

  // --- bots ---
  for (const a of state.agents) {
    if (!a.isBot || !a.alive) continue;
    const shot = updateBot(state, a, dt, state.rng, _shotOut);
    if (shot) {
      for (const r of shot) {
        const eyeY = a.crouched ? 1.12 : 1.62;
        state.tracerQueue.push({
          x0: a.x, y0: a.y + eyeY, z0: a.z,
          x1: r.point[0], y1: r.point[1], z1: r.point[2],
        });
        if (r.hit) {
          const res = applyDamage(state, r.hit, a.weapon.def.damage, r.part, a);
          if (res === 'kill') onKill(state, a, r.hit);
        }
      }
      state.sfx.push('shotFar');
      botHeardShot(state, a);
    }
    // Bot movement from its steering target.
    const wishX = a.brain.tx - a.x, wishZ = a.brain.tz - a.z;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0.05) {
      const s = Math.min(BOT_SPEED, wl);
      integrateAgent(state, a, dt, (wishX / wl) * s, (wishZ / wl) * s, BOT_SPEED);
    } else {
      integrateAgent(state, a, dt, 0, 0, BOT_SPEED);
    }
  }

  updateSpike(state, dt);
  updateGrenades(state, dt);

  // Bot plant/defuse channels are driven by their brain mode.
  const sp = state.spike;
  if (sp.state === 'carried' && sp.carrier && sp.carrier.isBot) {
    const c = sp.carrier;
    if (c.brain.mode === 'plant') {
      sp.state = 'planting';
      sp.site = siteAt(state, c.x, c.z) || c.brain.site;
      sp.x = c.x; sp.z = c.z;
      sp.progress = 0;
    }
  }
  if (sp.state === 'planted') {
    const d = state.agents.find((a) => a.isBot && a.alive && a.brain.mode === 'defuse');
    if (d) sp.state = 'defusing';
  }
}
