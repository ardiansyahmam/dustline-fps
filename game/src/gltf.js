// DUSTLINE — gltf.js: minimal GLB v2 loader, written for this game.
// Parses JSON+BIN chunks into SkinnedMeshes with one shared Skeleton
// and turns skeletal animations into THREE.AnimationClips. No
// GLTFLoader vendored — this file is ours. Supports node matrix/TRS,
// POSITION/NORMAL/COLOR_0/indices, JOINTS_0+WEIGHTS_0 skins, LINEAR
// animation tracks. Vertex colors only (no textures).

const COMP_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMP_CTOR = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array,
  5125: Uint32Array, 5126: Float32Array,
};
const TYPE_N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const bv = gltf.bufferViews[acc.bufferView];
  const n = TYPE_N[acc.type];
  const compSize = COMP_BYTES[acc.componentType];
  const itemBytes = n * compSize;
  const stride = bv.byteStride && bv.byteStride !== itemBytes ? bv.byteStride : itemBytes;
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  const out = new Float32Array(count * n);
  const Ctor = COMP_CTOR[acc.componentType];
  const norm = !!acc.normalized;
  const maxVal = acc.componentType === 5121 ? 255 : acc.componentType === 5123 ? 65535 : 1;
  for (let i = 0; i < count; i++) {
    const off = start + i * stride;
    const raw = new Ctor(bin, off, n);
    for (let k = 0; k < n; k++) {
      let v = raw[k];
      if (norm && maxVal !== 1) v = v / maxVal;
      out[i * n + k] = v;
    }
  }
  return { data: out, count, type: acc.type, min: acc.min, max: acc.max };
}

function applyNodeTransform(THREE, obj, node) {
  if (node.matrix) {
    obj.matrix.fromArray(node.matrix);
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  } else {
    if (node.translation) obj.position.fromArray(node.translation);
    if (node.rotation) obj.quaternion.fromArray(node.rotation);
    if (node.scale) obj.scale.fromArray(node.scale);
  }
  obj.updateMatrix();
}

export function parseGlb(THREE, buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546C67) throw new Error('glb: bad magic');
  if (view.getUint32(4, true) !== 2) throw new Error('glb: only version 2');
  const totalLen = view.getUint32(8, true);
  let off = 12, json = null, bin = null;
  while (off + 8 <= totalLen) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const chunk = buffer.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004E4942) bin = chunk;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('glb: missing JSON or BIN chunk');
  return { gltf: json, bin };
}

export function buildCharacter(THREE, parsed) {
  const { gltf, bin } = parsed;
  const nodes = gltf.nodes || [];
  const objects = nodes.map((node) => {
    const obj = new THREE.Object3D();
    obj.name = node.name || '';
    applyNodeTransform(THREE, obj, node);
    return obj;
  });
  for (let i = 0; i < nodes.length; i++) {
    for (const child of nodes[i].children || []) objects[i].add(objects[child]);
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.0,
  });
  const matDef = (gltf.materials || [])[0];
  if (matDef && matDef.pbrMetallicRoughness) {
    const pbr = matDef.pbrMetallicRoughness;
    if (pbr.baseColorFactor) material.color.fromArray(pbr.baseColorFactor);
    if (pbr.roughnessFactor !== undefined) material.roughness = pbr.roughnessFactor;
    if (pbr.metallicFactor !== undefined) material.metalness = pbr.metallicFactor;
    if (matDef.doubleSided) material.side = THREE.DoubleSide;
  }

  const skinned = [];
  const pendingBind = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.mesh === undefined) continue;
    const meshDef = gltf.meshes[node.mesh];
    for (const prim of meshDef.primitives) {
      const geo = new THREE.BufferGeometry();
      const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
      geo.setAttribute('position', new THREE.BufferAttribute(pos.data, 3));
      if (prim.attributes.NORMAL !== undefined) {
        const nrm = readAccessor(gltf, bin, prim.attributes.NORMAL);
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm.data, 3));
      }
      if (prim.attributes.COLOR_0 !== undefined) {
        const col = readAccessor(gltf, bin, prim.attributes.COLOR_0);
        geo.setAttribute('color', new THREE.BufferAttribute(col.data, 3));
      }
      // Skinning attributes: three.js SkinnedMesh REQUIRES these exact
      // names — without them computeBoundingSphere (and the skinning
      // shader) throws. JOINTS_0 is uint16, WEIGHTS_0 float32.
      if (prim.attributes.JOINTS_0 !== undefined) {
        const j = readAccessor(gltf, bin, prim.attributes.JOINTS_0);
        geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(j.data), 4));
      }
      if (prim.attributes.WEIGHTS_0 !== undefined) {
        const w = readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(w.data, 4));
      }
      if (prim.indices !== undefined) {
        const idx = readAccessor(gltf, bin, prim.indices);
        geo.setIndex(new THREE.BufferAttribute(new Uint16Array(idx.data), 1));
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.SkinnedMesh(geo, material);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.name = node.name || `mesh${node.mesh}`;
      if (node.skin !== undefined) {
        const skin = gltf.skins[node.skin];
        const joints = skin.joints.map((j) => objects[j]);
        const ibm = readAccessor(gltf, bin, skin.inverseBindMatrices);
        const ibmMats = [];
        for (let k = 0; k < joints.length; k++) {
          const m = new THREE.Matrix4();
          m.fromArray(ibm.data, k * 16);
          ibmMats.push(m);
        }
        const skeleton = new THREE.Skeleton(joints, ibmMats);
        mesh.userData.skeleton = skeleton;
        pendingBind.push(mesh);
        skinned.push(mesh);
      }
      objects[i].add(mesh);
    }
  }

  // Scene root (first scene's first node, or node 0).
  const sceneDef = (gltf.scenes || [])[0] || { nodes: [0] };
  const root = new THREE.Group();
  root.name = 'character-root';
  for (const ni of sceneDef.nodes) root.add(objects[ni]);

  // Bind AFTER the tree is assembled, with real world matrices — the
  // bind matrix must be the mesh's world matrix in the assembled tree
  // (the bone chain is already wired as node children above).
  root.updateMatrixWorld(true);
  for (const mesh of pendingBind) mesh.bind(mesh.userData.skeleton, mesh.matrixWorld);

  // Overall height (max POSITION Y over every mesh) for normalisation.
  let height = 0;
  for (const meshDef of gltf.meshes || []) {
    for (const prim of meshDef.primitives) {
      const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
      if (pos.max) height = Math.max(height, pos.max[1]);
    }
  }

  const clips = buildClips(THREE, gltf, bin);
  return { group: root, clips, height, skinned };
}

function buildClips(THREE, gltf, bin) {
  const clips = {};
  for (const anim of gltf.animations || []) {
    const tracks = [];
    let duration = 0;
    for (const ch of anim.channels) {
      const sampler = anim.samplers[ch.sampler];
      const times = readAccessor(gltf, bin, sampler.input).data;
      const values = readAccessor(gltf, bin, sampler.output).data;
      duration = Math.max(duration, times[times.length - 1] || 0);
      const node = gltf.nodes[ch.target.node];
      const name = node.name || `node${ch.target.node}`;
      if (ch.target.path === 'rotation') {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
      } else if (ch.target.path === 'translation') {
        tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, values));
      } else if (ch.target.path === 'scale') {
        tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, values));
      }
    }
    if (tracks.length) clips[anim.name || 'clip'] = new THREE.AnimationClip(anim.name || 'clip', duration, tracks);
  }
  return clips;
}

// Deep-clone a built character so each bot gets its own skeleton, mixer
// and materials (per-bot emissive flash + team accents need separate
// material instances). Mirrors SkeletonUtils.clone by hand.
export function cloneCharacter(THREE, src) {
  const clone = src.group.clone(true);
  const srcMeshes = [];
  const cloneMeshes = [];
  src.group.traverse((o) => { if (o.isSkinnedMesh) srcMeshes.push(o); });
  clone.traverse((o) => { if (o.isSkinnedMesh) cloneMeshes.push(o); });
  clone.updateMatrixWorld(true);
  for (let i = 0; i < cloneMeshes.length; i++) {
    const cm = cloneMeshes[i];
    const sm = srcMeshes[i];
    cm.material = sm.material.clone();
    cm.frustumCulled = false; // clone() does not reliably keep this flag
    const bones = sm.skeleton.bones.map((b) => clone.getObjectByName(b.name));
    const skeleton = new THREE.Skeleton(bones, sm.skeleton.boneInverses);
    cm.bind(skeleton, cm.matrixWorld);
    cm.userData.skeleton = skeleton;
  }
  return { group: clone, clips: src.clips, height: src.height };
}

export async function loadCharacter(THREE, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gltf: fetch ${url} -> ${res.status}`);
  const buf = await res.arrayBuffer();
  return buildCharacter(THREE, parseGlb(THREE, buf));
}
