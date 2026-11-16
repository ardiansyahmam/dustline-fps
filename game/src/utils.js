// DUSTLINE — utils: deterministic RNG, math helpers, 2D collision/LOS.
// No per-frame allocation here: hot paths reuse caller-provided objects.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest signed angular difference, radians.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

// Circle (x,z,r) vs AABB {x0,z0,x1,z1}: push the circle out, return true if hit.
// Writes corrected position into out {x,z}.
export function circleVsAABB(x, z, r, box, out) {
  const cx = clamp(x, box.x0, box.x1);
  const cz = clamp(z, box.z0, box.z1);
  let dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    out.x = x + dx * push; out.z = z + dz * push;
  } else {
    // Centre inside the box: push out along the smallest penetration axis.
    const pl = x - box.x0, pr = box.x1 - x, pt = z - box.z0, pb = box.z1 - z;
    const m = Math.min(pl, pr, pt, pb);
    out.x = x; out.z = z;
    if (m === pl) out.x = box.x0 - r;
    else if (m === pr) out.x = box.x1 + r;
    else if (m === pt) out.z = box.z0 - r;
    else out.z = box.z1 + r;
  }
  return true;
}

// Segment (x0,z0)->(x1,z1) vs AABB, 2D slab test. True when blocked.
export function segmentHitsAABB(x0, z0, x1, z1, box) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < box.x0 || x0 > box.x1) return false;
  } else {
    let t1 = (box.x0 - x0) / dx, t2 = (box.x1 - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < box.z0 || z0 > box.z1) return false;
  } else {
    let t1 = (box.z0 - z0) / dz, t2 = (box.z1 - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Ray (origin + dir, maxDist) vs vertical AABB {x0,z0,x1,z1,y0,y1}.
// Returns distance along the ray, or -1. Writes nothing.
export function rayVsBox(ox, oy, oz, dx, dy, dz, maxDist, box) {
  let tmin = 0, tmax = maxDist;
  // X
  if (Math.abs(dx) < 1e-9) { if (ox < box.x0 || ox > box.x1) return -1; }
  else {
    let t1 = (box.x0 - ox) / dx, t2 = (box.x1 - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  // Z
  if (Math.abs(dz) < 1e-9) { if (oz < box.z0 || oz > box.z1) return -1; }
  else {
    let t1 = (box.z0 - oz) / dz, t2 = (box.z1 - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  // Y
  if (Math.abs(dy) < 1e-9) { if (oy < box.y0 || oy > box.y1) return -1; }
  else {
    let t1 = (box.y0 - oy) / dy, t2 = (box.y1 - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Line of sight between two points at a given eye height, blocked by any
// solid box taller than that height. Boxes carry y1 (top).
export function hasLOS(x0, z0, x1, z1, eyeY, solids) {
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i];
    if (b.y1 < eyeY - 0.2) continue; // low cover does not block sight
    if (segmentHitsAABB(x0, z0, x1, z1, b)) return false;
  }
  return true;
}
