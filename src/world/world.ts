import * as THREE from 'three';
import { BLOCKS, SOLID, FULLCUBE, LIQUID, B } from '../data/blocks';
import { CHUNK_VOL, bidx, ckey } from '../core/constants';
import { makeWorldMaterials } from '../gfx/worldMaterial';
import { Terrain } from './gen';
import type { MeshResult, MeshData } from './mesher';

export interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array | null;
  genPending: boolean;
  version: number; // incrémenté à chaque modification
  meshedVersion: number; // version du dernier maillage demandé
  meshing: boolean;
  opaque: THREE.Mesh | null;
  water: THREE.Mesh | null;
  hasMesh: boolean;
}

export interface RayHit {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  dist: number;
  id: number;
}

type Job = { kind: 'gen' | 'mesh'; cx: number; cz: number; prio: number };

export class World {
  readonly scene: THREE.Scene;
  readonly seed: number;
  readonly terrain: Terrain;
  chunks = new Map<number, Chunk>();
  /** Modifications du joueur : clé de chunk -> (index -> bloc). */
  mods = new Map<number, Map<number, number>>();
  renderDistance = 6;
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: Job[] = [];
  private mats = makeWorldMaterials();
  private group = new THREE.Group();
  private uploads: { chunk: Chunk; res: MeshResult; version: number }[] = [];
  private jobSeq = 0;
  private planT = 0;
  private lastPcx = 1e9;
  private lastPcz = 1e9;
  private lastR = -1;
  private inflight = new Set<string>();
  dirtySave = false;
  dirtyChunks = new Set<number>();
  onChunkModified?: (cx: number, cz: number) => void;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    this.terrain = new Terrain(seed);
    scene.add(this.group);
    const nw = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < nw; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', seed });
      w.onmessage = (e) => this.onWorker(i, e.data);
      this.workers.push(w);
      this.busy.push(false);
    }
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) this.freeMesh(c);
    this.scene.remove(this.group);
  }

  setMods(data: Record<string, number[]> | undefined) {
    this.mods.clear();
    if (!data) return;
    for (const k of Object.keys(data)) {
      const arr = data[k];
      const m = new Map<number, number>();
      for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.mods.set(Number(k), m);
    }
  }

  exportMods(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [k, m] of this.mods) {
      if (!m.size) continue;
      const arr: number[] = [];
      for (const [i, v] of m) arr.push(i, v);
      out[String(k)] = arr;
    }
    return out;
  }

  // ---------------------------------------------------------------- blocs
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(ckey(cx, cz));
  }

  /** Bloc en (x, y, z) monde. -1 si le chunk n'est pas chargé. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.bedrock;
    if (y > 127) return 0;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(ckey(cx, cz));
    if (!c || !c.blocks) return -1;
    return c.blocks[bidx(x & 15, y, z & 15)];
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y > 127) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.chunks.get(ckey(cx, cz));
    if (!c || !c.blocks) return false;
    const lx = x & 15, lz = z & 15;
    const i = bidx(lx, y, lz);
    if (c.blocks[i] === id) return true;
    c.blocks[i] = id;
    c.version++;
    this.planT = 0;
    const k = ckey(cx, cz);
    let m = this.mods.get(k);
    if (!m) { m = new Map(); this.mods.set(k, m); }
    m.set(i, id);
    this.dirtySave = true;
    this.dirtyChunks.add(k);
    // voisins si en bordure
    if (lx === 0) this.touch(cx - 1, cz);
    if (lx === 15) this.touch(cx + 1, cz);
    if (lz === 0) this.touch(cx, cz - 1);
    if (lz === 15) this.touch(cx, cz + 1);
    this.onChunkModified?.(cx, cz);
    return true;
  }

  private touch(cx: number, cz: number) {
    const c = this.chunks.get(ckey(cx, cz));
    if (c) c.version++;
  }

  /** Altitude du premier bloc solide ou liquide en partant du haut. */
  surfaceY(x: number, z: number): number {
    for (let y = 127; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b < 0) return -1;
      if (SOLID[b] || LIQUID[b]) return y;
    }
    return 0;
  }

  /** Collision d'une boîte alignée avec les blocs solides (ou chunks non chargés). */
  collides(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number): boolean {
    const E = 1e-6;
    const x0 = Math.floor(minx), x1 = Math.floor(maxx - E);
    const y0 = Math.floor(miny), y1 = Math.floor(maxy - E);
    const z0 = Math.floor(minz), z1 = Math.floor(maxz - E);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = this.getBlock(x, y, z);
      if (id < 0) return true;
      if (!SOLID[id]) continue;
      if (FULLCUBE[id]) return true;
      for (const b of BLOCKS[id].boxes) {
        if (minx < x + b[3] && maxx > x + b[0] && miny < y + b[4] && maxy > y + b[1] && minz < z + b[5] && maxz > z + b[2]) return true;
      }
    }
    return false;
  }

  /** Vrai si la boîte touche de l'eau. */
  inLiquid(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number): boolean {
    for (let y = Math.floor(miny); y <= Math.floor(maxy); y++) for (let z = Math.floor(minz); z <= Math.floor(maxz); z++) for (let x = Math.floor(minx); x <= Math.floor(maxx); x++) {
      if (LIQUID[this.getBlock(x, y, z)]) return true;
    }
    return false;
  }

  /** Vrai si la boîte touche un bloc donné (lave...). */
  inBlock(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number, id: number): boolean {
    for (let y = Math.floor(miny); y <= Math.floor(maxy); y++) for (let z = Math.floor(minz); z <= Math.floor(maxz); z++) for (let x = Math.floor(minx); x <= Math.floor(maxx); x++) {
      if (this.getBlock(x, y, z) === id) return true;
    }
    return false;
  }

  /** Vrai si la boîte touche un bloc escaladable. */
  inClimb(minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number): boolean {
    for (let y = Math.floor(miny); y <= Math.floor(maxy); y++) for (let z = Math.floor(minz); z <= Math.floor(maxz); z++) for (let x = Math.floor(minx); x <= Math.floor(maxx); x++) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && BLOCKS[id].climb) return true;
    }
    return false;
  }

  /** Lancer de rayon voxel (DDA). Ignore l'air et l'eau. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hitLiquid = false): RayHit | null {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x)) * tdx : Infinity;
    let tmy = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y)) * tdy : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z)) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 400; i++) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && (hitLiquid || !LIQUID[id])) {
        if (SOLID[id] || BLOCKS[id].climb || BLOCKS[id].boxes.length || hitLiquid) return { x, y, z, nx, ny, nz, dist: t, id };
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxDist) return null;
    }
    return null;
  }

  // -------------------------------------------------------------- chargement
  /** Appelé chaque image. */
  update(px: number, pz: number) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    const R = this.renderDistance;
    const now = performance.now();
    const moved = pcx !== this.lastPcx || pcz !== this.lastPcz || R !== this.lastR;
    if (!moved && now - this.planT < 120) { this.pump(); return; }
    this.planT = now; this.lastPcx = pcx; this.lastPcz = pcz; this.lastR = R;
    // Chunks voulus (génération à R+1 pour pouvoir mailler R)
    const want: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= R + 1.2) want.push({ cx: pcx + dx, cz: pcz + dz, d });
    }
    want.sort((a, b) => a.d - b.d);
    // décharger
    for (const [k, c] of this.chunks) {
      if (Math.hypot(c.cx - pcx, c.cz - pcz) > R + 3) {
        this.freeMesh(c);
        this.chunks.delete(k);
      }
    }
    this.queue.length = 0;
    for (const w of want) {
      let c = this.chunks.get(ckey(w.cx, w.cz));
      if (!c) {
        c = { cx: w.cx, cz: w.cz, blocks: null, genPending: false, version: 0, meshedVersion: -1, meshing: false, opaque: null, water: null, hasMesh: false };
        this.chunks.set(ckey(w.cx, w.cz), c);
      }
      if (!c.blocks && !c.genPending) this.queue.push({ kind: 'gen', cx: w.cx, cz: w.cz, prio: w.d });
      else if (c.blocks && w.d <= R + 0.2 && c.meshedVersion !== c.version && !c.meshing && this.neighborsReady(c)) {
        this.queue.push({ kind: 'mesh', cx: w.cx, cz: w.cz, prio: w.d - 0.5 });
      }
    }
    this.queue.sort((a, b) => a.prio - b.prio);
    this.dispatch();
    // visibilité des chunks lointains
    for (const c of this.chunks.values()) {
      const vis = Math.hypot(c.cx - pcx, c.cz - pcz) <= R + 0.5;
      if (c.opaque) c.opaque.visible = vis;
      if (c.water) c.water.visible = vis;
    }
    this.pump();
  }

  /** Envoi GPU des maillages reçus (budget par image). */
  private pump() {
    let n = 0;
    while (this.uploads.length && n < 3) {
      const u = this.uploads.shift()!;
      this.applyMesh(u.chunk, u.res);
      n++;
    }
  }

  private neighborsReady(c: Chunk): boolean {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
      if (!n || !n.blocks) return false;
    }
    return true;
  }

  private dispatch() {
    for (let wi = 0; wi < this.workers.length && this.queue.length; wi++) {
      if (this.busy[wi]) continue;
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const c = this.chunks.get(ckey(job.cx, job.cz));
        if (!c) continue;
        if (job.kind === 'gen') {
          if (c.genPending || c.blocks) continue;
          c.genPending = true;
          const m = this.mods.get(ckey(job.cx, job.cz));
          const arr: number[] = [];
          if (m) for (const [i, v] of m) arr.push(i, v);
          this.busy[wi] = true;
          this.workers[wi].postMessage({ type: 'gen', job: ++this.jobSeq, cx: job.cx, cz: job.cz, mods: arr });
        } else {
          if (c.meshing || !c.blocks || c.meshedVersion === c.version) continue;
          const nb = (dx: number, dz: number) => this.chunks.get(ckey(job.cx + dx, job.cz + dz))?.blocks ?? null;
          const w = nb(-1, 0), e = nb(1, 0), n = nb(0, -1), s = nb(0, 1);
          if (!w || !e || !n || !s) continue;
          c.meshing = true;
          c.meshedVersion = c.version;
          this.busy[wi] = true;
          this.workers[wi].postMessage({ type: 'mesh', job: ++this.jobSeq, cx: job.cx, cz: job.cz, version: c.version, self: c.blocks, w, e, n, s });
        }
        break;
      }
    }
  }

  private onWorker(wi: number, m: { type: string; cx: number; cz: number; blocks?: Uint8Array; result?: MeshResult; version?: number }) {
    this.busy[wi] = false;
    this.planT = 0;
    const c = this.chunks.get(ckey(m.cx, m.cz));
    if (m.type === 'gen') {
      if (c) { c.blocks = m.blocks!; c.genPending = false; c.version++; }
    } else if (m.type === 'mesh') {
      if (c) {
        c.meshing = false;
        // priorité aux mises à jour : insérées en tête si le chunk a déjà un maillage
        if (c.hasMesh) this.uploads.unshift({ chunk: c, res: m.result!, version: m.version! });
        else this.uploads.push({ chunk: c, res: m.result!, version: m.version! });
      }
    }
    this.dispatch();
  }

  private makeGeometry(d: MeshData, cx: number, cz: number): THREE.BufferGeometry | null {
    if (!d.index.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute('tile', new THREE.BufferAttribute(d.tile, 1));
    g.setAttribute('light', new THREE.BufferAttribute(d.light, 1));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16, 128, 16));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 64, 8), 74);
    void cx; void cz;
    return g;
  }

  private applyMesh(c: Chunk, res: MeshResult) {
    this.freeMesh(c);
    const go = this.makeGeometry(res.opaque, c.cx, c.cz);
    const gw = this.makeGeometry(res.water, c.cx, c.cz);
    if (go) {
      c.opaque = new THREE.Mesh(go, this.mats.opaque);
      c.opaque.position.set(c.cx * 16, 0, c.cz * 16);
      c.opaque.matrixAutoUpdate = false;
      c.opaque.updateMatrix();
      this.group.add(c.opaque);
    }
    if (gw) {
      c.water = new THREE.Mesh(gw, this.mats.water);
      c.water.position.set(c.cx * 16, 0, c.cz * 16);
      c.water.matrixAutoUpdate = false;
      c.water.updateMatrix();
      c.water.renderOrder = 2;
      this.group.add(c.water);
    }
    c.hasMesh = true;
  }

  private freeMesh(c: Chunk) {
    if (c.opaque) { this.group.remove(c.opaque); c.opaque.geometry.dispose(); c.opaque = null; }
    if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); c.water = null; }
  }

  /** Nombre de chunks prêts à l'affichage dans le rayon donné. */
  readyCount(px: number, pz: number, r: number): { ready: number; total: number } {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    let ready = 0, total = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      total++;
      const c = this.chunks.get(ckey(pcx + dx, pcz + dz));
      if (c && c.hasMesh) ready++;
    }
    return { ready, total };
  }

  stats() {
    let meshes = 0, tris = 0;
    for (const c of this.chunks.values()) {
      if (c.opaque) { meshes++; tris += c.opaque.geometry.index!.count / 3; }
      if (c.water) { meshes++; tris += c.water.geometry.index!.count / 3; }
    }
    return { chunks: this.chunks.size, meshes, tris, pendingUploads: this.uploads.length };
  }
}

export { CHUNK_VOL };
