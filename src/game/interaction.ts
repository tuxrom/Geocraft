import * as THREE from 'three';
import type { World, RayHit } from '../world/world';
import type { Player } from './player';
import type { Input } from './input';
import type { Inventory } from './inventory';
import type { Effects } from './effects';
import type { AudioSys } from './audio';
import type { UI } from '../ui/ui';
import { BLOCKS, B, SOLID, type BlockDef } from '../data/blocks';
import { ITEMS, KIND, MAT } from '../data/items';
import { surfaceOf } from './audio';
import type { Hand } from '../gfx/hand';

const CRACK_STAGES = 10;

function crackTextures(): THREE.CanvasTexture[] {
  const out: THREE.CanvasTexture[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const px: [number, number][] = [];
  // ordre d'apparition des fissures
  for (let i = 0; i < 90; i++) {
    const cx = 8, cy = 8;
    const a = rnd() * Math.PI * 2, r = rnd() * 9;
    px.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
  }
  for (let s = 0; s < CRACK_STAGES; s++) {
    const cc = document.createElement('canvas');
    cc.width = cc.height = 16;
    const gg = cc.getContext('2d')!;
    const count = Math.floor(((s + 1) / CRACK_STAGES) * 90);
    for (let i = 0; i < count; i++) {
      gg.fillStyle = `rgba(0,0,0,${0.45 + (i % 3) * 0.15})`;
      const [x, y] = px[i];
      gg.fillRect(x, y, 1, 1);
      if (i % 2 === 0) gg.fillRect(x + 1, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(cc);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    out.push(t);
  }
  void g;
  return out;
}

export interface MineContext {
  blockedByEntity: boolean;
}

export class Interaction {
  hit: RayHit | null = null;
  private box: THREE.LineSegments;
  private crack: THREE.Mesh;
  private cracks: THREE.CanvasTexture[];
  private key = '';
  progress = 0;
  private sndT = 0;
  private placeCd = 0;
  private breakCd = 0;
  reach = 5;
  ctx: MineContext = { blockedByEntity: false };
  onAltar?: (x: number, y: number, z: number) => void;
  onUse?: (inv: Inventory) => boolean;
  onBlockBroken?: (x: number, y: number, z: number, id: number) => void;

  constructor(
    private scene: THREE.Scene, private world: World, private player: Player, private input: Input,
    private inv: Inventory, private fx: Effects, private audio: AudioSys, private ui: UI, private hand: Hand,
  ) {
    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 }),
    );
    this.box.visible = false;
    scene.add(this.box);
    this.cracks = crackTextures();
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ map: this.cracks[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.crack.visible = false;
    scene.add(this.crack);
  }

  /** Temps pour casser un bloc avec l'objet tenu. */
  breakTime(def: BlockDef): { time: number; harvest: boolean } {
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    let speed = 1;
    let heldTier = -1;
    let factor = 0;
    if (it?.type === 'weapon') {
      const m = MAT[it.mat!], kd = KIND[it.kind!];
      heldTier = m.tier;
      if (def.tool !== 'hand') {
        factor = kd.mine[def.tool];
        speed = Math.max(1, m.speed * factor);
      } else speed = 1.2;
    }
    const harvest = def.tier < 0 || (heldTier >= def.tier && factor >= 0.5);
    if (def.tool === 'hand') return { time: def.hardness * 1.5 / speed, harvest: true };
    return { time: (def.hardness * (harvest ? 1.5 : 5)) / speed, harvest };
  }

  facing(): number {
    return ((Math.round(this.player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  }

  update(dt: number, active: boolean, creative: boolean) {
    this.placeCd -= dt; this.breakCd -= dt; this.sndT -= dt;
    const p = this.player;
    const eye = p.eyePos();
    const dir = p.lookDir();
    this.reach = creative ? 7 : 5;
    this.hit = active ? this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, this.reach) : null;

    // surbrillance
    if (this.hit) {
      this.box.visible = true;
      this.box.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
    } else this.box.visible = false;

    // minage
    const wantMine = active && this.input.mouse[0] && this.hit && !this.ctx.blockedByEntity;
    this.hand.mining = !!wantMine;
    if (wantMine && this.hit) {
      const h = this.hit;
      const def = BLOCKS[h.id];
      const k = `${h.x},${h.y},${h.z}`;
      if (k !== this.key) { this.key = k; this.progress = 0; }
      if (def.hardness < 9000) {
        if (creative) {
          if (this.breakCd <= 0) { this.breakBlock(h, true); this.breakCd = 0.18; this.hand.swing(); }
        } else {
          const { time } = this.breakTime(def);
          this.progress += dt / time;
          if (this.sndT <= 0) { this.audio.sfx('mine', 0.8, surfaceOf(def)); this.sndT = 0.22; this.fx.blockBreak(h.x, h.y, h.z, h.id, 2); }
          if (this.progress >= 1) { this.breakBlock(h, false); this.progress = 0; this.key = ''; }
        }
      }
    } else {
      this.progress = Math.max(0, this.progress - dt * 2);
      if (!this.input.mouse[0]) this.key = '';
    }
    const showCrack = this.progress > 0.02 && this.hit && this.key === `${this.hit.x},${this.hit.y},${this.hit.z}`;
    this.crack.visible = !!showCrack;
    if (showCrack && this.hit) {
      this.crack.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
      const mat = this.crack.material as THREE.MeshBasicMaterial;
      mat.map = this.cracks[Math.min(CRACK_STAGES - 1, Math.floor(this.progress * CRACK_STAGES))];
      mat.needsUpdate = false;
    }

    // clic droit : poser, ouvrir, utiliser
    if (active && (this.input.mousePressed[2] || (this.input.mouse[2] && this.placeCd <= 0))) {
      if (this.rightClick(creative)) this.placeCd = 0.22;
    }
  }

  private rightClick(creative: boolean): boolean {
    const h = this.hit;
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    if (h) {
      const def = BLOCKS[h.id];
      if (def.toggleId !== undefined && !this.player.crouching) {
        this.world.setBlock(h.x, h.y, h.z, def.toggleId);
        // une porte haute de deux blocs s'ouvre en entier
        for (const dy of [1, -1]) {
          const o = this.world.getBlock(h.x, h.y + dy, h.z);
          if (o > 0 && BLOCKS[o].toggleId !== undefined && BLOCKS[o].baseId === def.baseId && BLOCKS[o].rot === def.rot) {
            this.world.setBlock(h.x, h.y + dy, h.z, BLOCKS[o].toggleId!);
          }
        }
        this.audio.sfx('door', 0.8);
        this.hand.swing();
        return true;
      }
      if (def.special === 'altar' && !this.player.crouching) {
        this.onAltar?.(h.x, h.y, h.z);
        return true;
      }
    }
    if (it?.type === 'block' && h) return this.place(h, it.block!, creative);
    if (this.onUse?.(this.inv)) return true;
    return false;
  }

  private place(h: RayHit, base: number, creative: boolean): boolean {
    const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
    const cur = this.world.getBlock(x, y, z);
    const curDef = BLOCKS[Math.max(0, cur)];
    if (cur < 0 || (cur !== 0 && !curDef.liquid)) return false;
    const def = BLOCKS[base];
    let id = base;
    if (def.placeByFace) {
      if (h.ny !== 0) { this.ui.toast('L’échelle se pose contre un mur.'); return false; }
      // la direction du mur est l'opposé de la normale
      const rot = h.nz > 0 ? 0 : h.nx > 0 ? 1 : h.nz < 0 ? 2 : 3;
      id = def.variants![rot];
    } else if (def.variants) id = def.variants[this.facing()];
    // pas dans le joueur
    const nd = BLOCKS[id];
    if (nd.solid) {
      const b = this.player.body;
      for (const bx of nd.boxes) {
        if (b.x - b.hw < x + bx[3] && b.x + b.hw > x + bx[0] && b.y < y + bx[4] && b.y + b.h > y + bx[1] && b.z - b.hw < z + bx[5] && b.z + b.hw > z + bx[2]) return false;
      }
    }
    if (def.placeTall) {
      const above = this.world.getBlock(x, y + 1, z);
      if (above !== 0) return false;
      this.world.setBlock(x, y + 1, z, id);
    }
    if (def.climb && h.ny === 0) { /* échelle : accrochée au mur */ }
    this.world.setBlock(x, y, z, id);
    this.audio.sfx('place', 0.8);
    this.hand.swing();
    if (!creative) this.inv.consumeHeld();
    return true;
  }

  breakBlock(h: RayHit, creative: boolean, behind = true) {
    const def = BLOCKS[h.id];
    const { harvest } = this.breakTime(def);
    this.world.setBlock(h.x, h.y, h.z, B.air);
    this.fx.blockBreak(h.x, h.y, h.z, h.id, 18);
    this.audio.sfx('break', 1, surfaceOf(def));
    this.hand.swing();
    this.onBlockBroken?.(h.x, h.y, h.z, h.id);
    if (!creative) this.dropFor(def, h.x, h.y, h.z, harvest);
    // porte : retire l'autre moitié
    if (def.placeTall || def.toggleId !== undefined) {
      for (const dy of [1, -1]) {
        const o = this.world.getBlock(h.x, h.y + dy, h.z);
        if (o > 0 && BLOCKS[o].baseId === def.baseId && BLOCKS[o].toggleId !== undefined) this.world.setBlock(h.x, h.y + dy, h.z, B.air);
      }
    }
    // pioche racine : extrait aussi le bloc situé derrière
    const held = this.inv.held;
    if (behind && held && ITEMS[held.id].kind === 'racine' && !creative) {
      const bx = h.x - h.nx, by = h.y - h.ny, bz = h.z - h.nz;
      const id = this.world.getBlock(bx, by, bz);
      if (id > 0 && SOLID[id] && BLOCKS[id].hardness < 50) {
        const d2 = BLOCKS[id];
        const { harvest: hv } = this.breakTime(d2);
        if (hv) {
          this.world.setBlock(bx, by, bz, B.air);
          this.fx.blockBreak(bx, by, bz, id, 8);
          this.dropFor(d2, bx, by, bz, true);
        }
      }
    }
  }

  private dropFor(def: BlockDef, x: number, y: number, z: number, harvest: boolean) {
    let drop = def.drop;
    if (!harvest) drop = null;
    if (def.name === 'leaves' && Math.random() < 0.07) drop = 'food_pomme';
    if (drop) this.fx.spawnDrop(drop, 1, x + 0.5, y + 0.4, z + 0.5);
  }
}
