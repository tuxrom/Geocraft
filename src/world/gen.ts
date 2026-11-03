import { CHUNK_VOL, SEA, bidx, smooth, lerp } from '../core/constants';
import { Simplex, hash3, mulberry32 } from '../core/rng';
import { B } from '../data/blocks';

export const enum Biome { Plains = 0, Forest = 1, Desert = 2, Mountains = 3 }

/** Centre du plateau de départ (cabane du Professeur Théorème). */
export const HUB_X = 10;
export const HUB_Z = 10;
export const HUB_H = 46;

export class Terrain {
  readonly seed: number;
  private sCont: Simplex;
  private sMount: Simplex;
  private sDetail: Simplex;
  private sTemp: Simplex;
  private sCave: Simplex;
  private sBasin: Simplex;

  constructor(seed: number) {
    this.seed = seed | 0;
    this.sCont = new Simplex(this.seed ^ 0x1234);
    this.sMount = new Simplex(this.seed ^ 0x5678);
    this.sDetail = new Simplex(this.seed ^ 0x9abc);
    this.sTemp = new Simplex(this.seed ^ 0xdef0);
    this.sCave = new Simplex(this.seed ^ 0x2468);
    this.sBasin = new Simplex(this.seed ^ 0x1357);
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
    const m = this.sMount.fbm2(x / 380 + 100, z / 380, 2);
    return smooth(0.12, 0.5, m) * this.mountainBlend(x, z);
  }

  /** Altitude (entière) du dessus du terrain en (x, z). */
  height(x: number, z: number): number {
    const cont = this.sCont.fbm2(x / 260, z / 260, 3);
    let h = 45 + cont * 9 + this.sDetail.fbm2(x / 48, z / 48, 3) * 5;
    const m = this.mountainMask(x, z);
    if (m > 0) {
      const ridge = 1 - Math.abs(this.sMount.noise2(x / 120 + 40, z / 120 + 40));
      h += m * (ridge * ridge * 52 + 8);
    }
    const basin = this.sBasin.fbm2(x / 100 + 500, z / 100, 2);
    if (basin < -0.28) h -= (-0.28 - basin) * 70 * this.hubBlend(x, z);
    const t = this.hubBlend(x, z);
    h = lerp(HUB_H, h, t);
    return Math.max(4, Math.min(122, Math.round(h)));
  }

  biome(x: number, z: number, h: number): Biome {
    if (Math.hypot(x - HUB_X, z - HUB_Z) < 45) return Biome.Plains;
    if (this.mountainMask(x, z) > 0.3) return Biome.Mountains;
    const temp = this.sTemp.fbm2(x / 350 + 900, z / 350, 2);
    const hum = this.sTemp.fbm2(x / 280 + 1700, z / 280 + 33, 2);
    if (temp > 0.22 && hum < 0.15) return Biome.Desert;
    if (hum > 0.02) return Biome.Forest;
    return Biome.Plains;
  }

  /** Point d'apparition du joueur (coordonnées monde, y du sol). */
  spawn(): { x: number; y: number; z: number } {
    return { x: 4.5, y: HUB_H + 1, z: 4.5 };
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

    // Colonnes : roche, sol, eau
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hs[z * 16 + x], bio = bs[z * 16 + x] as Biome;
      const wx = ox + x, wz = oz + z;
      const beach = h <= SEA + 1;
      const dirtDepth = 3 + Math.floor(hash3(wx, 0, wz, this.seed) * 2);
      for (let y = 0; y <= h; y++) {
        let id: number;
        if (y === 0) id = B.bedrock;
        else if (y > h - dirtDepth) {
          if (bio === Biome.Mountains) {
            id = y === h && h >= 96 ? B.snow : (hash3(wx, y, wz, this.seed + 3) < 0.04 && h > 70 ? B.gravel : B.stone);
          } else if (bio === Biome.Desert || beach) id = B.sand;
          else if (h <= SEA - 1 && y >= h - 1 && hash3(wx, y, wz, 7) < 0.4) id = B.gravel;
          else id = y === h ? B.grass : B.dirt;
        } else id = B.stone;
        // sous une plage ou un lac : le fond est de sable ou de gravier
        blocks[bidx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) blocks[bidx(x, y, z)] = B.water;
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
          if (blocks[i] !== B.bedrock && blocks[i] !== B.water) blocks[i] = B.air;
        }
      }
    }

    this.ores(blocks, cx, cz);
    this.trees(blocks, cx, cz, hs, bs);
    this.structures(blocks, cx, cz, hs, bs);

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
    for (let wz = oz - 3; wz < oz + 19; wz++) for (let wx = ox - 3; wx < ox + 19; wx++) {
      const lx = wx - ox, lz = wz - oz;
      let h: number, bio: Biome;
      if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) { h = hs[lz * 16 + lx]; bio = bs[lz * 16 + lx]; }
      else { h = this.height(wx, wz); bio = this.biome(wx, wz, h); }
      if (h <= SEA + 1 || h > 88) continue;
      if (bio === Biome.Desert) continue;
      if (Math.hypot(wx - HUB_X, wz - HUB_Z) < 22) continue;
      const dens = bio === Biome.Forest ? 0.045 : bio === Biome.Plains ? 0.0035 : 0.004;
      if (hash3(wx, 5, wz, this.seed) >= dens) continue;
      const r = hash3(wx, 6, wz, this.seed);
      const th = 4 + Math.floor(r * 3);
      // tronc
      for (let y = 1; y <= th; y++) this.put(blocks, wx - ox, h + y, wz - oz, B.log, true);
      // couronne
      const top = h + th;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy >= 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy >= 0 || hash3(wx + dx, top + dy, wz + dz, this.seed) < 0.5)) continue;
          this.put(blocks, wx - ox + dx, top + dy, wz - oz + dz, B.leaves, false);
        }
      }
    }
  }

  private put(blocks: Uint8Array, x: number, y: number, z: number, id: number, force: boolean) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y > 127) return;
    const i = bidx(x, y, z);
    if (force || blocks[i] === B.air) blocks[i] = id;
  }

  private structures(blocks: Uint8Array, cx: number, cz: number, hs: Int16Array, bs: Uint8Array) {
    if (cx === 0 && cz === 0) this.hut(blocks);
    if (Math.abs(cx) + Math.abs(cz) < 3) return;
    if (hash3(cx, 77, cz, this.seed) < 0.014) this.ruin(blocks, cx, cz, hs, bs);
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
