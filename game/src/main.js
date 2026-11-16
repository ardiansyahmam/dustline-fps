// DUSTLINE — main: bootstrap, fixed-step loop, screenshot staging.
// Runs the sim at 60 Hz (accumulator), renders every frame, drains the
// tracer/sfx/explosion queues the sim filled.

import * as THREE from 'three';
import { createState, createAgent, PHASE, TEAM } from './state.js';
import { createSim, startMatch, stepSim, STEP } from './sim.js';
import { createWorld, syncWorld, addTracer, triggerExplosion } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud, updateHud } from './hud.js';
import { makeWeapon } from './weapons.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const shot = params.get('shot') || '';

const canvas = document.getElementById('game');
const state = createState(seed);
const world = createWorld(THREE, canvas, seed);
createSim(state, world.mapData, null);
state.rng = (() => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const input = createInput(canvas, state);
const audio = createAudio();
const hud = createHud(state);

window.addEventListener('error', (e) => {
  const n = document.getElementById('err');
  if (n) { n.style.display = 'block'; n.textContent = 'ERROR: ' + (e.message || e.error); }
});

// ---- screenshot staging (?shot=menu|fight|site|bomb) ----
function stageShot(kind) {
  const p = state.player;
  const bots = state.agents.filter((a) => a.isBot);
  const ally = (i) => state.agents[1 + i];
  const enemy = (i) => state.agents[3 + i];
  startMatch(state);
  state.phase = PHASE.LIVE;
  state.phaseT = 88;
  if (kind === 'menu') {
    state.phase = PHASE.BUY;
    state.phaseT = 12;
    p.x = 0; p.z = 18; p.yaw = 0; p.pitch = 0.02;
    ally(0).x = -3; ally(0).z = 14; ally(0).yaw = 0;
    ally(1).x = 3; ally(1).z = 15; ally(1).yaw = 0.3;
    hud.toggleBuy(true);
  } else if (kind === 'fight') {
    p.weapons[0] = makeWeapon('talon'); p.weapon = p.weapons[0]; p.slot = 0;
    p.x = 0; p.z = 10; p.yaw = -0.14; p.pitch = 0; // aim at Dune (2,-4) so the scoped cover centers an enemy
    enemy(0).x = 2; enemy(0).z = -4; enemy(0).yaw = Math.PI;
    enemy(1).x = -5; enemy(1).z = -1; enemy(1).yaw = Math.PI - 0.4;
    enemy(2).x = 6; enemy(2).z = -7; enemy(2).yaw = Math.PI + 0.3;
    ally(0).x = -2.5; ally(0).z = 12; ally(0).yaw = 0;
    ally(1).x = 3; ally(1).z = 13; ally(1).yaw = -0.2;
    state.tracerQueue.push({ x0: 0, y0: 1.5, z0: 10, x1: 2, y1: 1.3, z1: -4 });
    state.hitmark = 0.2;
    state.input.aim = true; // cover shot: Talon 2x scope active
  } else if (kind === 'site') {
    p.x = 14; p.z = -5; p.yaw = -1.14; p.pitch = 0.01;
    state.spike.state = 'planted';
    state.spike.site = 'A';
    state.spike.x = 25; state.spike.z = -10;
    state.spike.timer = 30;
    enemy(0).x = 27; enemy(0).z = -13; enemy(0).yaw = Math.PI - 0.6;
    enemy(1).x = 19; enemy(1).z = -14; enemy(1).yaw = Math.PI;
    ally(0).x = 18; ally(0).z = -2; ally(0).yaw = -0.5;
  } else if (kind === 'bomb') {
    p.weapons[0] = makeWeapon('talon'); p.weapon = p.weapons[0]; p.slot = 0;
    p.x = 22; p.z = -7; p.yaw = 0.5; p.pitch = 0.02;
    state.spike.state = 'planting';
    state.spike.site = 'A';
    state.spike.carrier = p;
    state.spike.x = 22; state.spike.z = -7;
    state.spike.progress = 0.6;
    state.smokes[0] = { x: 20, y: 0, z: -9, life: 7, maxLife: 9, r: 5 };
    enemy(0).x = 26; enemy(0).z = -14; enemy(0).yaw = Math.PI - 0.6;
    enemy(1).x = 18; enemy(1).z = -12; enemy(1).yaw = Math.PI + 0.3;
    ally(0).x = 19; ally(0).z = -3; ally(0).yaw = 0.2;
  }
  // The round-start banner is stale for action shots — keep it only on menu.
  if (kind !== 'menu') { state.bannerT = 0; state.banner = ''; state.bannerSub = ''; }
  void bots;
}

if (shot) stageShot(shot);

// ---- menu click to play ----
// The #menu / #match overlays cover the canvas (z-index 10), so clicks land
// on them, not on the canvas — bind the start handler to all three.
function tryStart() {
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH) {
    audio.resume();
    startMatch(state);
    input.lock();
  }
}
canvas.addEventListener('mousedown', tryStart);
document.getElementById('menu').addEventListener('mousedown', tryStart);
document.getElementById('match').addEventListener('mousedown', tryStart);

// ---- main loop ----
let last = performance.now();
const bootT = last; // screenshots wait for the GLB models (or 10 s max)
let acc = 0;
let frames = 0;
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (!shot) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      stepSim(state, STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
  } else if (!frozen) {
    // Shot mode: settle the sim for ~1s, then freeze the frame.
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      stepSim(state, STEP);
      acc -= STEP;
      steps++;
    }
    if (state.time > 1.0) frozen = true;
  }

  // Drain sim queues into render/audio.
  for (const t of state.tracerQueue) addTracer(world, t.x0, t.y0, t.z0, t.x1, t.y1, t.z1);
  state.tracerQueue.length = 0;
  if (state.explosion) {
    triggerExplosion(world, state.explosion.x, state.explosion.y, state.explosion.z);
    state.explosion = null;
  }
  if (!shot) audio.drain(state);
  else state.sfx.length = 0;

  syncWorld(world, THREE, state, dt);
  updateHud(hud, state);
  input.clearEdges();

  frames++;
  // In shot mode the screenshot tool waits for this flag: only fire once
  // the GLB characters are loaded (or 10 s passed, so a failed fetch can
  // never hang the tool — the box figures stay as the fallback).
  if (shot && frames >= 3 && (world.modelsReady || now - bootT > 10000)) window.__dustlineReady = true;
}

window.addEventListener('resize', () => {
  world.camera.aspect = window.innerWidth / window.innerHeight;
  world.camera.updateProjectionMatrix();
  world.renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug/QA hook (also used by the screenshot tool): scene internals.
window.__dustline = { world, state, THREE };

requestAnimationFrame(frame);
