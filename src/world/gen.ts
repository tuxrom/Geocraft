import { CHUNK_VOL, SEA, bidx, smooth, lerp } from '../core/constants';
import { Simplex, hash3, mulberry32 } from '../core/rng';
import { B } from '../data/blocks';

export const enum Biome { Plains = 0, Forest = 1, Desert = 2, Mountains = 3, Jungle = 4, Volcano = 5 }

/** Centre du plateau de départ (cabane du Professeur Théorème). */
export const HUB_X = 10;
export const HUB_Z = 10;
export const HUB_H = 46;

export interface Volcano { cx: number; cz: number; R: number; top: number; crater: number; lava: number }
export interface House { x0: number; z0: number; w: number; d: number; base: number; door: 'n' | 's' | 'e' | 'w'; style: number }
export interface Village { x: number; z: number; y: number; houses: House[]; paths: number[][] }
export interface Castle { x: number; z: number; base: number }

/** Contexte d'écriture d'un chunk pour les structures définies en coordonnées monde. */
interface Gen { blocks: Uint8Array; ox: number; oz: number; hs: Int16Array }

const VOLC_CELL = 560;
const VILLAGE_CELL = 320;
const CASTLE_CELL = 384;
const HOUSE_CELL = 128;

export class Terrain {
  readonly seed: number;
  private sCont: Simplex;
  private sMount: Simplex;
  private sDetail: Simplex;
  private sTemp: Simplex;
  private sCave: Simplex;
  private sBasin: Simplex;
  private cache = new Map<string, unknown>();

  constructor(seed: number) {
    this.seed = seed | 0;
    this.sCont = new Simplex(this.seed ^ 0x1234);
    this.sMount = new Simplex(this.seed ^ 0x5678);
    this.sDetail = new Simplex(this.seed ^ 0x9abc);
    this.sTemp = new Simplex(this.seed ^ 0xdef0);
    this.sCave = new Simplex(this.seed ^ 0x2468);
    this.sBasin = new Simplex(this.seed ^ 0x1357);
  }

  private memo<T>(key: string, fn: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const v = fn();
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, v);
    return v;
  }

  private hubBlend(x: number, z: number): number {
    const d = Math.hypot(x - HUB_X, z - HUB_Z);
    return smooth(14, 70, d);
  }

  /** Les montagnes restent loin du point de départ. */
  private mountainBlend(x: number, z: number): number {
    const d = Math.hypot(x - HUB_X, z - HUB_Z);
    return smooth(70, 190, d);
  }

  mountainMask(x: number, z: number): number {
    const m = this.sMount.fbm2(x / 620 + 100, z / 620, 2);
    return smooth(0.12, 0.5, m) * this.mountainBlend(x, z);
  }

  /** Volcan de la cellule contenant (x, z), s'il existe. */
  volcanoCell(i: number, j: number): Volcano | null {
    return this.memo(`v:${i}:${j}`, () => {
      if (hash3(i, 401, j, this.seed) > 0.5) return null;
      const r1 = hash3(i, 402, j, this.seed), r2 = hash3(i, 403, j, this.seed), r3 = hash3(i, 404, j, this.seed);
      const cx = i * VOLC_CELL + 150 + r1 * (VOLC_CELL - 300), cz = j * VOLC_CELL + 150 + r2 * (VOLC_CELL - 300);
      if (Math.hypot(cx - HUB_X, cz - HUB_Z) < 360) return null;
      const R = 58 + r3 * 34;
      const top = 98 + Math.floor(r1 * 16);
      return { cx, cz, R, top, crater: R * 0.17, lava: top - 3 };
    });
  }

  volcano(x: number, z: number): Volcano | null {
    const v = this.volcanoCell(Math.floor(x / VOLC_CELL), Math.floor(z / VOLC_CELL));
    if (!v || Math.hypot(x - v.cx, z - v.cz) > v.R) return null;
    return v;
  }

  private baseHeight(x: number, z: number): number {
    const cont = this.sCont.fbm2(x / 420, z / 420, 3);
    let h = 45 + cont * 10 + this.sDetail.fbm2(x / 52, z / 52, 3) * 5;
    const m = this.mountainMask(x, z);
    if (m > 0) {
      const ridge = 1 - Math.abs(this.sMount.noise2(x / 150 + 40, z / 150 + 40));
      h += m * (ridge * ridge * 54 + 8);
    }
    // lacs : cuvettes plus nombreuses et plus larges
    const basin = this.sBasin.fbm2(x / 130 + 500, z / 130, 2);
    if (basin < -0.12) h -= Math.min(14, 4 + (-0.12 - basin) * 60) * this.hubBlend(x, z) * (1 - m);
    return h;
  }

  /** Altitude (entière) du dessus du terrain en (x, z). */
  height(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    const v = this.volcano(x, z);
    if (v) {
      const d = Math.hypot(x - v.cx, z - v.cz);
      // cône : altitude maximale sur le bord du cratère, cuvette au centre
      const t = Math.min(1, (v.R - d) / (v.R - v.crater));
      const cone = 42 + (v.top - 42) * Math.pow(t, 1.35) + this.sDetail.noise2(x / 9, z / 9) * 1.5 * t;
      h = Math.max(h, cone);
      if (d < v.crater) h = v.top - 9 + (d / v.crater) * 5;
    }
    h = lerp(HUB_H, h, this.hubBlend(x, z));
    return Math.max(4, Math.min(122, Math.round(h)));
  }

  biome(x: number, z: number, h: number): Biome {
    if (Math.hypot(x - HUB_X, z - HUB_Z) < 45) return Biome.Plains;
    const v = this.volcano(x, z);
    if (v && h > this.baseHeight(x, z) + 2) return Biome.Volcano;
    if (this.mountainMask(x, z) > 0.3) return Biome.Mountains;
    const temp = this.sTemp.fbm2(x / 560 + 900, z / 560, 2);
    const hum = this.sTemp.fbm2(x / 450 + 1700, z / 450 + 33, 2);
    if (temp > 0.04 && hum > 0.14) return Biome.Jungle;
    if (temp > 0.22 && hum < 0.15) return Biome.Desert;
    if (hum > 0.02) return Biome.Forest;
    return Biome.Plains;
  }

  /** Point d'apparition du joueur (coordonnées monde, y du sol). */
  spawn(): { x: number; y: number; z: number } {
    return { x: 4.5, y: HUB_H + 1, z: 4.5 };
  }

  // ------------------------------------------------------------ structures
  village(i: number, j: number): Village | null {
    return this.memo(`vil:${i}:${j}`, () => {
      if (hash3(i, 301, j, this.seed) > 0.6) return null;
      const rnd = mulberry32(hash3(i, 302, j, this.seed) * 4294967296);
      const x = Math.round(i * VILLAGE_CELL + 70 + rnd() * (VILLAGE_CELL - 140));
      const z = Math.round(j * VILLAGE_CELL + 70 + rnd() * (VILLAGE_CELL - 140));
      if (Math.hypot(x - HUB_X, z - HUB_Z) < 110) return null;
      const y = this.height(x, z);
      const b = this.biome(x, z, y);
      if (b === Biome.Mountains || b === Biome.Volcano || y <= SEA + 1 || y > 86) return null;
      const style = b === Biome.Jungle ? 2 : b === Biome.Desert ? 1 : -1;
      const houses: House[] = [];
      const n = 5 + Math.floor(rnd() * 5);
      for (let k = 0; k < n * 3 && houses.length < n; k++) {
        const ang = (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
        const rad = 12 + rnd() * 16;
        const w = rnd() < 0.5 ? 5 : 7, d = rnd() < 0.5 ? 5 : 7;
        const hx = Math.round(x + Math.cos(ang) * rad), hz = Math.round(z + Math.sin(ang) * rad);
        const x0 = hx - (w >> 1), z0 = hz - (d >> 1);
        const base = this.height(hx, hz);
        if (base <= SEA + 1 || Math.abs(base - y) > 7) continue;
        if (houses.some((o) => x0 < o.x0 + o.w + 3 && x0 + w + 3 > o.x0 && z0 < o.z0 + o.d + 3 && z0 + d + 3 > o.z0)) continue;
        if (Math.abs(hx - x) < 5 && Math.abs(hz - z) < 5) continue;
        const dx = x - hx, dz = z - hz;
        const door: House['door'] = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
        houses.push({ x0, z0, w, d, base, door, style: style >= 0 ? style : Math.floor(rnd() * 2) });
      }
      if (houses.length < 3) return null;
      const paths: number[][] = [];
      for (const hs of houses) {
        const [dx, dz] = this.doorFront(hs);
        const len = Math.max(Math.abs(dx - x), Math.abs(dz - z));
        for (let t = 0; t <= len; t++) paths.push([Math.round(x + ((dx - x) * t) / len), Math.round(z + ((dz - z) * t) / len)]);
      }
      return { x, z, y, houses, paths };
    });
  }

  /** Villages dont le centre est à moins de r blocs de (x, z). */
  villagesNear(x: number, z: number, r: number): Village[] {
    const out: Village[] = [];
    for (let i = Math.floor((x - r) / VILLAGE_CELL); i <= Math.floor((x + r) / VILLAGE_CELL); i++)
      for (let j = Math.floor((z - r) / VILLAGE_CELL); j <= Math.floor((z + r) / VILLAGE_CELL); j++) {
        const v = this.village(i, j);
        if (v && Math.hypot(v.x - x, v.z - z) <= r) out.push(v);
      }
    return out;
  }

  castle(i: number, j: number): Castle | null {
    return this.memo(`cas:${i}:${j}`, () => {
      if (hash3(i, 501, j, this.seed) > 0.8) return null;
      const x = Math.round(i * CASTLE_CELL + 80 + hash3(i, 502, j, this.seed) * (CASTLE_CELL - 160));
      const z = Math.round(j * CASTLE_CELL + 80 + hash3(i, 503, j, this.seed) * (CASTLE_CELL - 160));
      if (Math.hypot(x - HUB_X, z - HUB_Z) < 160) return null;
      const base = this.height(x, z);
      const b = this.biome(x, z, base);
      if (b === Biome.Mountains || b === Biome.Volcano || base <= SEA + 2 || base > 86) return null;
      let lo = base, hi = base;
      for (const [dx, dz] of [[-15, -15], [15, -15], [-15, 15], [15, 15], [0, 15], [0, -15], [15, 0], [-15, 0]]) {
        const h = this.height(x + dx, z + dz);
        if (h <= SEA) return null;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (hi - lo > 18) return null;
      if (this.villagesNear(x, z, 75).length) return null;
      return { x, z, base };
    });
  }

  private loneHouse(i: number, j: number): House | null {
    return this.memo(`hou:${i}:${j}`, () => {
      if (hash3(i, 601, j, this.seed) > 0.24) return null;
      const hx = Math.round(i * HOUSE_CELL + 20 + hash3(i, 602, j, this.seed) * (HOUSE_CELL - 40));
      const hz = Math.round(j * HOUSE_CELL + 20 + hash3(i, 603, j, this.seed) * (HOUSE_CELL - 40));
      if (Math.hypot(hx - HUB_X, hz - HUB_Z) < 50) return null;
      const base = this.height(hx, hz);
      const b = this.biome(hx, hz, base);
      if (b === Biome.Mountains || b === Biome.Volcano || base <= SEA + 1 || base > 88) return null;
      if (this.villagesNear(hx, hz, 50).length) return null;
      const r = hash3(i, 604, j, this.seed);
      const w = r < 0.5 ? 5 : 7, d = r < 0.3 || r > 0.8 ? 7 : 5;
      const door = (['n', 's', 'e', 'w'] as const)[Math.floor(hash3(i, 605, j, this.seed) * 4)];
      return { x0: hx - (w >> 1), z0: hz - (d >> 1), w, d, base, door, style: b === Biome.Jungle ? 2 : b === Biome.Desert ? 1 : Math.floor(r * 2) };
    });
  }

  private doorFront(hs: House): [number, number] {
    const x1 = hs.x0 + hs.w - 1, z1 = hs.z0 + hs.d - 1, mx = hs.x0 + (hs.w >> 1), mz = hs.z0 + (hs.d >> 1);
    if (hs.door === 'n') return [mx, hs.z0 - 1];
    if (hs.door === 's') return [mx, z1 + 1];
    if (hs.door === 'w') return [hs.x0 - 1, mz];
    return [x1 + 1, mz];
  }

  generate(cx: number, cz: number, mods?: ArrayLike<number>): Uint8Array {
    const blocks = new Uint8Array(CHUNK_VOL);
    const ox = cx * 16, oz = cz * 16;
    const hs = new Int16Array(256);
    const bs = new Uint8Array(256);

    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = this.height(ox + x, oz + z);
      hs[z * 16 + x] = h;
      bs[z * 16 + x] = this.biome(ox + x, oz + z, h);
    }

    // Colonnes : roche, sol, eau, lave
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hs[z * 16 + x], bio = bs[z * 16 + x] as Biome;
      const wx = ox + x, wz = oz + z;
      const beach = h <= SEA + 1;
      const dirtDepth = 3 + Math.floor(hash3(wx, 0, wz, this.seed) * 2);
      const v = bio === Biome.Volcano ? this.volcano(wx, wz) : null;
      const vd = v ? Math.hypot(wx - v.cx, wz - v.cz) : 0;
      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y === 0) id = B.bedrock;
        else if (v) {
          id = y > h - 4 ? (vd < v.crater + 3 ? B.obsidian : B.basalt) : (y > h - 14 ? B.basalt : B.stone);
        } else if (y > h - dirtDepth) {
          if (bio === Biome.Mountains) {
            id = y === h && h >= 96 ? B.snow : (hash3(wx, y, wz, this.seed + 3) < 0.04 && h > 70 ? B.gravel : B.stone);
          } else if (bio === Biome.Desert || beach) id = B.sand;
          else if (h <= SEA - 1 && y >= h - 1 && hash3(wx, y, wz, 7) < 0.4) id = B.gravel;
          else id = y === h ? B.grass : B.dirt;
        } else id = B.stone;
        blocks[bidx(x, y, z)] = id;
      }
      if (v) {
        // lac de lave du cratère et coulées sur les flancs
        for (let y = h + 1; y <= v.lava && vd < v.crater; y++) blocks[bidx(x, y, z)] = B.lava;
        const ang = Math.atan2(wz - v.cz, wx - v.cx);
        for (let k = 0; k < 3; k++) {
          const a0 = hash3(Math.floor(v.cx), 410 + k, Math.floor(v.cz), this.seed) * Math.PI * 2;
          let da = Math.abs(ang - a0); da = Math.min(da, Math.PI * 2 - da);
          const width = (2.6 + Math.sin(vd * 0.3 + k) * 0.8) / Math.max(8, vd);
          if (da < width && vd > v.crater + 1 && vd < v.R * (0.6 + 0.1 * k)) blocks[bidx(x, h, z)] = B.lava;
        }
      }
      for (let y = h + 1; y <= SEA; y++) if (!blocks[bidx(x, y, z)]) blocks[bidx(x, y, z)] = B.water;
    }

    // Grottes et cavernes
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hs[z * 16 + x];
      const wx = ox + x, wz = oz + z;
      const wet = h <= SEA + 1;
      for (let y = 3; y < h - 1; y++) {
        if (wet && y > h - 5) continue;
        const a = this.sCave.noise3(wx / 34, y / 22, wz / 34);
        const b = this.sCave.noise3(wx / 34 + 100, y / 22 + 50, wz / 34 + 100);
        const near = y > h - 5;
        let carve = a * a + b * b < (near ? 0.0028 : 0.011);
        if (!carve && y < 46) {
          const c = this.sCave.noise3(wx / 52 + 400, y / 20, wz / 52);
          carve = c > 0.5 + (y > 34 ? (y - 34) * 0.02 : 0);
        }
        if (carve) {
          const i = bidx(x, y, z);
          const cur = blocks[i];
          if (cur !== B.bedrock && cur !== B.water && cur !== B.lava) blocks[i] = y <= 9 ? B.lava : B.air;
        }
      }
    }

    this.ores(blocks, cx, cz);
    this.trees(blocks, cx, cz, hs, bs);
    this.structures({ blocks, ox, oz, hs }, cx, cz, bs);

    if (mods) {
      for (let i = 0; i + 1 < mods.length; i += 2) blocks[mods[i]] = mods[i + 1];
    }
    return blocks;
  }

  private ores(blocks: Uint8Array, cx: number, cz: number) {
    const rnd = mulberry32(hash3(cx, 91, cz, this.seed) * 4294967296);
    const types: [number, number, number, number, number][] = [
      // id, tentatives, ymin, ymax, taille
      [B.copper_ore, 11, 8, 66, 7],
      [B.iron_ore, 9, 5, 52, 6],
      [B.gold_ore, 2.2, 4, 30, 4],
      [B.diamond_ore, 1.2, 2, 17, 3],
      [B.euclid_ore, 0.38, 2, 13, 3],
    ];
    for (const [id, tries, y0, y1, size] of types) {
      let n = Math.floor(tries);
      if (rnd() < tries - n) n++;
      for (let t = 0; t < n; t++) {
        let x = Math.floor(rnd() * 16), z = Math.floor(rnd() * 16), y = y0 + Math.floor(rnd() * (y1 - y0));
        const len = 1 + Math.floor(rnd() * size);
        for (let k = 0; k < len; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < 127) {
            const i = bidx(x, y, z);
            if (blocks[i] === B.stone) blocks[i] = id;
          }
          x += Math.floor(rnd() * 3) - 1; y += Math.floor(rnd() * 3) - 1; z += Math.floor(rnd() * 3) - 1;
        }
      }
    }
  }

  private trees(blocks: Uint8Array, cx: number, cz: number, hs: Int16Array, bs: Uint8Array) {
    const ox = cx * 16, oz = cz * 16;
    for (let wz = oz - 4; wz < oz + 20; wz++) for (let wx = ox - 4; wx < ox + 20; wx++) {
      const lx = wx - ox, lz = wz - oz;
      let h: number, bio: Biome;
      if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) { h = hs[lz * 16 + lx]; bio = bs[lz * 16 + lx]; }
      else {
        // test rapide de densité avant de calculer le terrain voisin
        if (hash3(wx, 5, wz, this.seed) >= 0.09) continue;
        h = this.height(wx, wz); bio = this.biome(wx, wz, h);
      }
      if (h <= SEA + 1 || h > 88) continue;
      if (bio === Biome.Desert || bio === Biome.Volcano) continue;
      if (Math.hypot(wx - HUB_X, wz - HUB_Z) < 22) continue;
      const roll = hash3(wx, 5, wz, this.seed);
      if (bio === Biome.Jungle) {
        if (roll < 0.075) this.jungleTree(blocks, wx - ox, h, wz - oz, wx, wz);
        else if (roll < 0.13) this.put(blocks, lx, h + 1, lz, B.jungle_leaves, false); // buisson
        continue;
      }
      const dens = bio === Biome.Forest ? 0.045 : bio === Biome.Plains ? 0.0035 : 0.004;
      if (roll >= dens) continue;
      const r = hash3(wx, 6, wz, this.seed);
      const th = 4 + Math.floor(r * 3);
      for (let y = 1; y <= th; y++) this.put(blocks, lx, h + y, lz, B.log, true);
      const top = h + th;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy >= 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy >= 0 || hash3(wx + dx, top + dy, wz + dz, this.seed) < 0.5)) continue;
          this.put(blocks, lx + dx, top + dy, lz + dz, B.leaves, false);
        }
      }
    }
  }

  /** Arbre de jungle : tronc haut, large couronne et lianes. */
  private jungleTree(blocks: Uint8Array, lx: number, h: number, lz: number, wx: number, wz: number) {
    const th = 8 + Math.floor(hash3(wx, 7, wz, this.seed) * 7);
    for (let y = 1; y <= th; y++) this.put(blocks, lx, h + y, lz, B.jungle_log, true);
    const top = h + th;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy === 1 ? 2 : dy === 0 ? 3 : dy === -1 ? 3 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dz * dz > rad * rad + 1) continue;
        this.put(blocks, lx + dx, top + dy, lz + dz, B.jungle_leaves, false);
        // lianes pendantes sur le pourtour
        if (dy === -1 && dx * dx + dz * dz >= (rad - 1) * (rad - 1) && hash3(wx + dx, 9, wz + dz, this.seed) < 0.35) {
          const len = 1 + Math.floor(hash3(wx + dx, 10, wz + dz, this.seed) * 4);
          for (let k = 1; k <= len; k++) this.put(blocks, lx + dx, top + dy - k, lz + dz, B.jungle_leaves, false);
        }
      }
    }
    // couronne intermédiaire
    const mid = h + Math.floor(th * 0.6);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > 2 || (dx === 0 && dz === 0)) continue;
      this.put(blocks, lx + dx, mid, lz + dz, B.jungle_leaves, false);
    }
  }

  private put(blocks: Uint8Array, x: number, y: number, z: number, id: number, force: boolean) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y > 127) return;
    const i = bidx(x, y, z);
    if (force || blocks[i] === B.air) blocks[i] = id;
  }

  // ----------------------------------------------- écriture des structures
  private set(g: Gen, wx: number, y: number, wz: number, id: number) {
    const lx = wx - g.ox, lz = wz - g.oz;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y > 127) return;
    g.blocks[bidx(lx, y, lz)] = id;
  }

  private overlaps(g: Gen, x0: number, z0: number, x1: number, z1: number): boolean {
    return x1 >= g.ox && x0 <= g.ox + 15 && z1 >= g.oz && z0 <= g.oz + 15;
  }

  /** Aplanit un rectangle : remblai jusqu'à base, sol, puis vide au-dessus. */
  private prepare(g: Gen, x0: number, z0: number, x1: number, z1: number, base: number, clear: number, fill: number, floor: number) {
    for (let wz = Math.max(z0, g.oz); wz <= Math.min(z1, g.oz + 15); wz++) for (let wx = Math.max(x0, g.ox); wx <= Math.min(x1, g.ox + 15); wx++) {
      const h = g.hs[(wz - g.oz) * 16 + (wx - g.ox)];
      for (let y = Math.min(h + 1, base - 1); y < base; y++) {
        const i = bidx(wx - g.ox, y, wz - g.oz);
        if (y > h || g.blocks[i] === B.air || g.blocks[i] === B.water) g.blocks[i] = fill;
      }
      this.set(g, wx, base, wz, floor);
      const top = Math.min(127, Math.max(h, base) + clear);
      for (let y = base + 1; y <= top; y++) this.set(g, wx, y, wz, B.air);
    }
  }

  private structures(g: Gen, cx: number, cz: number, bs: Uint8Array) {
    if (cx === 0 && cz === 0) this.hut(g.blocks);
    const x0 = g.ox, z0 = g.oz, x1 = g.ox + 15, z1 = g.oz + 15;
    // maisons isolées
    for (let i = Math.floor((x0 - 12) / HOUSE_CELL); i <= Math.floor((x1 + 12) / HOUSE_CELL); i++)
      for (let j = Math.floor((z0 - 12) / HOUSE_CELL); j <= Math.floor((z1 + 12) / HOUSE_CELL); j++) {
        const hs = this.loneHouse(i, j);
        if (hs && this.overlaps(g, hs.x0 - 1, hs.z0 - 1, hs.x0 + hs.w, hs.z0 + hs.d)) this.house(g, hs);
      }
    // villages
    for (let i = Math.floor((x0 - 60) / VILLAGE_CELL); i <= Math.floor((x1 + 60) / VILLAGE_CELL); i++)
      for (let j = Math.floor((z0 - 60) / VILLAGE_CELL); j <= Math.floor((z1 + 60) / VILLAGE_CELL); j++) {
        const v = this.village(i, j);
        if (v && this.overlaps(g, v.x - 50, v.z - 50, v.x + 50, v.z + 50)) this.buildVillage(g, v);
      }
    // châteaux forts
    for (let i = Math.floor((x0 - 20) / CASTLE_CELL); i <= Math.floor((x1 + 20) / CASTLE_CELL); i++)
      for (let j = Math.floor((z0 - 20) / CASTLE_CELL); j <= Math.floor((z1 + 20) / CASTLE_CELL); j++) {
        const c = this.castle(i, j);
        if (c && this.overlaps(g, c.x - 18, c.z - 18, c.x + 18, c.z + 18)) this.buildCastle(g, c);
      }
    if (Math.abs(cx) + Math.abs(cz) < 3) return;
    if (hash3(cx, 77, cz, this.seed) < 0.014) this.ruin(g.blocks, cx, cz, g.hs, bs);
  }

  private buildVillage(g: Gen, v: Village) {
    // chemins de gravier vers chaque porte
    for (const [px, pz] of v.paths) {
      if (px < g.ox || px > g.ox + 15 || pz < g.oz || pz > g.oz + 15) continue;
      const h = g.hs[(pz - g.oz) * 16 + (px - g.ox)];
      const i = bidx(px - g.ox, h, pz - g.oz);
      if (h > SEA && (g.blocks[i] === B.grass || g.blocks[i] === B.dirt || g.blocks[i] === B.sand)) {
        g.blocks[i] = B.gravel;
        for (let y = h + 1; y <= h + 3; y++) { const k = bidx(px - g.ox, y, pz - g.oz); if (g.blocks[k] === B.leaves || g.blocks[k] === B.jungle_leaves) g.blocks[k] = B.air; }
      }
    }
    for (const hs of v.houses) if (this.overlaps(g, hs.x0 - 1, hs.z0 - 1, hs.x0 + hs.w, hs.z0 + hs.d)) this.house(g, hs);
    // puits central
    const y = v.y;
    if (this.overlaps(g, v.x - 2, v.z - 2, v.x + 3, v.z + 3)) {
      this.prepare(g, v.x - 2, v.z - 2, v.x + 3, v.z + 3, y, 8, B.dirt, B.gravel);
      for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) {
        const edge = dx === -1 || dx === 2 || dz === -1 || dz === 2;
        const wx = v.x + dx, wz = v.z + dz;
        if (edge) { this.set(g, wx, y, wz, B.stone_bricks); this.set(g, wx, y + 1, wz, B.stone_bricks); }
        else { for (let k = y - 4; k <= y; k++) this.set(g, wx, k, wz, B.water); }
        if ((dx === -1 || dx === 2) && (dz === -1 || dz === 2)) for (let k = y + 2; k <= y + 4; k++) this.set(g, wx, k, wz, B.log);
        this.set(g, wx, y + 5, wz, B.planks);
      }
    }
  }

  /** Maison : style 0 bois, 1 pierre, 2 jungle. Toit en gradins de tuiles. */
  private house(g: Gen, hs: House) {
    const { x0, z0, w, d, base, style } = hs;
    const x1 = x0 + w - 1, z1 = z0 + d - 1;
    const wallH = style === 1 ? 4 : 3;
    this.prepare(g, x0 - 1, z0 - 1, x1 + 1, z1 + 1, base, wallH + 8, B.dirt, B.grass);
    const wallLow = style === 2 ? B.mossy_bricks : style === 1 ? B.stone_bricks : B.planks;
    const wallHigh = style === 2 ? B.mossy_bricks : B.planks;
    const corner = style === 2 ? B.jungle_log : B.log;
    for (let wz = z0; wz <= z1; wz++) for (let wx = x0; wx <= x1; wx++) {
      this.set(g, wx, base, wz, B.planks);
      const ex = wx === x0 || wx === x1, ez = wz === z0 || wz === z1;
      for (let y = base + 1; y <= base + wallH; y++) {
        if (ex && ez) this.set(g, wx, y, wz, corner);
        else if (ex || ez) this.set(g, wx, y, wz, y === base + 1 ? wallLow : wallHigh);
        else this.set(g, wx, y, wz, B.air);
      }
    }
    // fenêtres au milieu de chaque mur
    const mx = x0 + (w >> 1), mz = z0 + (d >> 1);
    const wy = base + 2;
    if (hs.door !== 'n') this.set(g, mx, wy, z0, B.glass);
    if (hs.door !== 's') this.set(g, mx, wy, z1, B.glass);
    if (hs.door !== 'w') this.set(g, x0, wy, mz, B.glass);
    if (hs.door !== 'e') this.set(g, x1, wy, mz, B.glass);
    // porte haute de deux blocs
    const [dx, dz, id] = hs.door === 'n' ? [mx, z0, B.door] : hs.door === 's' ? [mx, z1, B.door_r2] : hs.door === 'w' ? [x0, mz, B.door_r1] : [x1, mz, B.door_r3];
    this.set(g, dx, base + 1, dz, id);
    this.set(g, dx, base + 2, dz, id);
    // toit
    let xa = x0 - 1, za = z0 - 1, xb = x1 + 1, zb = z1 + 1, y = base + wallH + 1;
    while (xa <= xb && za <= zb) {
      for (let wz = za; wz <= zb; wz++) for (let wx = xa; wx <= xb; wx++) {
        let rid = B.planks;
        if (xa === xb || za === zb) rid = style === 2 ? B.jungle_leaves : B.planks;
        else if (wz === zb) rid = B.roof;
        else if (wz === za) rid = B.roof_r2;
        else if (wx === xa) rid = B.roof_r3;
        else if (wx === xb) rid = B.roof_r1;
        this.set(g, wx, y, wz, rid);
      }
      xa++; za++; xb--; zb--; y++;
    }
  }

  /** Château fort : enceinte crénelée, quatre tours d'angle, donjon avec échelle et autel au sommet. */
  private buildCastle(g: Gen, c: Castle) {
    const base = c.base;
    this.prepare(g, c.x - 17, c.z - 17, c.x + 17, c.z + 17, base, 22, B.stone_bricks, B.grass);
    const brick = (wx: number, y: number, wz: number) => (hash3(wx, y, wz, this.seed + 9) < 0.18 ? B.mossy_bricks : B.stone_bricks);
    for (let wz = Math.max(c.z - 16, g.oz); wz <= Math.min(c.z + 16, g.oz + 15); wz++)
      for (let wx = Math.max(c.x - 16, g.ox); wx <= Math.min(c.x + 16, g.ox + 15); wx++) {
        const u = wx - c.x, v = wz - c.z, au = Math.abs(u), av = Math.abs(v);
        const tx = u < 0 ? -13 : 13, tz = v < 0 ? -13 : 13;
        const inTower = Math.abs(u - tx) <= 3 && Math.abs(v - tz) <= 3;
        if (inTower) {
          const shell = Math.abs(u - tx) === 3 || Math.abs(v - tz) === 3;
          for (let y = base + 1; y <= base + 13; y++) this.set(g, wx, y, wz, shell ? brick(wx, y, wz) : B.air);
          this.set(g, wx, base + 7, wz, shell ? brick(wx, base + 7, wz) : B.planks);
          this.set(g, wx, base + 13, wz, B.stone_bricks);
          if (shell && (u + v) % 2 === 0) this.set(g, wx, base + 14, wz, B.stone_bricks);
          if (shell && (u === tx || v === tz)) { this.set(g, wx, base + 4, wz, B.glass); this.set(g, wx, base + 10, wz, B.glass); }
          // accès depuis la cour
          if (shell && ((u === tx && Math.abs(v - tz) === 3 && Math.abs(v) < Math.abs(tz)) || (v === tz && Math.abs(u - tx) === 3 && Math.abs(u) < Math.abs(tx)))) {
            this.set(g, wx, base + 1, wz, B.air); this.set(g, wx, base + 2, wz, B.air);
          }
          continue;
        }
        if (Math.max(au, av) > 15) continue;
        if (Math.max(au, av) >= 14) {
          for (let y = base + 1; y <= base + 7; y++) this.set(g, wx, y, wz, brick(wx, y, wz));
          if (Math.max(au, av) === 15 && (u + v) % 2 === 0) this.set(g, wx, base + 8, wz, B.stone_bricks);
          if (v >= 14 && au <= 1) for (let y = base + 1; y <= base + 4; y++) this.set(g, wx, y, wz, B.air); // porte
          continue;
        }
        if (au <= 5 && av <= 5) {
          const shell = au === 5 || av === 5;
          for (let y = base + 1; y <= base + 16; y++) this.set(g, wx, y, wz, shell ? brick(wx, y, wz) : B.air);
          if (!shell && !(u === 0 && v === -4)) { this.set(g, wx, base + 6, wz, B.planks); this.set(g, wx, base + 11, wz, B.planks); }
          if (!(u === 0 && v === -4)) this.set(g, wx, base + 16, wz, B.stone_bricks);
          if (shell && (u + v) % 2 === 0) this.set(g, wx, base + 17, wz, B.stone_bricks);
          if (shell && (u === 0 || v === 0) && !(v === 5 && u === 0)) { this.set(g, wx, base + 8, wz, B.glass); this.set(g, wx, base + 13, wz, B.glass); }
          if (u === 0 && v === -4) for (let y = base + 1; y <= base + 16; y++) this.set(g, wx, y, wz, B.ladder);
          if (u === 0 && v === 5) { this.set(g, wx, base + 1, wz, B.door_r2); this.set(g, wx, base + 2, wz, B.door_r2); }
          if (u === 0 && v === 0) this.set(g, wx, base + 17, wz, B.altar);
          continue;
        }
        // cour : allée de gravier de la porte au donjon
        if (au <= 1 && v > 5) this.set(g, wx, base, wz, B.gravel);
      }
  }

  /** Cabane du Professeur Théorème : 7x7, pierre taillée et planches. */
  private hut(blocks: Uint8Array) {
    const y0 = HUB_H;
    const x0 = HUB_X - 3, z0 = HUB_Z - 3, x1 = HUB_X + 3, z1 = HUB_Z + 3;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      for (let y = y0 + 1; y <= y0 + 7; y++) blocks[bidx(x, y, z)] = B.air;
      blocks[bidx(x, y0, z)] = B.planks;
      const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
      if (edgeX || edgeZ) {
        for (let y = y0 + 1; y <= y0 + 3; y++) blocks[bidx(x, y, z)] = B.stone_bricks;
        // colonnes d'angle
        if (edgeX && edgeZ) for (let y = y0 + 1; y <= y0 + 4; y++) blocks[bidx(x, y, z)] = B.log;
      }
    }
    // fenêtres
    for (const [x, z] of [[HUB_X - 3, HUB_Z], [HUB_X + 3, HUB_Z], [HUB_X, HUB_Z - 3]]) blocks[bidx(x, y0 + 2, z)] = B.glass;
    // entrée au sud (z+)
    for (let y = y0 + 1; y <= y0 + 2; y++) blocks[bidx(HUB_X, y, z1)] = B.air;
    blocks[bidx(HUB_X, y0 + 1, z1)] = B.door_r2;
    blocks[bidx(HUB_X, y0 + 2, z1)] = B.door_r2;
    // toit en gradins : couronnes d'escaliers rouges tournées vers le centre
    const ring = (y: number, xa: number, za: number, xb: number, zb: number) => {
      for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) {
        let id = B.planks;
        if (z === zb) id = B.roof; // nord haut -> rot 0
        else if (z === za) id = B.roof_r2;
        else if (x === xa) id = B.roof_r3;
        else if (x === xb) id = B.roof_r1;
        blocks[bidx(x, y, z)] = xa === xb ? B.roof : id;
      }
    };
    ring(y0 + 4, x0, z0, x1, z1);
    ring(y0 + 5, x0 + 1, z0 + 1, x1 - 1, z1 - 1);
    ring(y0 + 6, x0 + 2, z0 + 2, x1 - 2, z1 - 2);
    blocks[bidx(HUB_X, y0 + 7, HUB_Z)] = B.pyramid;
    // vide sous le toit (intérieur)
    for (let z = z0 + 1; z <= z1 - 1; z++) for (let x = x0 + 1; x <= x1 - 1; x++) for (let y = y0 + 1; y <= y0 + 3; y++) blocks[bidx(x, y, z)] = B.air;
    // comptoir
    for (let x = HUB_X - 2; x <= HUB_X + 2; x++) blocks[bidx(x, y0 + 1, HUB_Z - 1)] = B.planks;
    // lumière : le tableau noir (pierre taillée) derrière
    blocks[bidx(HUB_X, y0 + 3, z0 + 1)] = B.stone_bricks;
  }

  /** Ruines de Pythagore : triangle rectangle 9-12-15 en pierre taillée. */
  private ruin(blocks: Uint8Array, cx: number, cz: number, hs: Int16Array, bs: Uint8Array) {
    const gy = hs[8 * 16 + 6];
    if (gy <= SEA + 1 || gy > 80 || bs[8 * 16 + 6] === Biome.Mountains) return;
    const rnd = mulberry32(hash3(cx, 78, cz, this.seed) * 4294967296);
    const A = [2, 2], Bp = [11, 2], C = [2, 14];
    const line = (p: number[], q: number[]) => {
      const pts: number[][] = [];
      const n = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
      for (let i = 0; i <= n; i++) pts.push([Math.round(p[0] + ((q[0] - p[0]) * i) / n), Math.round(p[1] + ((q[1] - p[1]) * i) / n)]);
      return pts;
    };
    const wall = new Set<number>();
    const cells: number[][] = [];
    for (const [p, q] of [[A, Bp], [Bp, C], [C, A]]) for (const c of line(p, q)) { if (!wall.has(c[1] * 16 + c[0])) { wall.add(c[1] * 16 + c[0]); cells.push(c); } }
    const col = (x: number, z: number, height: number) => {
      const h = hs[z * 16 + x];
      for (let y = Math.min(h, gy) - 1; y <= gy + height; y++) {
        if (y < 1) continue;
        blocks[bidx(x, y, z)] = y <= gy ? B.stone_bricks : B.stone_bricks;
      }
    };
    // sol intérieur dallé
    for (let z = 2; z <= 14; z++) for (let x = 2; x <= 11; x++) {
      // à l'intérieur du triangle : x/9 + z/12 <= 1
      if ((x - 2) / 9 + (z - 2) / 12 <= 1) {
        const h = hs[z * 16 + x];
        for (let y = h + 1; y <= gy; y++) blocks[bidx(x, y, z)] = B.stone_bricks;
        for (let y = gy + 1; y <= gy + 5; y++) blocks[bidx(x, y, z)] = B.air;
        blocks[bidx(x, gy, z)] = rnd() < 0.2 ? B.stone : B.stone_bricks;
      }
    }
    for (const [x, z] of cells) {
      const isCorner = (x === A[0] && z === A[1]) || (x === Bp[0] && z === Bp[1]) || (x === C[0] && z === C[1]);
      const hgt = isCorner ? 4 + Math.floor(rnd() * 2) : Math.floor(rnd() * 4);
      col(x, z, hgt);
    }
    // autel et trésor
    const ax = 4, az = 5;
    blocks[bidx(ax, gy, az)] = B.euclid_ore;
    blocks[bidx(ax, gy + 1, az)] = B.altar;
    blocks[bidx(ax + 1, gy, az)] = B.diamond_ore;
  }
}
