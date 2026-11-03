import * as THREE from 'three';
import type { World } from '../world/world';
import type { Player } from './player';
import type { Inventory } from './inventory';
import type { AudioSys } from './audio';
import { buildAtlas } from '../gfx/textures';
import { BLOCKS, FACE_TILE } from '../data/blocks';
import { itemModel } from '../gfx/itemModel';
import { litMaterial } from '../gfx/lighting';
import { moveBody, type Body } from './physics';
import { ITEMS } from '../data/items';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number }
export interface Drop {
  id: string; n: number; body: Body; mesh: THREE.Mesh; age: number; delay: number; spin: number; scale: number;
}

export class Effects {
  private pm: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private readonly MAX = 700;
  drops: Drop[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(private scene: THREE.Scene, private world: World, private audio: AudioSys) {
    const mat = litMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.MAX);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX * 3), 3);
    this.pm.frustumCulled = false;
    this.pm.count = 0;
    scene.add(this.pm);
  }

  burst(x: number, y: number, z: number, c: [number, number, number], count: number, speed = 3, life = 0.7, size = 0.1, up = 2) {
    for (let i = 0; i < count && this.parts.length < this.MAX; i++) {
      const v = 0.4 + Math.random();
      this.parts.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * speed * v, vy: Math.random() * speed * v * 0.8 + up * Math.random(), vz: (Math.random() - 0.5) * speed * v,
        life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8),
        r: c[0] / 255, g: c[1] / 255, b: c[2] / 255,
      });
    }
  }

  blockBreak(x: number, y: number, z: number, id: number, count = 16) {
    const avg = buildAtlas().avg[FACE_TILE[id * 6 + 0]];
    this.burst(x + 0.5, y + 0.5, z + 0.5, avg, count, 4, 0.8, 0.11, 2.5);
  }

  spawnDrop(id: string, n: number, x: number, y: number, z: number, vx = (Math.random() - 0.5) * 2.5, vy = 3 + Math.random() * 1.5, vz = (Math.random() - 0.5) * 2.5) {
    if (!ITEMS[id]) return;
    const mesh = itemModel(id);
    const isBlock = ITEMS[id].type === 'block';
    const scale = isBlock ? 0.28 : 0.5;
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.drops.push({
      id, n, mesh, age: 0, delay: 0.6, spin: Math.random() * 6, scale,
      body: { x, y, z, vx, vy, vz, hw: 0.15, h: 0.3, onGround: false, hitX: false, hitZ: false },
    });
  }

  update(dt: number, player: Player, inv: Inventory, creative: boolean) {
    // particules
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (this.world.collides(p.x - 0.03, p.y - 0.03, p.z - 0.03, p.x + 0.03, p.y + 0.03, p.z + 0.03)) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.y += 0.04; }
    }
    for (const p of this.parts) {
      const s = p.size * Math.min(1, p.life / (p.max * 0.4));
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.pm.setMatrixAt(n, this.dummy.matrix);
      this.pm.setColorAt(n, this.col.setRGB(p.r, p.g, p.b));
      n++;
    }
    this.pm.count = n;
    this.pm.instanceMatrix.needsUpdate = true;
    if (this.pm.instanceColor) this.pm.instanceColor.needsUpdate = true;

    // objets au sol
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt; d.delay -= dt;
      const b = d.body;
      const dx = player.body.x - b.x, dy = player.body.y + 0.9 - b.y, dz = player.body.z - b.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.delay <= 0 && dist < 3.2 && inv.canFit(d.id, d.n)) {
        const sp = 9;
        const k = Math.min(1, 9 * dt);
        b.vx += ((dx / dist) * sp - b.vx) * k;
        b.vy += ((dy / dist) * sp - b.vy) * k;
        b.vz += ((dz / dist) * sp - b.vz) * k;
      } else {
        b.vy -= 22 * dt;
        if (b.onGround) { b.vx *= 0.8; b.vz *= 0.8; }
      }
      moveBody(this.world, b, dt, 0);
      if (d.delay <= 0 && dist < 1.1 && inv.canFit(d.id, d.n)) {
        inv.add(d.id, d.n);
        this.audio.sfx('pickup', 0.6);
        this.remove(i);
        continue;
      }
      if (d.age > 300 || b.y < -10) { this.remove(i); continue; }
      d.mesh.position.set(b.x, b.y + 0.2 + Math.sin(d.age * 3 + d.spin) * 0.05, b.z);
      d.mesh.rotation.y = d.age * 1.6 + d.spin;
    }
    void creative;
  }

  private remove(i: number) {
    const d = this.drops[i];
    this.scene.remove(d.mesh);
    this.drops.splice(i, 1);
  }

  clearDrops() { for (let i = this.drops.length - 1; i >= 0; i--) this.remove(i); }
}

export { BLOCKS };
