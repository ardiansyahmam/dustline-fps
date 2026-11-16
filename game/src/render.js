// DUSTLINE — render: three.js scene, lighting, bot figures, viewmodel,
// tracers, smoke, spike and explosion. Mirrors sim state into the scene;
// preallocated (no `new` in the per-frame path).

import * as THREE from 'three';
import { buildMap, makeTextures } from './map.js';
import { mulberry32 } from './utils.js';
import { loadCharacter, cloneCharacter } from './gltf.js';

const TEAM_COLOR = [0x2fa8a0, 0xc25a2e];   // ATK teal, DEF rust
const TEAM_DARK = [0x1d5a56, 0x7a3016];
const MODEL_URL = {
  pilot: 'models/aircrew-pilot-e6b732.glb',
  knight: 'models/armoured-knight-hero-07121f.glb',
  monk: 'models/buddhist-monk-39f498.glb',
};
// Which Polyfork character each bot wears. Enemies are all different;
// the two allies share the pilot, told apart by team accents.
const MODEL_FOR_AGENT = { 1: 'pilot', 2: 'pilot', 3: 'knight', 4: 'pilot', 5: 'monk' };
const TARGET_HEIGHT = 1.78; // normalise every model to this height so the
// analytic hitboxes (head 1.45-1.78) keep working.

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Rich warm sunset gradient sky (canvas texture, no external file):
  // burnt orange up top, golden haze at the horizon — the dust-basin
  // identity, pushed bolder so the first screenshot pops.
  const skyC = document.createElement('canvas');
  skyC.width = 16; skyC.height = 512;
  const sk = skyC.getContext('2d');
  const skyGrad = sk.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#a34d12');
  skyGrad.addColorStop(0.45, '#e07f2a');
  skyGrad.addColorStop(0.75, '#f7b95e');
  skyGrad.addColorStop(1, '#ffd27a');
  sk.fillStyle = skyGrad; sk.fillRect(0, 0, 16, 512);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.FogExp2(0xc98d4e, 0.0135);

  const hemi = new THREE.HemisphereLight(0xffe0b0, 0x8a6a44, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(28, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 400);
  scene.add(camera);

  // Sun disc sprite (procedural radial glow, no external texture)
  const sc = document.createElement('canvas');
  sc.width = 128; sc.height = 128;
  const sg = sc.getContext('2d');
  const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,214,1)');
  grad.addColorStop(0.35, 'rgba(255,220,150,0.85)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sc);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }));
  sunSprite.position.set(140, 150, -90);
  sunSprite.scale.set(90, 90, 1);
  scene.add(sunSprite);

  return { renderer, scene, camera, sun };
}

// ---- bot figure: boxes only, team-coloured, ~6 meshes each ----
// Kept as the fallback while the GLB models load (or if a fetch fails).
export function createBotFigure(THREE, team) {
  const color = TEAM_COLOR[team];
  const dark = TEAM_DARK[team];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.8, emissive: 0x224444, emissiveIntensity: 0.6 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), bodyMat);
  torso.position.y = 1.08; torso.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.06), darkMat);
  chest.position.set(0, 1.18, 0.17);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), bodyMat);
  head.position.y = 1.58; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.06), visorMat);
  visor.position.set(0, 1.58, 0.17);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.82, 0.22), darkMat);
  legL.position.set(-0.14, 0.41, 0); legL.castShadow = true;
  const legR = legL.clone(); legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), darkMat);
  gun.position.set(0.22, 1.22, 0.32); gun.castShadow = true;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.14), darkMat);
  pack.position.set(0, 1.12, -0.22);

  g.add(torso, chest, head, visor, legL, legR, gun, pack);
  g.userData = { torso, head, legL, legR, gun, bodyMat, walkPhase: 0 };
  return g;
}

function makeNametag(THREE, name, team) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name, 128, 32);
  g.fillStyle = team === 0 ? '#5fe8de' : '#ffb08a';
  g.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(1.5, 0.375, 1);
  spr.position.y = 2.06;
  return spr;
}

// ---- bot figure from a Polyfork GLB character (skinned, animated) ----
export function createGlbFigure(THREE, model, team, name) {
  const clone = cloneCharacter(THREE, model);
  const s = TARGET_HEIGHT / clone.height;
  const outer = new THREE.Group();
  const body = new THREE.Group(); // flinch lean + breathing live here
  const modelGroup = clone.group;
  modelGroup.scale.setScalar(s);
  body.add(modelGroup);
  // Held gun (box, like the old figure) + team accent stripe. The gun is
  // tinted to the bot's current weapon color (see syncWorld); the stripe
  // stays the team color.
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.55 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), gunMat);
  gun.position.set(0.24, 1.22, 0.32); gun.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.03, 0.4),
    new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.5, metalness: 0.3 }));
  stripe.position.set(0.24, 1.29, 0.32);
  body.add(gun, stripe);
  // Bot muzzle flash at the gun tip.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
  flash.position.set(0.24, 1.24, 0.72);
  body.add(flash);
  outer.add(body);
  // Name tag + team ring (stay upright, on the outer group).
  const tag = makeNametag(THREE, name, team);
  outer.add(tag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32),
    new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  outer.add(ring);

  const mixer = new THREE.AnimationMixer(modelGroup);
  const actions = {};
  for (const key of ['Idle', 'Walk', 'Run']) {
    if (clone.clips[key]) {
      const a = mixer.clipAction(clone.clips[key]);
      a.play();
      a.weight = key === 'Idle' ? 1 : 0;
      actions[key.toLowerCase()] = a;
    }
  }
  const mats = [];
  modelGroup.traverse((o) => { if (o.isSkinnedMesh) mats.push(o.material); });
  outer.userData = {
    kind: 'glb', mixer, actions, curAction: 'idle', body, mats, gunMat,
    flash, flashMat, tag, ring, flinchT: 0, prevFlash: 0,
  };
  return outer;
}

// ---- viewmodel: the player's own gun, boxes on the camera ----
// Colored per weapon (see weapons.js def.color / colorDark): the receiver
// takes the weapon's vivid color, barrel + magazine its dark shade, grip
// stays dark, sight picks up the bright color. No more all-black gun.
function createViewmodel(THREE, camera) {
  const receiverMat = new THREE.MeshStandardMaterial({ color: 0x8fa3c8, roughness: 0.5, metalness: 0.55 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a5a78, roughness: 0.5, metalness: 0.6 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.55 });
  const sightMat = new THREE.MeshStandardMaterial({ color: 0x8fa3c8, roughness: 0.4, metalness: 0.6 });
  const g = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), receiverMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), barrelMat);
  barrel.position.set(0, 0.02, -0.4);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), barrelMat);
  mag.position.set(0, -0.14, -0.02); mag.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), sightMat);
  sight.position.set(0, 0.1, -0.08);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), gripMat);
  grip.position.set(0, -0.12, 0.16); grip.rotation.x = 0.3;
  // Bright accent stripe along the receiver so the color reads at a glance.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.4, metalness: 0.4, emissive: 0x664400, emissiveIntensity: 0.7 });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.3), stripeMat);
  stripe.position.set(0, 0.075, -0.05);
  g.add(receiver, barrel, mag, sight, grip, stripe);
  // Muzzle flash: additive quad + light at the barrel tip
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.position.set(0, 0.02, -0.62);
  const flashLight = new THREE.PointLight(0xffb050, 0, 9, 1.8);
  flashLight.position.set(0, 0, -0.6);
  g.add(flash, flashLight);
  g.position.set(0.27, -0.25, -0.55);
  camera.add(g);
  return { group: g, flashMat, flashLight, kick: 0, swayX: 0, swayY: 0, receiverMat, barrelMat, sightMat, stripeMat, weaponId: '' };
}

// Recolor the viewmodel to the current weapon (called from syncWorld when
// the player's weapon changes). Receiver = vivid color, barrel/mag = dark
// shade, sight = vivid color, stripe = gold accent.
export function setViewmodelWeapon(vm, def) {
  if (!def || vm.weaponId === def.id) return;
  vm.weaponId = def.id;
  vm.receiverMat.color.setHex(def.color);
  vm.barrelMat.color.setHex(def.colorDark);
  vm.sightMat.color.setHex(def.color);
}

// ---- world assembly ----
export function createWorld(THREE, canvas, seed) {
  const base = createRenderer(canvas);
  const rng = mulberry32(seed);
  const textures = makeTextures(THREE, rng);
  const mapData = buildMap(THREE, base.scene, textures, rng);

  const viewmodel = createViewmodel(THREE, base.camera);

  // Tracers: one LineSegments, 8 pooled slots
  const TRACER_MAX = 8;
  const tracerPos = new Float32Array(TRACER_MAX * 6);
  const tracerCol = new Float32Array(TRACER_MAX * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  tracers.frustumCulled = false;
  base.scene.add(tracers);

  // Smoke puffs: instanced spheres
  const smokeMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xcfc4b0, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }),
    6,
  );
  smokeMesh.frustumCulled = false;
  base.scene.add(smokeMesh);

  // Spike (bomb) model + blinking light
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.7 }));
  spikeBody.castShadow = true;
  const spikeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  spikeLamp.position.set(0, 0.12, 0);
  const spikeLight = new THREE.PointLight(0xff2a1a, 0, 8, 2);
  spikeLight.position.set(0, 0.4, 0);
  spike.add(spikeBody, spikeLamp, spikeLight);
  spike.visible = false;
  base.scene.add(spike);

  // Explosion flash sphere + light
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  boom.visible = false;
  const boomLight = new THREE.PointLight(0xff8020, 0, 40, 1.6);
  base.scene.add(boom, boomLight);

  const world = {
    ...base, mapData, viewmodel,
    figures: new Map(),           // agent.id -> figure group
    tracerPos, tracerCol, tracerGeo, tracers, tracerLife: new Float32Array(TRACER_MAX), tracerNext: 0,
    smokeMesh, spike, spikeLamp, spikeLight, boom, boomLight, boomT: -1,
    prevYaw: 0, bobPhase: 0,
    models: null, modelsReady: false,
  };
  // Load the three Polyfork characters in the background; figures start
  // as boxes and swap to GLB the moment the models arrive (see syncWorld).
  // A failed fetch leaves models null and the boxes stay — the game still
  // runs. Screenshots wait for modelsReady (see main.js).
  world.modelsPromise = (async () => {
    try {
      const [pilot, knight, monk] = await Promise.all([
        loadCharacter(THREE, MODEL_URL.pilot),
        loadCharacter(THREE, MODEL_URL.knight),
        loadCharacter(THREE, MODEL_URL.monk),
      ]);
      world.models = { pilot, knight, monk };
    } catch (e) {
      console.error('[models] GLB load failed, keeping box figures:', e);
      world.models = null;
    }
    world.modelsReady = true;
  })();
  return world;
}

export function addTracer(world, x0, y0, z0, x1, y1, z1) {
  const i = world.tracerNext;
  world.tracerNext = (world.tracerNext + 1) % 8;
  const p = world.tracerPos, c = world.tracerCol, o = i * 6;
  p[o] = x0; p[o + 1] = y0; p[o + 2] = z0; p[o + 3] = x1; p[o + 4] = y1; p[o + 5] = z1;
  c[o] = 1; c[o + 1] = 0.62; c[o + 2] = 0.2; c[o + 3] = 1; c[o + 4] = 0.62; c[o + 5] = 0.2;
  world.tracerLife[i] = 0.09;
  world.tracerGeo.attributes.position.needsUpdate = true;
  world.tracerGeo.attributes.color.needsUpdate = true;
}

export function triggerExplosion(world, x, y, z) {
  world.boom.position.set(x, y + 0.5, z);
  world.boomLight.position.set(x, y + 1.5, z);
  world.boomT = 0;
  world.boom.visible = true;
}

const _smokeDummy = { matrix: null };
export function syncWorld(world, THREE, state, dt) {
  const p = state.camAgent || state.player;
  const isSpectating = p !== state.player;
  // --- camera from the player (or spectated ally) ---
  const eyeH = p.crouched ? 1.12 : 1.62;
  const speed2d = Math.hypot(p.vx, p.vz);
  world.bobPhase += speed2d * dt * 1.9;
  const bobY = Math.sin(world.bobPhase * 2) * 0.028 * Math.min(1, speed2d / 4);
  const bobX = Math.cos(world.bobPhase) * 0.014 * Math.min(1, speed2d / 4);
  const shake = state.cameraShake;
  const shX = shake > 0 ? (Math.random() - 0.5) * shake * 0.06 : 0;
  const shY = shake > 0 ? (Math.random() - 0.5) * shake * 0.06 : 0;
  world.camera.position.set(p.x + bobX, p.y + eyeH + bobY + shY, p.z);
  world.camera.rotation.order = 'YXZ';
  world.camera.rotation.set(p.pitch + p.recoil * 0.35 + shX, p.yaw, p.strafe * 0.012);
  // Scope: FOV 75/zoom while aiming (37.5 at 2x, 25 at 3x).
  const pl = state.player;
  const z = state.phase === 'live' && pl.alive && pl.aiming && pl.weapon ? pl.weapon.def.zoom : 1;
  const fov = 75 / z;
  if (world.camera.fov !== fov) { world.camera.fov = fov; world.camera.updateProjectionMatrix(); }

  // --- viewmodel sway / kick / flash (hidden while spectating) ---
  const vm = world.viewmodel;
  vm.group.visible = !isSpectating && !(pl.aiming && z > 1);
  // Recolor the viewmodel to the player's current weapon.
  if (state.player.weapon) setViewmodelWeapon(vm, state.player.weapon.def);
  const yawVel = (p.yaw - world.prevYaw) / Math.max(dt, 1e-4);
  world.prevYaw = p.yaw;
  vm.swayX += ((-yawVel * 0.012) - vm.swayX) * Math.min(1, dt * 10);
  vm.swayY += ((p.pitch * 0.2) - vm.swayY) * Math.min(1, dt * 10);
  vm.kick = Math.max(0, vm.kick - dt * 0.5);
  vm.group.position.set(0.27 + vm.swayX + bobX * 0.4, -0.25 + vm.swayY + bobY * 0.5, -0.55 + vm.kick);
  vm.group.rotation.x = vm.kick * 1.4;
  if (state.flashT > 0) {
    vm.flashMat.opacity = 0.9;
    vm.flashLight.intensity = 14;
    vm.flashMat.rotation = Math.random() * Math.PI;
  } else {
    vm.flashMat.opacity = 0;
    vm.flashLight.intensity = 0;
  }

  // --- bot figures ---
  for (const a of state.agents) {
    if (a.isPlayer) continue;
    let fig = world.figures.get(a.id);
    if (!fig) {
      fig = createBotFigure(THREE, a.team);
      world.figures.set(a.id, fig);
      world.scene.add(fig);
    }
    // Swap a box figure for its GLB character once the models are in.
    if (world.models && fig.userData.kind !== 'glb') {
      world.scene.remove(fig);
      fig = createGlbFigure(THREE, world.models[MODEL_FOR_AGENT[a.id]], a.team, a.name);
      world.figures.set(a.id, fig);
      world.scene.add(fig);
    }
    fig.visible = true;
    const u = fig.userData;
    if (a.alive) {
      fig.position.set(a.x, a.y, a.z);
      fig.rotation.set(0, a.yaw + Math.PI, 0);
      if (u.kind === 'glb') {
        u.tag.visible = true;
        u.ring.visible = true;
        // Held gun in the bot's weapon color.
        if (a.weapon) u.gunMat.color.setHex(a.weapon.def.color);
        // Animation: idle / walk / run by speed, weights lerped.
        const moving = Math.hypot(a.vx, a.vz);
        const want = moving > 3.2 ? 'run' : moving > 0.5 ? 'walk' : 'idle';
        if (want !== u.curAction && u.actions[want]) u.curAction = want;
        for (const k of Object.keys(u.actions)) {
          const act = u.actions[k];
          const target = k === u.curAction ? 1 : 0;
          act.weight += (target - act.weight) * Math.min(1, dt * 8);
        }
        u.mixer.update(dt);
        // Breathing while idle.
        u.body.scale.y = 1 + (u.curAction === 'idle' ? Math.sin(state.time * 2 + a.id * 1.7) * 0.012 : 0);
        // Flinch: lean back briefly when a shot lands.
        if (a.flash > 0 && u.prevFlash <= 0) u.flinchT = 0.18;
        u.prevFlash = a.flash;
        u.flinchT = Math.max(0, u.flinchT - dt);
        u.body.rotation.x = u.flinchT > 0 ? -0.14 * (u.flinchT / 0.18) : 0;
        // Hit flash: tint the character's own materials red.
        for (const m of u.mats) m.emissive.setHex(a.flash > 0 ? 0x881111 : 0x000000);
        // Bot muzzle flash at the gun tip, right after a shot.
        const recent = state.time - a.lastShot < 0.06;
        u.flashMat.opacity = recent ? 0.9 : 0;
        if (recent) u.flash.rotation.z = Math.random() * Math.PI;
      } else {
        const moving = Math.hypot(a.vx, a.vz);
        u.walkPhase += moving * dt * 2.6;
        const swing = Math.sin(u.walkPhase) * 0.45 * Math.min(1, moving / 3);
        u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
        u.bodyMat.emissive.setHex(a.flash > 0 ? 0x881111 : 0x000000);
      }
    } else {
      // Fallen: tip over once, stay down.
      fig.rotation.x = Math.max(fig.rotation.x - dt * 6, -Math.PI / 2 + 0.12);
      fig.position.y = Math.max(fig.position.y - dt * 0.4, 0.12);
      if (u.kind === 'glb') {
        u.tag.visible = false;
        u.ring.visible = false;
        u.flashMat.opacity = 0;
      }
    }
  }

  // --- tracers fade ---
  let tracerDirty = false;
  for (let i = 0; i < 8; i++) {
    if (world.tracerLife[i] > 0) {
      world.tracerLife[i] -= dt;
      if (world.tracerLife[i] <= 0) {
        const o = i * 6;
        for (let k = 0; k < 6; k++) world.tracerCol[o + k] = 0;
        tracerDirty = true;
      }
    }
  }
  if (tracerDirty) world.tracerGeo.attributes.color.needsUpdate = true;

  // --- smoke puffs (Haze: radius 5 m) ---
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 6; i++) {
    const s = state.smokes[i];
    if (s) {
      // Visual radius matches the logic radius (B15): ~5 m, barely grows.
      const grow = 1 + (1 - s.life / s.maxLife) * 0.1;
      const R = (s.r || 3.4) * 0.94;
      dummy.position.set(s.x, s.y + 0.8, s.z);
      dummy.scale.set(R * grow, R * 0.68 * grow, R * grow);
      dummy.rotation.set(0, 0, 0);
    } else {
      dummy.position.set(0, -10, 0);
      dummy.scale.set(0.001, 0.001, 0.001);
    }
    dummy.updateMatrix();
    world.smokeMesh.setMatrixAt(i, dummy.matrix);
  }
  world.smokeMesh.instanceMatrix.needsUpdate = true;

  // --- spike ---
  const sp = state.spike;
  if (sp.state === 'planted' || sp.state === 'planting' || sp.state === 'defusing') {
    world.spike.visible = true;
    world.spike.position.set(sp.x, 0.09, sp.z);
    const blink = sp.state === 'planted' ? (Math.sin(state.time * (6 + (45 - sp.timer) * 0.4)) > 0) : true;
    world.spikeLamp.material.color.setHex(blink ? 0xff2a1a : 0x330000);
    world.spikeLight.intensity = blink ? 2.2 : 0;
  } else {
    world.spike.visible = false;
    world.spikeLight.intensity = 0;
  }

  // --- explosion ---
  if (world.boomT >= 0) {
    world.boomT += dt;
    const t = world.boomT / 0.9;
    if (t >= 1) {
      world.boomT = -1; world.boom.visible = false; world.boomLight.intensity = 0;
    } else {
      const r = 1 + t * 13;
      world.boom.scale.set(r, r * 0.8, r);
      world.boom.material.opacity = 0.85 * (1 - t);
      world.boomLight.intensity = 60 * (1 - t);
    }
  }

  world.renderer.render(world.scene, world.camera);
}
