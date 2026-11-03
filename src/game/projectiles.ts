import * as THREE from 'three';
import type { World } from '../world/world';
import type { Effects } from './effects';
import { SOLID } from '../data/blocks';
import { VectorMob, type Mob, type MobCtx, type Op, type Mobs } from './mobs';

export interface Proj {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  age: number;
  dmg: number;
  r: number;
  grav: number;
  pierce: boolean;
  hit: Set<number>;
  kind: string;
  op: Op;
  team: 'player' | 'enemy';
  mesh: THREE.Object3D;
  onUpdate?: (p: Proj, dt: number, ctx: MobCtx) => void;
  /** Renvoie vrai pour supprimer le projectile. */
  onHit?: (p: Proj, m: Mob, ctx: MobCtx) => boolean | void;
  vecAdd: number;
  knock: number;
  bounce: boolean;
  dead: boolean;
  spin: number;
  data: Record<string, number>;
  color: number;
  trail: number;
  noBlock?: boolean;
}

const mats = new Map<number, THREE.MeshBasicMaterial>();
const mat = (c: number) => { let m = mats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); } return m; };

export function projMesh(kind: string, color: number, size = 1): THREE.Object3D {
  const g = new THREE.Group();
  const m = mat(color);
  const white = mat(0xffffff);
  const add = (geo: THREE.BufferGeometry, mm = m) => { const x = new THREE.Mesh(geo, mm); g.add(x); return x; };
  switch (kind) {
    case 'triangle': { const c = add(new THREE.ConeGeometry(0.26, 0.6, 3)); c.rotation.x = Math.PI / 2; break; }
    case 'equerre': {
      const a = add(new THREE.BoxGeometry(0.55, 0.1, 0.12)); a.position.set(0.2, 0, 0);
      const b = add(new THREE.BoxGeometry(0.12, 0.1, 0.55)); b.position.set(-0.04, 0, 0.2);
      break;
    }
    case 'ovale': { const s = add(new THREE.SphereGeometry(0.22, 8, 6)); s.scale.set(1.5, 0.8, 1); break; }
    case 'losange': { const s = add(new THREE.OctahedronGeometry(0.24)); s.scale.set(0.8, 1.3, 0.8); break; }
    case 'plus': {
      add(new THREE.BoxGeometry(0.5, 0.14, 0.14)); add(new THREE.BoxGeometry(0.14, 0.5, 0.14)); add(new THREE.BoxGeometry(0.14, 0.14, 0.5));
      break;
    }
    case 'hexagone': { const s = add(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 6)); s.rotation.x = Math.PI / 2; break; }
    case 'disque': { const s = add(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 14)); add(new THREE.BoxGeometry(0.1, 0.09, 0.8), white); void s; break; }
    case 'enemy': { add(new THREE.OctahedronGeometry(0.3)); break; }
    default: { add(new THREE.BoxGeometry(0.2, 0.2, 0.5)); const c = add(new THREE.BoxGeometry(0.1, 0.1, 0.3), white); c.position.z = 0.1; }
  }
  g.scale.setScalar(size);
  return g;
}

export class Projectiles {
  list: Proj[] = [];
  constructor(private scene: THREE.Scene, private world: World, private fx: Effects) {}

  spawn(o: Partial<Proj> & { pos: THREE.Vector3; vel: THREE.Vector3; kind: string; dmg: number }, size = 1): Proj {
    const color = o.color ?? 0x9ae6ff;
    const p: Proj = {
      life: 3, age: 0, r: 0.3, grav: 0, pierce: false, hit: new Set(), op: '', team: 'player',
      mesh: o.mesh ?? projMesh(o.kind, color, size), vecAdd: 0, knock: 3, bounce: false, dead: false, spin: 0, data: {}, color, trail: 0,
      ...o,
    } as Proj;
    p.mesh.position.copy(p.pos);
    this.scene.add(p.mesh);
    this.list.push(p);
    return p;
  }

  clear() { for (const p of this.list) this.scene.remove(p.mesh); this.list.length = 0; }

  update(dt: number, ctx: MobCtx, mobs: Mobs) {
    for (const p of this.list) {
      if (p.dead) continue;
      p.age += dt;
      p.life -= dt;
      p.onUpdate?.(p, dt, ctx);
      if (p.dead) continue;
      p.vel.y -= p.grav * dt;
      const sp = p.vel.length() * dt;
      const steps = Math.max(1, Math.ceil(sp / 0.35));
      const dx = (p.vel.x * dt) / steps, dy = (p.vel.y * dt) / steps, dz = (p.vel.z * dt) / steps;
      for (let s = 0; s < steps && !p.dead; s++) {
        const nx = p.pos.x + dx, ny = p.pos.y + dy, nz = p.pos.z + dz;
        const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (!p.noBlock && (id < 0 || (id > 0 && SOLID[id]))) {
          if (p.bounce) {
            // rebond simple sur l'axe le plus proche
            const bx = this.world.getBlock(Math.floor(nx), Math.floor(p.pos.y), Math.floor(p.pos.z));
            const bz = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(nz));
            if (bx > 0 && SOLID[bx]) p.vel.x *= -0.7;
            else if (bz > 0 && SOLID[bz]) p.vel.z *= -0.7;
            else { p.vel.y = Math.abs(p.vel.y) * 0.6; if (p.vel.y < 1) p.vel.y = 0; p.vel.x *= 0.92; p.vel.z *= 0.92; }
            break;
          }
          this.fx.burst(p.pos.x, p.pos.y, p.pos.z, [(p.color >> 16) & 255, (p.color >> 8) & 255, p.color & 255], 5, 2.5, 0.35, 0.07);
          p.dead = true;
          break;
        }
        p.pos.set(nx, ny, nz);
        this.collide(p, ctx, mobs);
      }
      if (p.life <= 0) p.dead = true;
      p.trail -= dt;
      if (p.trail <= 0 && !p.dead) {
        p.trail = 0.05;
        this.fx.burst(p.pos.x, p.pos.y, p.pos.z, [(p.color >> 16) & 255, (p.color >> 8) & 255, p.color & 255], 1, 0.3, 0.25, 0.07, 0);
      }
      p.mesh.position.copy(p.pos);
      if (p.spin) p.mesh.rotation.y += p.spin * dt;
      else if (p.vel.lengthSq() > 0.01) p.mesh.lookAt(p.pos.clone().add(p.vel));
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) { this.scene.remove(this.list[i].mesh); this.list.splice(i, 1); }
    }
  }

  private collide(p: Proj, ctx: MobCtx, mobs: Mobs) {
    if (p.team === 'enemy') {
      const pl = ctx.player;
      const c = new THREE.Vector3(pl.body.x, pl.body.y + 0.9, pl.body.z);
      if (!pl.dead && c.distanceTo(p.pos) < p.r + 0.55) {
        ctx.hurtPlayer(p.dmg, p.pos, 0);
        p.dead = true;
      }
      return;
    }
    const c = new THREE.Vector3();
    for (const m of mobs.list) {
      if (m.dead || !m.targetable || p.hit.has(m.id)) continue;
      m.center(c);
      if (c.distanceTo(p.pos) > p.r + Math.max(m.radius, m.height * 0.5)) continue;
      p.hit.add(m.id);
      const knock = p.vel.clone().setY(0).normalize().multiplyScalar(p.knock);
      const info = { op: p.op, knock, src: p.kind, vec: m instanceof VectorMob && p.vecAdd > 0 ? p.vel.clone().normalize().multiplyScalar(p.vecAdd) : undefined };
      let dmg = p.dmg;
      if (p.op === 'x' && m.kind === 'fraction') dmg *= 2;
      m.hurt(dmg, info, ctx);
      const rm = p.onHit?.(p, m, ctx);
      if (rm || !p.pierce) { p.dead = true; return; }
    }
  }
}
