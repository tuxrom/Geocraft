import { B, BLOCKS, FACE_TILE, OPAQUE, LIQUID, FULLCUBE, type Box } from '../data/blocks';
import { bidx } from '../core/constants';

export interface MeshData {
  pos: Float32Array;
  uv: Float32Array;
  tile: Float32Array;
  light: Float32Array;
  index: Uint32Array;
}
export interface MeshResult { opaque: MeshData; water: MeshData }

const PW = 18, PH = 130;
const pidx = (x: number, y: number, z: number) => ((y + 1) * PW + (z + 1)) * PW + (x + 1);
const SHAPED = new Uint8Array(256);
for (const d of BLOCKS) SHAPED[d.id] = d.id !== 0 && d.render !== 'cube' ? 1 : 0;

class Builder {
  pos: number[] = []; uv: number[] = []; tile: number[] = []; light: number[] = []; idx: number[] = [];
  n = 0;
  quad(p: number[], uv: number[], tile: number, light: number, flip = false) {
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]);
      this.tile.push(tile);
      this.light.push(light);
    }
    const o = this.n;
    if (flip) this.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    else this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.n += 4;
  }
  tri(p: number[], uv: number[], tile: number, light: number) {
    for (let i = 0; i < 3; i++) {
      this.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]);
      this.tile.push(tile);
      this.light.push(light);
    }
    this.idx.push(this.n, this.n + 1, this.n + 2);
    this.n += 3;
  }
  done(): MeshData {
    return {
      pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), tile: new Float32Array(this.tile),
      light: new Float32Array(this.light), index: new Uint32Array(this.idx),
    };
  }
}

const DARK = 0.4;
const LEVEL = [DARK, 0.7, 1];
const SHADE = [0.72, 0.72, 1.0, 0.5, 0.86, 0.86]; // +x -x +y -y +z -z

/** Coordonnées de texture (en unités de bloc) pour une face, depuis la position monde. */
function faceUV(f: number, x: number, y: number, z: number, out: number[]) {
  switch (f) {
    case 0: out.push(-z, -y); break;
    case 1: out.push(z, -y); break;
    case 2: out.push(x, z); break;
    case 3: out.push(x, -z); break;
    case 4: out.push(x, -y); break;
    default: out.push(-x, -y);
  }
}

const rotPt = (x: number, z: number, k: number): [number, number] => {
  for (let i = 0; i < k; i++) { const nx = z, nz = 1 - x; x = nx; z = nz; }
  return [x, z];
};

export function meshChunk(
  cx: number, cz: number,
  self: Uint8Array, w: Uint8Array | null, e: Uint8Array | null, n: Uint8Array | null, s: Uint8Array | null,
): MeshResult {
  void cx; void cz;
  // --- bloc rembourré 18 x 130 x 18 ---
  const pad = new Uint8Array(PW * PH * PW);
  for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) {
    const src = (y * 16 + z) * 16;
    const dst = pidx(0, y, z);
    for (let x = 0; x < 16; x++) pad[dst + x] = self[src + x];
    if (w) pad[dst - 1] = w[src + 15];
    if (e) pad[dst + 16] = e[src];
  }
  for (let y = 0; y < 128; y++) for (let x = 0; x < 16; x++) {
    if (n) pad[pidx(x, y, -1)] = n[(y * 16 + 15) * 16 + x];
    if (s) pad[pidx(x, y, 16)] = s[(y * 16) * 16 + x];
  }
  for (let z = -1; z < 17; z++) for (let x = -1; x < 17; x++) pad[pidx(x, -1, z)] = B.bedrock;

  // --- hauteur d'ensoleillement ---
  const top = new Int16Array(PW * PW).fill(-1);
  for (let z = -1; z < 17; z++) for (let x = -1; x < 17; x++) {
    let y = 127;
    for (; y >= 0; y--) { const b = pad[pidx(x, y, z)]; if (OPAQUE[b] || LIQUID[b]) break; }
    top[(z + 1) * PW + (x + 1)] = y;
  }
  const topAt = (x: number, z: number) => top[(Math.max(-1, Math.min(16, z)) + 1) * PW + Math.max(-1, Math.min(16, x)) + 1];
  /** 2 : ciel libre, 1 : proche du ciel (entrée, intérieur éclairé), 0 : sombre. */
  const lit = (x: number, y: number, z: number): number => {
    if (y >= topAt(x, z)) return 2;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (y >= topAt(x + dx, z + dz) && (dx !== 0 || dz !== 0)) {
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist <= 2) return 1;
      }
    }
    return 0;
  };

  const ob = new Builder(), wb = new Builder();
  const dims = [16, 128, 16];
  const mask = new Int32Array(128 * 16);
  const q = [0, 0, 0];
  const pos12 = new Array<number>(12);
  const uv8: number[] = [];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const du = dims[u], dv = dims[v];
    const x = [0, 0, 0];
    q[0] = q[1] = q[2] = 0; q[d] = 1;
    for (x[d] = -1; x[d] < dims[d]; ) {
      // masque
      let nn = 0;
      for (x[v] = 0; x[v] < dv; x[v]++) for (x[u] = 0; x[u] < du; x[u]++) {
        const a = pad[pidx(x[0], x[1], x[2])];
        const b = pad[pidx(x[0] + q[0], x[1] + q[1], x[2] + q[2])];
        let key = 0;
        if (a !== b) {
          // face de a vers +d
          if (a !== 0 && !SHAPED[a] && x[d] >= 0 && faceDrawn(a, b)) {
            const tile = FACE_TILE[a * 6 + d * 2];
            const l = lit(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
            key = 1 + (((tile * 3 + l) * 2 + (LIQUID[a] ? 1 : 0)) * 2 + 0);
          } else if (b !== 0 && !SHAPED[b] && x[d] < dims[d] - 1 && faceDrawn(b, a)) {
            const tile = FACE_TILE[b * 6 + d * 2 + 1];
            const l = lit(x[0], x[1], x[2]);
            key = 1 + (((tile * 3 + l) * 2 + (LIQUID[b] ? 1 : 0)) * 2 + 1);
          }
        }
        mask[nn++] = key;
      }
      x[d]++;
      nn = 0;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; ) {
          const key = mask[nn];
          if (!key) { i++; nn++; continue; }
          let wd = 1;
          while (i + wd < du && mask[nn + wd] === key) wd++;
          let ht = 1;
          outer: for (; j + ht < dv; ht++) {
            for (let k = 0; k < wd; k++) if (mask[nn + k + ht * du] !== key) break outer;
          }
          // émission
          const kk = key - 1;
          const back = kk & 1;
          const water = (kk >> 1) & 1;
          const rest = kk >> 2;
          const l = rest % 3;
          const tile = (rest / 3) | 0;
          const face = d * 2 + (back ? 1 : 0);
          x[u] = i; x[v] = j;
          const p0 = [x[0], x[1], x[2]];
          const eu = [0, 0, 0], ev = [0, 0, 0];
          eu[u] = wd; ev[v] = ht;
          const c0 = p0;
          const c1 = [p0[0] + eu[0], p0[1] + eu[1], p0[2] + eu[2]];
          const c2 = [c1[0] + ev[0], c1[1] + ev[1], c1[2] + ev[2]];
          const c3 = [p0[0] + ev[0], p0[1] + ev[1], p0[2] + ev[2]];
          const corners = back ? [c0, c3, c2, c1] : [c0, c1, c2, c3];
          uv8.length = 0;
          for (let c = 0; c < 4; c++) {
            pos12[c * 3] = corners[c][0]; pos12[c * 3 + 1] = corners[c][1]; pos12[c * 3 + 2] = corners[c][2];
            faceUV(face, corners[c][0], corners[c][1], corners[c][2], uv8);
          }
          const light = SHADE[face] * LEVEL[l];
          (water ? wb : ob).quad(pos12, uv8, tile, light);
          for (let hh = 0; hh < ht; hh++) for (let ww = 0; ww < wd; ww++) mask[nn + ww + hh * du] = 0;
          i += wd; nn += wd;
        }
      }
    }
  }

  // --- blocs à formes ---
  for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) for (let xx = 0; xx < 16; xx++) {
    const id = self[bidx(xx, y, z)];
    if (!SHAPED[id]) continue;
    const def = BLOCKS[id];
    const l = LEVEL[lit(xx, y, z)];
    if (def.render === 'boxes') {
      for (const bx of def.boxes) emitBox(ob, id, xx, y, z, bx, l, pad);
    } else if (def.render === 'pyramid') emitPyramid(ob, id, xx, y, z, l);
    else if (def.render === 'prism') emitPrism(ob, id, xx, y, z, l, def.rot);
    else if (def.render === 'dome') emitDome(ob, id, xx, y, z, l);
  }

  return { opaque: ob.done(), water: wb.done() };
}

function faceDrawn(a: number, b: number): boolean {
  if (OPAQUE[b]) return false;
  if (LIQUID[a]) return !LIQUID[b];
  if (a === b && BLOCKS[a].cutout) return false;
  return true;
}

function emitBox(bd: Builder, id: number, bx: number, by: number, bz: number, box: Box, light: number, pad: Uint8Array) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const X0 = bx + x0, X1 = bx + x1, Y0 = by + y0, Y1 = by + y1, Z0 = bz + z0, Z1 = bz + z1;
  const uv: number[] = [];
  const faces: [number, number[], boolean][] = [
    [0, [X1, Y0, Z1, X1, Y0, Z0, X1, Y1, Z0, X1, Y1, Z1], x1 >= 1],
    [1, [X0, Y0, Z0, X0, Y0, Z1, X0, Y1, Z1, X0, Y1, Z0], x0 <= 0],
    [2, [X0, Y1, Z1, X1, Y1, Z1, X1, Y1, Z0, X0, Y1, Z0], y1 >= 1],
    [3, [X0, Y0, Z0, X1, Y0, Z0, X1, Y0, Z1, X0, Y0, Z1], y0 <= 0],
    [4, [X0, Y0, Z1, X1, Y0, Z1, X1, Y1, Z1, X0, Y1, Z1], z1 >= 1],
    [5, [X1, Y0, Z0, X0, Y0, Z0, X0, Y1, Z0, X1, Y1, Z0], z0 <= 0],
  ];
  const nb: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [f, p, onEdge] of faces) {
    if (onEdge) {
      const n = pad[pidx(bx + nb[f][0], by + nb[f][1], bz + nb[f][2])];
      if (OPAQUE[n]) continue;
    }
    uv.length = 0;
    for (let c = 0; c < 4; c++) faceUV(f, p[c * 3], p[c * 3 + 1], p[c * 3 + 2], uv);
    bd.quad(p, uv, FACE_TILE[id * 6 + f], SHADE[f] * light);
  }
}

function emitPyramid(bd: Builder, id: number, bx: number, by: number, bz: number, l: number) {
  const t = FACE_TILE[id * 6 + 4];
  const ax = bx + 0.5, ay = by + 1, az = bz + 0.5;
  const c = [[bx, bz], [bx + 1, bz], [bx + 1, bz + 1], [bx, bz + 1]];
  // quatre faces triangulaires (sens trigonométrique vu de l'extérieur)
  const sides: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const sh = [0.86, 0.72, 0.86, 0.72];
  sides.forEach(([i, j], k) => {
    // base : c[i] -> c[j], sommet : apex. Le sens dépend de l'orientation de la boucle (x, z).
    bd.tri([c[j][0], by, c[j][1], c[i][0], by, c[i][1], ax, ay, az], [1, 1, 0, 1, 0.5, 0], t, sh[k] * l * 1.05);
  });
  bd.quad([bx, by, bz, bx + 1, by, bz, bx + 1, by, bz + 1, bx, by, bz + 1], [0, 0, 1, 0, 1, 1, 0, 1], t, 0.5 * l);
}

function emitPrism(bd: Builder, id: number, bx: number, by: number, bz: number, l: number, k: number) {
  const t = FACE_TILE[id * 6 + 4];
  const P = (px: number, py: number, pz: number): [number, number, number] => {
    const [rx, rz] = rotPt(px, pz, k);
    return [bx + rx, by + py, bz + rz];
  };
  const a0 = P(0, 0, 0), a1 = P(1, 0, 0), a2 = P(0.5, 1, 0);
  const b0 = P(0, 0, 1), b1 = P(1, 0, 1), b2 = P(0.5, 1, 1);
  const flat = (...v: [number, number, number][]) => v.flat();
  // pans inclinés
  bd.quad(flat(a0, b0, b2, a2), [0, 1, 1, 1, 1, 0, 0, 0], t, 0.85 * l);
  bd.quad(flat(b1, a1, a2, b2), [0, 1, 1, 1, 1, 0, 0, 0], t, 0.7 * l);
  // base
  bd.quad(flat(a0, a1, b1, b0), [0, 0, 1, 0, 1, 1, 0, 1], t, 0.5 * l);
  // extrémités triangulaires
  bd.tri(flat(a1, a0, a2), [1, 1, 0, 1, 0.5, 0], t, 0.8 * l);
  bd.tri(flat(b0, b1, b2), [0, 1, 1, 1, 0.5, 0], t, 0.8 * l);
}

function emitDome(bd: Builder, id: number, bx: number, by: number, bz: number, l: number) {
  const t = FACE_TILE[id * 6 + 4];
  const R = 0.5, cxm = bx + 0.5, czm = bz + 0.5;
  const SEG = 10, RINGS = 4;
  const pt = (ring: number, seg: number): [number, number, number] => {
    const phi = (ring / RINGS) * (Math.PI / 2);
    const th = (seg / SEG) * Math.PI * 2;
    return [cxm + Math.cos(th) * Math.cos(phi) * R, by + Math.sin(phi) * R, czm + Math.sin(th) * Math.cos(phi) * R];
  };
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const p00 = pt(r, s), p10 = pt(r, s + 1), p01 = pt(r + 1, s), p11 = pt(r + 1, s + 1);
    const uvp = (p: number[]) => [p[0] - bx, p[2] - bz];
    const sh = (0.75 + 0.25 * Math.sin(((r + 0.5) / RINGS) * Math.PI / 2)) * l;
    // normale vers l'extérieur : ordre p00, p01, p11, p10 (vu du dessus, tourne dans le sens horaire)
    if (r === RINGS - 1) {
      bd.tri([...p00, ...p01, ...p10].map((v) => v), [...uvp(p00), ...uvp(p01), ...uvp(p10)], t, sh);
    } else {
      bd.quad([...p00, ...p01, ...p11, ...p10], [...uvp(p00), ...uvp(p01), ...uvp(p11), ...uvp(p10)], t, sh);
    }
  }
  void FULLCUBE;
}
