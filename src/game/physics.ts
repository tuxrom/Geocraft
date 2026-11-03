import type { World } from '../world/world';

export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  hw: number; // demi-largeur
  h: number; // hauteur
  onGround: boolean;
  hitX: boolean;
  hitZ: boolean;
}

const EPS = 1e-4;

function collidesAt(w: World, b: Body, x: number, y: number, z: number): boolean {
  return w.collides(x - b.hw, y, z - b.hw, x + b.hw, y + b.h, z + b.hw);
}

function moveAxis(w: World, b: Body, axis: 'x' | 'y' | 'z', delta: number): boolean {
  if (delta === 0) return false;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.3));
  const d = delta / steps;
  for (let i = 0; i < steps; i++) {
    const nx = axis === 'x' ? b.x + d : b.x, ny = axis === 'y' ? b.y + d : b.y, nz = axis === 'z' ? b.z + d : b.z;
    if (!collidesAt(w, b, nx, ny, nz)) { b.x = nx; b.y = ny; b.z = nz; continue; }
    // affinage par dichotomie
    let lo = 0, hi = d;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      const tx = axis === 'x' ? b.x + mid : b.x, ty = axis === 'y' ? b.y + mid : b.y, tz = axis === 'z' ? b.z + mid : b.z;
      if (collidesAt(w, b, tx, ty, tz)) hi = mid; else lo = mid;
    }
    if (axis === 'x') b.x += lo - Math.sign(d) * EPS * 0; else if (axis === 'y') b.y += lo; else b.z += lo;
    return true;
  }
  return false;
}

/** Déplace un corps en gérant collisions et petites marches (jusqu'à stepUp). */
export function moveBody(w: World, b: Body, dt: number, stepUp = 0.6) {
  b.hitX = b.hitZ = false;
  const dx = b.vx * dt, dz = b.vz * dt, dy = b.vy * dt;
  const wasGround = b.onGround;
  // x
  if (dx !== 0) {
    if (moveAxis(w, b, 'x', dx)) {
      let stepped = false;
      if (stepUp > 0 && wasGround) stepped = tryStep(w, b, dx, 0, stepUp);
      if (!stepped) { b.hitX = true; b.vx = 0; }
    }
  }
  if (dz !== 0) {
    if (moveAxis(w, b, 'z', dz)) {
      let stepped = false;
      if (stepUp > 0 && wasGround) stepped = tryStep(w, b, 0, dz, stepUp);
      if (!stepped) { b.hitZ = true; b.vz = 0; }
    }
  }
  // y
  b.onGround = false;
  if (dy !== 0) {
    if (moveAxis(w, b, 'y', dy)) {
      if (dy < 0) b.onGround = true;
      b.vy = 0;
    }
  } else if (collidesAt(w, b, b.x, b.y - 0.02, b.z)) b.onGround = b.vy <= 0;
}

/** Tente de monter une marche : renvoie vrai si le déplacement restant a pu se faire. */
function tryStep(w: World, b: Body, dx: number, dz: number, stepUp: number): boolean {
  for (const lift of [0.5, stepUp]) {
    if (collidesAt(w, b, b.x, b.y + lift, b.z)) continue;
    if (!collidesAt(w, b, b.x + dx, b.y + lift, b.z + dz)) {
      b.y += lift; b.x += dx; b.z += dz;
      return true;
    }
  }
  return false;
}

export function bodyBox(b: Body) {
  return { minx: b.x - b.hw, miny: b.y, minz: b.z - b.hw, maxx: b.x + b.hw, maxy: b.y + b.h, maxz: b.z + b.hw };
}
