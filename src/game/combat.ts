import * as THREE from 'three';
import type { World } from '../world/world';
import type { Player } from './player';
import type { Input } from './input';
import type { Inventory } from './inventory';
import type { Interaction } from './interaction';
import type { Hand } from '../gfx/hand';
import type { AudioSys } from './audio';
import type { Effects } from './effects';
import type { UI } from '../ui/ui';
import { ITEMS, KIND, MAT, type WeaponKind } from '../data/items';
import { Fraction, type Mob, type Mobs, type MobCtx, type Op } from './mobs';
import type { Proj, Projectiles } from './projectiles';

const UP = new THREE.Vector3(0, 1, 0);

interface Atk {
  dmg: number;
  kd: WeaponKind;
  eye: THREE.Vector3;
  dir: THREE.Vector3;
  flat: THREE.Vector3;
  right: THREE.Vector3;
}

export class Combat {
  cd = 0;
  blocking = false;
  rayon = 4;
  angle = 35;
  private queue: { t: number; fn: () => void }[] = [];
  private dots: { mob: Mob; left: number; tick: number; dmg: number }[] = [];
  private eatCd = 0;
  private healCd = 0;
  /** Mob visé lors de la dernière image (pour le jeu). */
  target: { mob: Mob; dist: number } | null = null;

  constructor(
    private world: World, private player: Player, private input: Input, private inv: Inventory,
    private inter: Interaction, private hand: Hand, private audio: AudioSys, private fx: Effects,
    private mobs: Mobs, private proj: Projectiles, private ui: UI, private ctx: () => MobCtx,
    private heal: (n: number) => void,
  ) {
    inter.onUse = () => this.secondary();
  }

  private held() {
    const s = this.inv.held;
    if (!s) return null;
    const it = ITEMS[s.id];
    return it;
  }

  private weapon(): { kd: WeaponKind; dmg: number } | null {
    const it = this.held();
    if (!it || it.type !== 'weapon') return null;
    const kd = KIND[it.kind!], m = MAT[it.mat!];
    return { kd, dmg: kd.dmg * m.dmg };
  }

  /** Texte d'état de l'arme tenue pour l'interface. */
  info(): string {
    const w = this.weapon();
    if (!w) return '';
    if (w.kd.param === 'rayon') return `Rayon ${this.rayon} · [R] règle`;
    if (w.kd.param === 'angle') {
      const range = (24 * 24 * Math.sin((2 * this.angle * Math.PI) / 180)) / 20;
      return `Angle ${this.angle}° · portée ${range.toFixed(0)} m`;
    }
    if (w.kd.shield) return 'Clic droit : bouclier';
    return '';
  }

  adjust() {
    const w = this.weapon();
    if (!w) return;
    if (w.kd.param === 'rayon') this.rayon = this.rayon >= 6 ? 2 : this.rayon + 1;
    else if (w.kd.param === 'angle') this.angle = this.angle >= 75 ? 15 : this.angle + 10;
    this.audio.sfx('ui');
  }

  update(dt: number, active: boolean, creative: boolean) {
    this.cd -= dt; this.eatCd -= dt; this.healCd -= dt;
    // actions différées
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i].t -= dt;
      if (this.queue[i].t <= 0) { const q = this.queue.splice(i, 1)[0]; q.fn(); }
    }
    // dégâts dans le temps (intégrale)
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      if (d.mob.dead) { this.dots.splice(i, 1); continue; }
      d.left -= dt; d.tick -= dt;
      if (d.tick <= 0) { d.tick = 0.5; d.mob.hurt(d.dmg, { op: '', src: 'integrale', noFloat: false }, this.ctx()); }
      if (d.left <= 0) this.dots.splice(i, 1);
    }
    const w = this.weapon();
    if (active && this.input.wasPressed('adjust')) this.adjust();

    // visée
    const eye = this.player.eyePos();
    const dir = this.player.lookDir();
    const maxR = w?.kd.ranged ? 30 : Math.max(3, w?.kd.reach ?? 2.6);
    const tgt = active ? this.mobs.raycast(eye, dir, Math.min(maxR, 30)) : null;
    this.target = tgt;
    const blockDist = this.inter.hit ? this.inter.hit.dist : Infinity;
    const byEntity = !!tgt && tgt.dist < blockDist;
    this.inter.ctx.blockedByEntity = byEntity;

    // bouclier
    this.blocking = !!(active && w?.kd.shield && this.input.mouse[2]);
    this.hand.shield = this.blocking;

    // attaque principale
    if (active && (this.input.mousePressed[0] || (this.input.mouse[0] && this.cd <= 0)) && (byEntity || !this.inter.hit) && this.cd <= 0) {
      this.primary(creative);
    }
  }

  // ---------------------------------------------------------- helpers
  private atk(w: { kd: WeaponKind; dmg: number } | null): Atk {
    const eye = this.player.eyePos();
    const dir = this.player.lookDir();
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-4) flat.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    flat.normalize();
    const right = new THREE.Vector3().crossVectors(flat, UP).normalize();
    const kd = w?.kd ?? KIND.droite;
    return { dmg: w?.dmg ?? 1, kd, eye, dir, flat, right };
  }

  private hit(m: Mob, dmg: number, op: Op, a: Atk, knock = 5, vecAdd?: number) {
    if (op === 'x' && m.kind === 'fraction') dmg *= 2;
    const k = a.flat.clone().multiplyScalar(knock);
    k.y = 3;
    m.hurt(dmg, { op, knock: k, src: a.kd.id, vec: vecAdd ? a.dir.clone().multiplyScalar(vecAdd) : undefined }, this.ctx());
  }

  private blockLimit(a: Atk, reach: number): number {
    const h = this.world.raycast(a.eye.x, a.eye.y, a.eye.z, a.dir.x, a.dir.y, a.dir.z, reach);
    return h ? h.dist : reach;
  }

  private ray(a: Atk, reach: number, origin = a.eye): { mob: Mob; dist: number } | null {
    const lim = this.blockLimit(a, reach);
    return this.mobs.raycast(origin, a.dir, lim);
  }

  private lineMobs(a: Atk, len: number, width: number, origin = a.eye): Mob[] {
    const out: Mob[] = [];
    const c = new THREE.Vector3();
    for (const m of this.mobs.list) {
      if (m.dead || !m.targetable) continue;
      m.center(c);
      const oc = c.clone().sub(origin);
      const t = oc.dot(a.dir);
      if (t < 0 || t > len) continue;
      const d = oc.sub(a.dir.clone().multiplyScalar(t)).length();
      if (d < width + Math.max(m.radius, m.height * 0.4)) out.push(m);
    }
    return out;
  }

  private rot(v: THREE.Vector3, yaw: number, pitch = 0): THREE.Vector3 {
    const r = v.clone();
    if (pitch) {
      const ax = new THREE.Vector3().crossVectors(r, UP).normalize();
      if (ax.lengthSq() > 0.001) r.applyAxisAngle(ax, pitch);
    }
    return r.applyAxisAngle(UP, yaw);
  }

  private later(t: number, fn: () => void) { this.queue.push({ t, fn }); }

  private shoot(a: Atk, kind: string, dir: THREE.Vector3, speed: number, o: Partial<Proj> = {}): Proj {
    const start = a.eye.clone().addScaledVector(dir, 0.6).addScaledVector(a.right, 0.0);
    start.y -= 0.15;
    return this.proj.spawn({
      pos: start, vel: dir.clone().multiplyScalar(speed), kind, dmg: a.dmg, life: 2.5, ...o,
    });
  }

  // ------------------------------------------------------------ attaques
  primary(creative = false) {
    const w = this.weapon();
    const a = this.atk(w);
    const kd = a.kd;
    if (!w) {
      // à mains nues
      this.cd = 0.35;
      this.hand.swing();
      this.audio.sfx('swing', 0.6);
      const m = this.ray(a, 2.6);
      if (m) this.hit(m.mob, 1, '', a, 3);
      return;
    }
    this.cd = kd.cd;
    this.hand.swing();
    this.audio.sfx(kd.ranged ? 'shoot' : 'swing', 0.8);
    void creative;
    const c = this.ctx();
    switch (kd.id) {
      case 'droite': case 'racine': case 'rectangle': {
        const m = this.ray(a, kd.reach);
        if (m) this.hit(m.mob, a.dmg, '', a);
        break;
      }
      case 'segment': {
        for (let i = 0; i < 3; i++) this.later(i * 0.09, () => {
          const aa = this.atk(w);
          const m = this.ray(aa, kd.reach);
          this.hand.swing();
          this.audio.sfx('swing', 0.5);
          if (m) this.hit(m.mob, aa.dmg, '', aa, 2);
        });
        this.cd = kd.cd;
        break;
      }
      case 'demidroite': {
        const len = this.blockLimit(a, kd.reach);
        const end = a.eye.clone().addScaledVector(a.dir, len);
        const start = a.eye.clone().addScaledVector(a.dir, 0.8).add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(a.right, 0.25);
        this.fx.beam(start, end, 0xfff3a0, 0.1, 0.22);
        for (const m of this.lineMobs(a, len, 0.45)) this.hit(m, a.dmg, '', a, 4);
        break;
      }
      case 'mediatrice': {
        const m = this.ray(a, kd.reach);
        if (m) {
          const cc = m.mob.center();
          this.hit(m.mob, a.dmg, '', a);
          // plan médiateur : trait perpendiculaire à la visée au milieu de la cible
          const p1 = cc.clone().addScaledVector(a.right, 2.2), p2 = cc.clone().addScaledVector(a.right, -2.2);
          this.fx.beam(p1, p2, 0xff7bf0, 0.12, 0.3);
          this.fx.beam(cc.clone().add(new THREE.Vector3(0, -1.2, 0)), cc.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xff7bf0, 0.1, 0.3);
          this.fx.burst(cc.x, cc.y, cc.z, [255, 120, 240], 14, 4, 0.5);
          for (const o of this.mobs.within(cc, 3.2, (x) => x !== m.mob)) this.hit(o, a.dmg * 0.6, '', a, 4);
          this.audio.sfx('split', 0.9);
        }
        break;
      }
      case 'mediane': this.mediane(a); break;
      case 'bissectrice': {
        const p = this.shoot(a, 'default', a.dir, 19, { color: 0x7fe3ff, r: 0.35 });
        p.onUpdate = (pp) => {
          if (pp.age < 0.22 || pp.data.split) return;
          pp.data.split = 1;
          const v = pp.vel.clone().normalize();
          for (const s of [-1, 1]) {
            this.proj.spawn({ pos: pp.pos.clone(), vel: this.rot(v, s * 0.38).multiplyScalar(19), kind: 'default', dmg: a.dmg, life: 1.6, color: 0x7fe3ff, r: 0.33 });
          }
          this.audio.sfx('split', 0.6);
          pp.dead = true;
        };
        break;
      }
      case 'equerre': this.boomerang(a); break;
      case 'compas': {
        const r = this.rayon;
        const p = this.player.body;
        this.fx.ring(p.x, p.y + 0.15, p.z, r, 0x7fd0ff, 0.5);
        for (let i = 0; i < 28; i++) {
          const ang = (i / 28) * Math.PI * 2;
          this.fx.burst(p.x + Math.cos(ang) * r, p.y + 0.3, p.z + Math.sin(ang) * r, [120, 210, 255], 1, 1, 0.6, 0.1, 1);
        }
        for (const m of this.mobs.within(new THREE.Vector3(p.x, p.y + 0.9, p.z), r, (x) => Math.abs(x.pos.y - p.y) < 3.5)) {
          const dirv = m.pos.clone().sub(this.player.pos).setY(0).normalize();
          m.hurt(a.dmg, { op: '', knock: dirv.multiplyScalar(5), src: 'compas' }, c);
        }
        this.audio.sfx('boom', 0.5);
        break;
      }
      case 'rapporteur': {
        const th = (this.angle * Math.PI) / 180, v = 24;
        const vel = new THREE.Vector3(a.flat.x * Math.cos(th) * v, Math.sin(th) * v, a.flat.z * Math.cos(th) * v);
        this.shoot(a, 'default', vel.clone().normalize(), v, { grav: 20, life: 5, color: 0xe6c27a, dmg: a.dmg * 1.2, r: 0.35 });
        break;
      }
      case 'plus': {
        this.shoot(a, 'plus', a.dir, 20, { op: '+', vecAdd: 5, color: 0x6dff8a, r: 0.4, spin: 6, life: 2 });
        break;
      }
      case 'multiplication': {
        const c0 = this.player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        for (const k2 of [1, 3, 5, 7]) {
          const d = this.rot(a.flat, (k2 * Math.PI) / 4);
          this.fx.beam(c0.clone().addScaledVector(d, 0.6), c0.clone().addScaledVector(d, kd.reach), 0xff6b6b, 0.14, 0.25);
          const seen = new Set<number>();
          for (const m of this.mobs.list) {
            if (m.dead || !m.targetable || seen.has(m.id)) continue;
            const v = m.center().sub(c0);
            const dist = v.length();
            if (dist > kd.reach + m.radius) continue;
            v.y = 0; v.normalize();
            if (v.dot(d) > 0.9) { seen.add(m.id); this.hit(m, a.dmg, 'x', a, 4); }
          }
        }
        this.fx.burst(c0.x, c0.y, c0.z, [255, 100, 100], 12, 4, 0.5);
        break;
      }
      case 'division': {
        const m = this.ray(a, kd.reach);
        if (m) this.hit(m.mob, a.dmg, '/', a);
        break;
      }
      case 'moins': {
        const m = this.ray(a, kd.reach);
        if (m) this.hit(m.mob, a.dmg, '-', a, 3);
        break;
      }
      case 'egal': case 'carre': {
        const m = this.ray(a, kd.reach);
        if (m) this.hit(m.mob, a.dmg, '', a, 9);
        break;
      }
      case 'pi': {
        const n = 3;
        for (let i = 0; i < n; i++) {
          const p = this.proj.spawn({
            pos: this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)), vel: new THREE.Vector3(), kind: 'disque', dmg: a.dmg, life: 5.2, pierce: true,
            color: 0xffd36b, noBlock: true, r: 0.6, spin: 9, knock: 3,
          });
          const phase = (i / n) * Math.PI * 2;
          p.onUpdate = (pp, dt) => {
            const pl = this.player.body;
            const ang = phase + pp.age * 5.5;
            pp.pos.set(pl.x + Math.cos(ang) * 2.5, pl.y + 1 + Math.sin(pp.age * 3 + phase) * 0.3, pl.z + Math.sin(ang) * 2.5);
            pp.vel.set(0, 0, 0);
            pp.data.t = (pp.data.t ?? 0) + dt;
            if (pp.data.t > 0.4) { pp.data.t = 0; pp.hit.clear(); }
            pp.mesh.rotation.x = Math.PI / 2;
          };
        }
        this.audio.sfx('bell', 0.4);
        break;
      }
      case 'paralleles': {
        const a0 = a.eye.clone();
        for (const s of [-0.75, 0.75]) {
          const o = a0.clone().addScaledVector(a.right, s);
          const lim = this.blockLimit({ ...a, eye: o }, kd.reach);
          const m = this.mobs.raycast(o, a.dir, lim, 0.2);
          this.fx.beam(o.clone().addScaledVector(a.dir, 0.8).add(new THREE.Vector3(0, -0.3, 0)), o.clone().addScaledVector(a.dir, Math.min(lim, kd.reach)).add(new THREE.Vector3(0, -0.3, 0)), 0xf0f0ff, 0.08, 0.16);
          if (m) this.hit(m.mob, a.dmg, '', a, 4);
        }
        break;
      }
      case 'perpendiculaire': {
        const m = this.ray(a, kd.reach);
        const o = a.eye.clone().addScaledVector(a.dir, Math.min(kd.reach - 0.5, m ? m.dist : kd.reach * 0.7));
        this.fx.beam(o.clone().addScaledVector(a.right, -1.3), o.clone().addScaledVector(a.right, 1.3), 0xffa94d, 0.12, 0.25);
        this.fx.beam(a.eye.clone().add(new THREE.Vector3(0, -0.3, 0)), o, 0xffa94d, 0.08, 0.2);
        if (m) {
          const kn = a.right.clone().multiplyScalar(10);
          kn.y = 3;
          m.mob.hurt(a.dmg, { op: '', knock: kn, src: 'perpendiculaire' }, c);
        }
        break;
      }
      case 'triangle': this.shoot(a, 'triangle', a.dir, 25, { pierce: true, color: 0xffa347, life: 1.1, r: 0.4 }); break;
      case 'ovale': {
        const v = a.dir.clone().multiplyScalar(14);
        v.y = Math.max(v.y, 2);
        const p = this.proj.spawn({ pos: a.eye.clone().addScaledVector(a.dir, 0.6), vel: v, kind: 'ovale', dmg: a.dmg, life: 3.6, grav: 16, bounce: true, pierce: true, color: 0x4fe0c0, r: 0.5 });
        p.onUpdate = (pp, dt) => {
          pp.data.t = (pp.data.t ?? 0) + dt;
          if (pp.data.t > 0.5) { pp.data.t = 0; pp.hit.clear(); }
        };
        break;
      }
      case 'losange': {
        for (const [y, p] of [[-0.14, 0], [0.14, 0], [0, 0.14], [0, -0.14]]) {
          this.shoot(a, 'losange', this.rot(a.dir, y, p), 22, { color: 0xff7bd0, life: 1.4, r: 0.35 });
        }
        break;
      }
      case 'trapeze': {
        const arc = Math.cos((65 * Math.PI) / 180);
        const c0 = this.player.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
        for (let i = -4; i <= 4; i++) {
          const d = this.rot(a.flat, (i / 4) * 1.1);
          this.fx.burst(c0.x + d.x * 2.4, c0.y - 0.2, c0.z + d.z * 2.4, [255, 230, 120], 2, 1.5, 0.35, 0.1, 0.5);
        }
        for (const m of this.mobs.list) {
          if (m.dead || !m.targetable) continue;
          const v = m.center().sub(c0);
          if (v.length() > kd.reach + m.radius) continue;
          v.y = 0;
          if (v.normalize().dot(a.flat) > arc) this.hit(m, a.dmg, '', a, 5);
        }
        break;
      }
      case 'hexagone': {
        const p0 = this.player.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        for (let i = 0; i < 6; i++) {
          const d = this.rot(a.flat, (i * Math.PI) / 3);
          this.proj.spawn({ pos: p0.clone().addScaledVector(d, 0.8), vel: d.multiplyScalar(16), kind: 'hexagone', dmg: a.dmg, life: 1.3, color: 0x8ef08a, r: 0.4, spin: 0 });
        }
        break;
      }
      case 'sinus': {
        const base = a.dir.clone();
        const right = a.right.clone();
        const p = this.shoot(a, 'default', base, 15, { color: 0xffe14a, life: 2.2, r: 0.4 });
        p.onUpdate = (pp) => { pp.vel.copy(base).multiplyScalar(15).addScaledVector(right, Math.cos(pp.age * 10) * 7).addScaledVector(UP, Math.sin(pp.age * 5) * 0.5); };
        break;
      }
      case 'integrale': {
        const m = this.ray(a, kd.reach);
        if (m) {
          this.dots.push({ mob: m.mob, left: 4, tick: 0.5, dmg: a.dmg / 8 });
          const cc = m.mob.center();
          this.fx.text('∫', cc.x, cc.y + m.mob.height + 0.4, cc.z, '#ffd6ff', true);
          this.fx.beam(a.eye.clone().add(new THREE.Vector3(0, -0.3, 0)), cc, 0xd8a8ff, 0.1, 0.25);
          this.audio.sfx('bell', 0.4);
        }
        break;
      }
      default: {
        const m = this.ray(a, kd.reach);
        if (m) this.hit(m.mob, a.dmg, '', a);
      }
    }
  }

  private mediane(a: Atk) {
    const c = this.ctx();
    const cand = this.mobs.list
      .filter((m) => !m.dead && m.targetable && m.center().sub(a.eye).normalize().dot(a.dir) > 0.15 && m.center().distanceTo(a.eye) < 20)
      .sort((p, q) => p.center().distanceTo(a.eye) - q.center().distanceTo(a.eye));
    if (cand.length >= 3) {
      const [A, Bm, Cm] = cand;
      const pa = A.center(), pb = Bm.center(), pc = Cm.center();
      const mid = pb.clone().add(pc).multiplyScalar(0.5);
      this.fx.beam(pa, pb, 0x7fe3ff, 0.08, 0.5);
      this.fx.beam(pb, pc, 0x7fe3ff, 0.08, 0.5);
      this.fx.beam(pc, pa, 0x7fe3ff, 0.08, 0.5);
      this.fx.beam(pa, mid, 0xffffff, 0.16, 0.4);
      this.fx.ring(mid.x, mid.y, mid.z, 0.8, 0xffffff, 0.4);
      const ax = mid.clone().sub(pa);
      const len = ax.length();
      ax.normalize();
      for (const m of this.mobs.list) {
        if (m.dead || !m.targetable) continue;
        const oc = m.center().sub(pa);
        const t = oc.dot(ax);
        if (t < -0.5 || t > len + 0.5) continue;
        if (oc.sub(ax.clone().multiplyScalar(t)).length() < 1.4 + m.radius) m.hurt(a.dmg, { op: '', src: 'mediane', knock: ax.clone().multiplyScalar(3) }, c);
      }
      for (const m of [A, Bm, Cm]) if (!m.dead) m.hurt(a.dmg * 0.3, { op: '', src: 'mediane', noFloat: true }, c);
      this.audio.sfx('bell', 0.5);
    } else {
      this.shoot(a, 'default', a.dir, 24, { color: 0x7fe3ff, life: 1.4, r: 0.45, dmg: a.dmg });
    }
  }

  private boomerang(a: Atk) {
    const flat = a.dir.clone();
    const right = a.right.clone();
    const p = this.shoot(a, 'equerre', flat, 17, { pierce: true, vecAdd: 5, color: 0xd8c47a, life: 5, r: 0.55, spin: 14, noBlock: false });
    p.data.phase = 0;
    p.data.d = 0;
    p.onUpdate = (pp, dt) => {
      const sp = 17;
      const ph = pp.data.phase;
      pp.data.d += sp * dt;
      if (ph === 0 && pp.data.d > 9) { pp.data.phase = 1; pp.data.d = 0; pp.hit.clear(); pp.vel.copy(right).multiplyScalar(sp); this.audio.sfx('bell', 0.3); }
      else if (ph === 1 && pp.data.d > 5) { pp.data.phase = 2; pp.hit.clear(); }
      if (pp.data.phase === 2) {
        const pl = this.player.body;
        const to = new THREE.Vector3(pl.x, pl.y + 1.1, pl.z).sub(pp.pos);
        const dist = to.length();
        pp.vel.copy(to.normalize().multiplyScalar(sp + 4));
        pp.noBlock = true;
        if (dist < 1.2) { pp.dead = true; this.audio.sfx('pickup', 0.5); }
      }
      pp.mesh.rotation.x = 0;
      pp.mesh.rotation.y += 0;
    };
  }

  // ------------------------------------------------------ clic droit
  secondary(): boolean {
    const it = this.held();
    if (!it) return false;
    if (it.type === 'food') {
      if (this.eatCd > 0) return true;
      if (this.player.health >= this.player.maxHealth) { this.ui.toast('Vous n’avez pas faim, vos cœurs sont pleins.'); return true; }
      this.eatCd = 0.8;
      this.heal(it.heal ?? 4);
      this.audio.sfx('heal', 0.7);
      this.inv.consumeHeld();
      this.hand.use();
      return true;
    }
    const w = this.weapon();
    if (!w) return false;
    if (w.kd.id === 'plus') {
      if (this.healCd > 0) return true;
      this.healCd = 1.6;
      const amt = Math.round(2 + w.dmg * 0.6);
      this.heal(amt);
      this.audio.sfx('heal', 0.8);
      this.hand.use();
      const p = this.player.pos;
      this.fx.burst(p.x, p.y + 1, p.z, [120, 255, 140], 16, 2, 0.8, 0.1, 3);
      this.fx.text(`+${amt}`, p.x, p.y + 2.2, p.z, '#7dff9a', true);
      return true;
    }
    if (w.kd.shield) return true;
    if (w.kd.ranged && this.cd <= 0) { this.primary(); return true; }
    return false;
  }

  /** Réduit les dégâts reçus si le bouclier est levé. Renvoie le montant final. */
  mitigate(amount: number, from?: THREE.Vector3): number {
    const w = this.weapon();
    if (!this.blocking || !w) return amount;
    if (w.kd.id === 'egal') {
      const rest = amount * 0.5;
      if (from) {
        const near = this.mobs.within(from, 4)[0];
        if (near) near.hurt(amount * 0.5 * (1 + w.dmg / 20), { op: '', src: 'egal', knock: new THREE.Vector3(0, 3, 0).add(near.pos.clone().sub(this.player.pos).setY(0).normalize().multiplyScalar(5)) }, this.ctx());
      }
      this.fx.text('=', this.player.body.x, this.player.body.y + 1.8, this.player.body.z, '#fff', true);
      this.audio.sfx('bell', 0.5);
      return rest;
    }
    this.audio.sfx('hit', 0.5);
    return amount * 0.25;
  }

  hasFraction(): boolean { return this.mobs.list.some((m) => m instanceof Fraction); }
}
