// DUSTLINE — map: abandoned solar plant, origin centre, north = -z.
// x [-32,32], z [-22,22]. A Solar Array (NE, open), B Pump House (NW,
// tight), Mid Inverter Court + gantry. Rotations: Solar Spine (north,
// long, exposed) and Pump Duct (fast, grate steps are loud). No site is
// visible straight from the attacker spawn. All geometry from code.

import * as THREE from 'three';

export const MAP = {
  minX: -32, maxX: 32, minZ: -22, maxZ: 22,
  sites: {
    A: { x: 25, z: -10, r: 6.5, name: 'Solar Array' },
    B: { x: -25, z: -10, r: 6.5, name: 'Pump House' },
  },
  spawns: {
    atk: [[0, 18], [-3, 19], [3, 19]],
    def: [[22, -14], [-22, -14], [0, -16]],
  },
};

// Named zones: rotation routes, choke points, the audible grate.
// The sim reads `duct` for footstep hearing.
export const ZONES = {
  spine: { name: 'Solar Spine', waypoints: [11, 17, 13] }, // north lane, long + exposed
  duct: { name: 'Pump Duct', x0: -8, z0: -11, x1: 8, z1: -5, waypoints: [10, 14, 12] }, // fast route, grate is loud
  chokes: {
    aGate: { name: 'A Gate', x: 24, z: -2 },
    midGantry: { name: 'Mid gantry', x: 0, z: -2 },
    ductMouth: { name: 'Mulut Pump Duct', x: 0, z: -5 },
  },
  entries: {
    A: ['East Service (wp 8→12)', 'Mid ramp (wp 14→12)'],
    B: ['Pump Duct (wp 14→10)', 'Cooling Trench (wp 7→10)'],
  },
  mid: { name: 'Inverter Court', x: 0, z: 0 },
};

// Solid boxes: {x0,z0,x1,z1,y1} (y0 is always 0). Used for movement
// collision, bullet blocking and line-of-sight.
export const COLLIDERS = [
  // perimeter walls (h 4)
  { x0: -32, z0: -22, x1: 32, z1: -20, y1: 4 },
  { x0: -32, z0: 20, x1: 32, z1: 22, y1: 4 },
  { x0: -32, z0: -22, x1: -30, z1: 22, y1: 4 },
  { x0: 30, z0: -22, x1: 32, z1: 22, y1: 4 },
  // mid divider wall (z=-2), gaps at centre (mid) and both flanks
  { x0: -20, z0: -3, x1: -8, z1: -1, y1: 2.6 },
  { x0: 8, z0: -3, x1: 20, z1: -1, y1: 2.6 },
  // pump house building (site B cover)
  { x0: -29, z0: -19, x1: -21, z1: -13, y1: 3.5 },
  // control hut (site A cover)
  { x0: 23, z0: -19, x1: 29, z1: -14, y1: 3 },
  // water tank (site B)
  { x0: -29, z0: -10, x1: -25, z1: -6, y1: 4 },
  // solar panel rows (site A) — low, sight passes over them
  { x0: 18, z0: -17.5, x1: 22, z1: -16, y1: 1.4 },
  { x0: 18, z0: -13.5, x1: 22, z1: -12, y1: 1.4 },
  { x0: 18, z0: -9.5, x1: 22, z1: -8, y1: 1.4 },
  // mid crates
  { x0: -2, z0: -1, x1: 0, z1: 1, y1: 1.2 },
  { x0: 1, z0: 2, x1: 3, z1: 4, y1: 1.2 },
  { x0: -4, z0: 3, x1: -2, z1: 5, y1: 1.2 },
  { x0: -1, z0: -6, x1: 1, z1: -4, y1: 2.4 },
  // south lane low walls (crouch cover, h 1.1)
  { x0: -24, z0: 13.5, x1: -14, z1: 14.5, y1: 1.1 },
  { x0: 14, z0: 13.5, x1: 24, z1: 14.5, y1: 1.1 },
  // pillars
  { x0: -12.5, z0: -6.5, x1: -11.5, z1: -5.5, y1: 4 },
  { x0: 11.5, z0: -6.5, x1: 12.5, z1: -5.5, y1: 4 },
  { x0: -12.5, z0: 5.5, x1: -11.5, z1: 6.5, y1: 4 },
  { x0: 11.5, z0: 5.5, x1: 12.5, z1: 6.5, y1: 4 },
  // gantry legs over mid
  { x0: -7.5, z0: 3.5, x1: -6.5, z1: 4.5, y1: 5 },
  { x0: 6.5, z0: 3.5, x1: 7.5, z1: 4.5, y1: 5 },
  // site B pipe rack
  { x0: -18, z0: -18, x1: -16, z1: -12, y1: 1.8 },
  // site A inverter boxes
  { x0: 26, z0: -12, x1: 28, z1: -10, y1: 1.6 },
  { x0: 20, z0: -6, x1: 22, z1: -4, y1: 1.6 },
];

// Waypoint graph for bots: [x, z, [neighbour indices]].
export const WAYPOINTS = [
  [0, 18, [1, 2, 3]],       // 0 atk spawn
  [0, 12, [0, 4, 5, 6]],    // 1 south mid
  [-14, 12, [1, 7]],        // 2 south west
  [14, 12, [1, 8]],         // 3 south east
  [0, 6, [1, 9]],           // 4 mid south
  [-20, 16, [2, 7]],        // 5 south lane west
  [20, 16, [3, 8]],         // 6 south lane east
  [-20, 4, [5, 10, 11]],    // 7 west flank
  [20, 4, [6, 12, 13]],     // 8 east flank
  [0, 0, [4, 14]],          // 9 mid
  [-14, -8, [7, 14, 15]],   // 10 B approach
  [-20, -16, [7, 15, 17]],  // 11 north lane west
  [14, -8, [8, 14, 16]],    // 12 A approach
  [20, -16, [8, 16, 17]],   // 13 north lane east
  [0, -8, [9, 10, 12]],     // 14 mid north
  [-25, -10, [10, 11]],     // 15 site B
  [25, -10, [12, 13]],      // 16 site A
  [0, -16, [11, 13, 14]],   // 17 north lane mid
];

// ---- procedural canvas textures (no external files) ----

function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, size, n, colors, rMin, rMax, rng) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rng() * colors.length) | 0];
    g.globalAlpha = 0.08 + rng() * 0.25;
    const r = rMin + rng() * (rMax - rMin);
    g.beginPath();
    g.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function makeTextures(THREE, rng) {
  const ground = canvasTex(512, (g, s) => {
    g.fillStyle = '#b98a56'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, ['#a87a48', '#c99a63', '#8f6a3e', '#d9ab72'], 1, 5, rng);
    // tire tracks
    g.strokeStyle = 'rgba(90,60,30,0.35)'; g.lineWidth = 7;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y = rng() * s;
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (rng() - 0.5) * 60, s * 0.7, y + (rng() - 0.5) * 60, s, y);
      g.stroke();
    }
    // cracks
    g.strokeStyle = 'rgba(70,45,20,0.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      let x = rng() * s, y = rng() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }, 10, 7);
  const concrete = canvasTex(256, (g, s) => {
    g.fillStyle = '#9a938a'; g.fillRect(0, 0, s, s);
    speckle(g, s, 1200, ['#8a837a', '#aaa39a', '#7a7268'], 1, 4, rng);
    g.fillStyle = 'rgba(60,50,40,0.25)';
    for (let i = 0; i < 8; i++) g.fillRect(rng() * s, rng() * s, 20 + rng() * 50, 4 + rng() * 10);
  }, 2, 1);
  const rust = canvasTex(256, (g, s) => {
    g.fillStyle = '#8a5a34'; g.fillRect(0, 0, s, s);
    speckle(g, s, 1500, ['#6e4526', '#a06a3c', '#5d3a20', '#b57a44'], 1, 6, rng);
    g.strokeStyle = 'rgba(60,30,10,0.4)'; g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const x = rng() * s;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rng() - 0.5) * 20, s); g.stroke();
    }
  }, 1, 1);
  const panel = canvasTex(256, (g, s) => {
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#1d3a5f'); grad.addColorStop(1, '#12294a');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(140,190,230,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke();
    }
    g.strokeStyle = 'rgba(200,220,240,0.35)'; g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
  }, 1, 1);
  const crate = canvasTex(256, (g, s) => {
    g.fillStyle = '#7d6242'; g.fillRect(0, 0, s, s);
    speckle(g, s, 500, ['#6b5236', '#8f7350'], 2, 6, rng);
    g.strokeStyle = '#5d4630'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  }, 1, 1);
  const hazard = canvasTex(256, (g, s) => {
    g.fillStyle = '#c8a028'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#22201c';
    for (let i = -4; i < 8; i++) {
      g.save(); g.translate(i * 64, 0); g.rotate(Math.PI / 4);
      g.fillRect(0, -20, 32, s + 40); g.restore();
    }
    speckle(g, s, 400, ['#8a7018', '#d8b038'], 1, 4, rng);
  }, 1, 1);
  return { ground, concrete, rust, panel, crate, hazard };
}

// ---- scene construction ----

function boxMesh(THREE, mat, x0, z0, x1, z1, y1, y0 = 0) {
  const w = x1 - x0, d = z1 - z0, h = y1 - y0;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
  m.castShadow = h > 1.2; m.receiveShadow = true;
  return m;
}

function letterSprite(THREE, letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,16,10,0.55)';
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color; g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(2.4, 2.4, 1);
  return s;
}

export function buildMap(THREE, scene, textures, rng) {
  const concrete = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.95, metalness: 0.02 });
  const rust = new THREE.MeshStandardMaterial({ map: textures.rust, roughness: 0.85, metalness: 0.35 });
  const crateMat = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.9, metalness: 0.05 });
  const panelMat = new THREE.MeshStandardMaterial({ map: textures.panel, roughness: 0.45, metalness: 0.35, emissive: 0x16324f, emissiveIntensity: 0.55 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3230, roughness: 0.9, metalness: 0.2 });
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xa8763e, roughness: 1, metalness: 0 });

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 110),
    new THREE.MeshStandardMaterial({ map: textures.ground, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls
  for (const b of COLLIDERS.slice(0, 4)) scene.add(boxMesh(THREE, concrete, b.x0, b.z0, b.x1, b.z1, b.y1));
  // Mid divider walls (hazard stripe top)
  for (const b of COLLIDERS.slice(4, 6)) {
    scene.add(boxMesh(THREE, concrete, b.x0, b.z0, b.x1, b.z1, b.y1));
    const stripe = boxMesh(THREE, hazardMat, b.x0, b.z0, b.x1, b.z1, b.y1 + 0.06, b.y1 - 0.12);
    stripe.castShadow = false;
    scene.add(stripe);
  }
  // Buildings
  scene.add(boxMesh(THREE, rust, -29, -19, -21, -13, 3.5));       // pump house
  const hutRoof = boxMesh(THREE, darkMat, 22.6, -19.4, 29.4, -13.6, 3.35, 3);
  scene.add(hutRoof);
  scene.add(boxMesh(THREE, concrete, 23, -19, 29, -14, 3));       // control hut
  // Water tank: cylinder on a plinth
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 4, 20), rust);
  tank.position.set(-27, 2, -8); tank.castShadow = true; tank.receiveShadow = true;
  scene.add(tank);
  const tankTop = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.25, 20), darkMat);
  tankTop.position.set(-27, 4.1, -8);
  scene.add(tankTop);

  // Solar panels: 3 rows x 3, instanced, tilted toward the south sun
  const panelGeo = new THREE.BoxGeometry(1.25, 0.08, 1.5);
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, 9);
  const dummy = new THREE.Object3D();
  let pi = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      dummy.position.set(18.7 + c * 1.35, 1.05, -16.75 - r * 4);
      dummy.rotation.set(-0.5, 0, 0);
      dummy.updateMatrix();
      panels.setMatrixAt(pi++, dummy.matrix);
    }
  }
  panels.castShadow = true; panels.receiveShadow = true;
  scene.add(panels);
  // Panel legs (thin dark boxes, one per row)
  for (let r = 0; r < 3; r++) {
    scene.add(boxMesh(THREE, darkMat, 18.2, -17.4 - r * 4, 22, -17.1 - r * 4, 0.7));
  }

  // Mid crates: instanced, sized to their colliders. Each crate gets its
  // own accent tint (rust / teal / gold / plain) so the mid is not one
  // flat brown — instance colors multiply the crate texture.
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, 4);
  const crateBoxes = COLLIDERS.slice(12, 16);
  const crateTints = [0xc25a2e, 0x2fa8a0, 0xd9a83c, 0x9a7a52];
  crateBoxes.forEach((b, i) => {
    dummy.position.set((b.x0 + b.x1) / 2, b.y1 / 2, (b.z0 + b.z1) / 2);
    dummy.rotation.set(0, (i % 2) * 0.35, 0);
    dummy.scale.set(b.x1 - b.x0, b.y1, b.z1 - b.z0);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
    crates.setColorAt(i, new THREE.Color(crateTints[i]));
  });
  crates.castShadow = true; crates.receiveShadow = true;
  if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
  scene.add(crates);

  // South lane low walls + pillars + gantry (instanced pillars)
  for (const b of COLLIDERS.slice(16, 18)) scene.add(boxMesh(THREE, concrete, b.x0, b.z0, b.x1, b.z1, b.y1));
  const pillarGeo = new THREE.BoxGeometry(1, 4, 1);
  const pillars = new THREE.InstancedMesh(pillarGeo, concrete, 4);
  const pillarTints = [0xffffff, 0xffb08a, 0xffffff, 0x7ad9ff];
  COLLIDERS.slice(18, 22).forEach((b, i) => {
    dummy.position.set((b.x0 + b.x1) / 2, 2, (b.z0 + b.z1) / 2);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pillars.setMatrixAt(i, dummy.matrix);
    pillars.setColorAt(i, new THREE.Color(pillarTints[i]));
  });
  pillars.castShadow = true; pillars.receiveShadow = true;
  if (pillars.instanceColor) pillars.instanceColor.needsUpdate = true;
  scene.add(pillars);
  for (const b of COLLIDERS.slice(22, 24)) scene.add(boxMesh(THREE, rust, b.x0, b.z0, b.x1, b.z1, b.y1));
  const beam = boxMesh(THREE, rust, -7.5, 3.5, 7.5, 4.5, 5.4, 5);
  scene.add(beam);
  // Pipe rack + inverters (site B platform kontrol, site A inverter)
  scene.add(boxMesh(THREE, rust, -18, -18, -16, -12, 1.8));
  scene.add(boxMesh(THREE, darkMat, 26, -12, 28, -10, 1.6));
  scene.add(boxMesh(THREE, darkMat, 20, -6, 22, -4, 1.6));
  // Inverter Court: inverter boxes ON TOP of the mid divider walls
  // (visual only — no new collision, players never reach that height).
  scene.add(boxMesh(THREE, darkMat, -16, -2.8, -12, -1.2, 3.4, 2.6));
  scene.add(boxMesh(THREE, darkMat, 12, -2.8, 16, -1.2, 3.4, 2.6));
  // Pump Duct grate: hazard strip on the ground (visual marker of the
  // loud corridor — footsteps here are heard 35 m away).
  const grate = boxMesh(THREE, hazardMat, -8, -9.5, 8, -6.5, 0.06, 0);
  grate.castShadow = false;
  scene.add(grate);

  // Distant dunes outside the walls (silhouettes in the haze)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rng() * 0.3;
    const r = 58 + rng() * 22;
    const dune = new THREE.Mesh(new THREE.ConeGeometry(14 + rng() * 12, 5 + rng() * 7, 7), duneMat);
    dune.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dune.scale.y = 0.55;
    scene.add(dune);
  }

  // Site markers: floating A / B — A in vivid teal, B in vivid orange,
  // big and high-contrast so each site reads instantly from spawn.
  const markA = letterSprite(THREE, 'A', '#2fd8c8');
  markA.position.set(25, 6.5, -10);
  markA.scale.set(3.4, 3.4, 1);
  scene.add(markA);
  const markB = letterSprite(THREE, 'B', '#ff8a3c');
  markB.position.set(-25, 6.5, -10);
  markB.scale.set(3.4, 3.4, 1);
  scene.add(markB);

  return { colliders: COLLIDERS, waypoints: WAYPOINTS, sites: MAP.sites, spawns: MAP.spawns, zones: ZONES };
}
