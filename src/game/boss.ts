import * as THREE from 'three';
import { newId, Fraction, VectorMob, randomFraction, type Mob, type MobCtx, type HitInfo } from './mobs';
import type { Projectiles } from './projectiles';

interface Phase {
  title: string;
  tokens: { t: string; sup?: boolean }[];
  sub: string;
  roots: { v: number; label: string }[];
  color: string;
}

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const R1 = (-3 + Math.sqrt(17)) / 2, R2 = (-3 - Math.sqrt(17)) / 2;

export const PHASES: Phase[] = [
  {
    title: 'Phase 1 : équation du second degré',
    tokens: [{ t: 'x' }, { t: '2', sup: true }, { t: ' + 3x - 2 = 0' }],
    sub: 'Δ = 3² - 4×1×(-2) = 17 > 0 : deux racines',
    roots: [{ v: R1, label: `x1 = ${f2(R1)}` }, { v: R2, label: `x2 = ${f2(R2)}` }],
    color: '#e86bff',
  },
  {
    title: 'Phase 2 : polynôme de degré 3',
    tokens: [{ t: 'x' }, { t: '3', sup: true }, { t: ' - 6x' }, { t: '2', sup: true }, { t: ' + 11x - 6 = 0' }],
    sub: '(x-1)(x-2)(x-3) = 0 : trois racines entières',
    roots: [{ v: 1, label: 'x1 = 1' }, { v: 2, label: 'x2 = 2' }, { v: 3, label: 'x3 = 3' }],
    color: '#6bd5ff',
  },
  {
    title: 'Phase 3 : équation bicarrée',
    tokens: [{ t: 'x' }, { t: '4', sup: true }, { t: ' - 10x' }, { t: '2', sup: true }, { t: ' + 9 = 0' }],
    sub: 'Posons X = x² : X = 1 ou X = 9, soit quatre racines',
    roots: [{ v: -3, label: 'x1 = -3' }, { v: -1, label: 'x2 = -1' }, { v: 1, label: 'x3 = 1' }, { v: 3, label: 'x4 = 3' }],
    color: '#ffd23f',
  },
];

const UNIT = 2; // 1 unité de la droite réelle = 2 blocs

function panelTexture(ph: Phase, num: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(12,6,28,0.82)'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = ph.color; g.lineWidth = 10; g.strokeRect(5, 5, 1014, 246);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(16, 16, 992, 224);
  g.textBaseline = 'alphabetic';
  // largeur totale
  const big = '56px "Press Start 2P", monospace', small = '32px "Press Start 2P", monospace';
  let w = 0;
  for (const tk of ph.tokens) { g.font = tk.sup ? small : big; w += g.measureText(tk.t).width; }
  let x = (1024 - w) / 2;
  const y = 140;
  for (const tk of ph.tokens) {
    g.font = tk.sup ? small : big;
    g.lineWidth = 8; g.strokeStyle = '#000';
    const yy = tk.sup ? y - 30 : y;
    g.strokeText(tk.t, x, yy);
    g.fillStyle = '#fff'; g.fillText(tk.t, x, yy);
    x += g.measureText(tk.t).width;
  }
  g.font = '18px "Press Start 2P", monospace';
  g.textAlign = 'center';
  g.fillStyle = ph.color; g.fillText(ph.title, 512, 58);
  g.fillStyle = '#d9d2ff'; g.font = '16px "Press Start 2P", monospace'; g.fillText(ph.sub, 512, 205);
  g.fillStyle = '#fff'; g.font = '14px "Press Start 2P", monospace'; g.fillText(`${num}/${PHASES.length}`, 960, 40);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

function axisTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1056; c.height = 96;
  const g = c.getContext('2d')!;
  const per = 1056 / 13; // -6.5..6.5
  g.strokeStyle = '#9fe3ff'; g.fillStyle = '#9fe3ff'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(8, 40); g.lineTo(1040, 40); g.stroke();
  g.beginPath(); g.moveTo(1050, 40); g.lineTo(1024, 26); g.lineTo(1024, 54); g.closePath(); g.fill();
  g.font = '16px "Press Start 2P", monospace'; g.textAlign = 'center';
  for (let i = -6; i <= 6; i++) {
    const x = (i + 6.5) * per;
    g.fillRect(x - 2, i === 0 ? 24 : 30, 4, i === 0 ? 32 : 20);
    g.fillStyle = i === 0 ? '#ffffff' : '#9fe3ff';
    g.fillText(String(i), x, 82);
    g.fillStyle = '#9fe3ff';
  }
  g.fillText('x', 1030, 20);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

function labelTexture(text: string, color = '#fff2a8'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 40;
  const g = c.getContext('2d')!;
  g.font = '16px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(text, 128, 21);
  g.fillStyle = color; g.fillText(text, 128, 21);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export function digitSprite(d: string, fill = '#ff5a5a', stroke = '#300'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '40px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = stroke; g.strokeText(d, 32, 34);
  g.fillStyle = fill; g.fillText(d, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  s.scale.set(1.1, 1.1, 1);
  return s;
}

// ================================================================ racine
export class RootMob implements Mob {
  id = newId();
  kind = 'root' as const;
  pos = new THREE.Vector3();
  radius = 0.7;
  height = 1.4;
  hp: number;
  maxHp: number;
  dead = false;
  age = 0;
  obj = new THREE.Group();
  targetable = true;
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private label: THREE.Sprite;
  private flash = 0;

  constructor(public boss: EquationBoss, public value: number, label: string, hp: number) {
    this.hp = this.maxHp = hp;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.32, depthWrite: false }));
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label), transparent: true, depthTest: false }));
    this.label.scale.set(3.2, 0.5, 1);
    this.label.position.y = -1.15;
    this.label.renderOrder = 41;
    this.obj.add(this.core, this.halo, this.label);
  }

  center(out = new THREE.Vector3()) { return out.copy(this.pos); }

  update(dt: number, ctx: MobCtx) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.boss.dead) { this.dead = true; return; }
    this.boss.rootPos(this, this.pos);
    this.pos.y += Math.sin(this.age * 2 + this.value) * 0.18;
    this.obj.position.copy(this.pos);
    this.core.rotation.y += dt * 2.2; this.core.rotation.x += dt * 1.3;
    const pulse = 1 + Math.sin(this.age * 5) * 0.12;
    this.halo.scale.setScalar(pulse * (0.7 + 0.3 * (this.hp / this.maxHp)));
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(this.flash > 0 ? 0xffffff : 0xffe14a);
    void ctx;
  }

  hurt(dmg: number, info: HitInfo, ctx: MobCtx): number {
    if (this.dead) return 0;
    if (info.op === '/') dmg = Math.max(dmg, this.hp * 0.5);
    dmg = Math.min(dmg, this.hp);
    this.hp -= dmg;
    this.flash = 0.15;
    ctx.fx.text(String(Math.max(1, Math.round(dmg))), this.pos.x, this.pos.y + 1, this.pos.z, '#ffe14a', true);
    ctx.audio.sfx('bell', 0.7);
    ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [255, 230, 90], 10, 4, 0.6, 0.1);
    this.boss.hp = Math.max(0, this.boss.hp - dmg);
    if (this.hp <= 0) {
      this.dead = true;
      ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [255, 240, 120], 40, 7, 1.1, 0.16);
      ctx.fx.ring(this.pos.x, this.pos.y, this.pos.z, 4, 0xffe14a, 0.7);
      ctx.audio.sfx('boom', 0.6);
      ctx.fx.text('racine trouvée !', this.pos.x, this.pos.y + 1.6, this.pos.z, '#fff2a8', true);
    }
    return dmg;
  }

  dispose() {
    (this.core.material as THREE.Material).dispose(); (this.halo.material as THREE.Material).dispose();
    (this.label.material as THREE.SpriteMaterial).map?.dispose(); this.label.material.dispose();
    this.core.geometry.dispose(); this.halo.geometry.dispose();
  }
}

// ================================================================== boss
export class EquationBoss implements Mob {
  id = newId();
  kind = 'boss' as const;
  pos = new THREE.Vector3();
  radius = 2.5;
  height = 0;
  hp: number;
  maxHp: number;
  dead = false;
  age = 0;
  obj = new THREE.Group();
  targetable = false;
  phase = -1;
  roots: RootMob[] = [];
  private panel: THREE.Sprite;
  private axis: THREE.Mesh;
  private symbols: THREE.Sprite[] = [];
  private yaw = 0;
  private atkT = 3;
  private sumT = 8;
  private waveT = 6;
  private trans = 0;
  private hpMul: number;
  private waves: { t: number; x: number; y: number; z: number; r: number }[] = [];
  private panelMats: THREE.SpriteMaterial;
  name = 'Équation de Diophante';

  constructor(x: number, y: number, z: number, diff: number, private proj: Projectiles) {
    this.pos.set(x, y, z);
    this.hpMul = 0.85 + diff * 0.35;
    let total = 0;
    PHASES.forEach((p, i) => { total += p.roots.length * Math.round((24 + i * 10) * this.hpMul); });
    this.hp = this.maxHp = total;
    this.panelMats = new THREE.SpriteMaterial({ map: panelTexture(PHASES[0], 1), transparent: true, depthTest: false });
    this.panel = new THREE.Sprite(this.panelMats);
    this.panel.scale.set(15, 3.75, 1);
    this.panel.position.y = 2.1;
    this.panel.renderOrder = 35;
    this.obj.add(this.panel);
    this.axis = new THREE.Mesh(
      new THREE.PlaneGeometry(13 * UNIT, (13 * UNIT * 96) / 1056),
      new THREE.MeshBasicMaterial({ map: axisTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.axis.position.y = -1.9;
    this.obj.add(this.axis);
    const syms = ['±', '√', '=', 'π', 'Σ', '∞', 'x', '²'];
    syms.forEach((s, i) => {
      const sp = digitSprite(s, '#d9c2ff', '#2a0a55');
      sp.scale.set(1.6, 1.6, 1);
      sp.userData.i = i;
      this.symbols.push(sp);
      this.obj.add(sp);
    });
    this.obj.position.copy(this.pos);
  }

  center(out = new THREE.Vector3()) { return out.copy(this.pos); }

  /** Position monde d'une racine sur la droite réelle. */
  rootPos(r: RootMob, out: THREE.Vector3) {
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return out.set(this.pos.x + rx * r.value * UNIT, this.pos.y - 1.9 + 1.25, this.pos.z + rz * r.value * UNIT);
  }

  private startPhase(i: number, ctx: MobCtx) {
    this.phase = i;
    const ph = PHASES[i];
    this.panelMats.map = panelTexture(ph, i + 1);
    this.panelMats.needsUpdate = true;
    const hp = Math.round((24 + i * 10) * this.hpMul);
    for (const r of ph.roots) {
      const root = new RootMob(this, r.v, r.label, hp);
      this.rootPos(root, root.pos);
      this.roots.push(root);
      ctx.mobs.add(root);
    }
    ctx.audio.sfx('roar', 0.8);
    ctx.fx.ring(this.pos.x, this.pos.y - 1, this.pos.z, 12, 0xe86bff, 0.9);
    this.atkT = 2.5; this.sumT = 7; this.waveT = 6;
    this.trans = 1.2;
    ctx.onBossEvent?.('phase', this);
  }

  update(dt: number, ctx: MobCtx) {
    this.age += dt;
    const pl = ctx.player;
    const pc = new THREE.Vector3(pl.body.x, pl.body.y + 1, pl.body.z);
    if (this.phase < 0) this.startPhase(0, ctx);
    // se place face au joueur, à distance
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z;
    const hd = Math.hypot(dx, dz) || 1;
    const want = 11;
    const tx = pc.x - (dx / hd) * want, tz = pc.z - (dz / hd) * want;
    const ty = pc.y + 5.5 + Math.sin(this.age * 0.8) * 0.6;
    const k = Math.min(1, dt * 0.9);
    this.pos.x += (tx - this.pos.x) * k; this.pos.z += (tz - this.pos.z) * k; this.pos.y += (ty - this.pos.y) * k;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 3);
    this.obj.position.copy(this.pos);
    this.axis.rotation.y = this.yaw;
    // symboles en orbite
    this.symbols.forEach((s, i) => {
      const a = this.age * 0.7 + (i / this.symbols.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 6.5, 0.9 + Math.sin(a * 2) * 1.2, Math.sin(a) * 2.2);
    });
    if (this.trans > 0) { this.trans -= dt; return; }

    // fin de phase ?
    this.roots = this.roots.filter((r) => !r.dead);
    if (this.roots.length === 0) {
      if (this.phase + 1 < PHASES.length) {
        ctx.fx.text(`Phase ${this.phase + 2}`, pc.x, pc.y + 2.5, pc.z, '#e86bff', true);
        this.startPhase(this.phase + 1, ctx);
      } else this.defeat(ctx);
      return;
    }

    // attaques
    this.atkT -= dt; this.sumT -= dt; this.waveT -= dt;
    const ph = this.phase;
    if (this.atkT <= 0 && !pl.dead && !pl.creative) {
      this.atkT = 2.8 - ph * 0.5;
      const n = 2 + ph;
      for (let i = 0; i < n; i++) {
        const aim = pc.clone().sub(this.pos).normalize();
        aim.x += (i - (n - 1) / 2) * 0.1;
        aim.normalize();
        const digit = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-1', 'x'][Math.floor(Math.random() * 12)];
        this.proj.spawn({
          pos: this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), vel: aim.multiplyScalar(11 + ph * 2), kind: 'enemy', dmg: 2 + ph,
          team: 'enemy', life: 4, r: 0.5, color: 0xff5050, mesh: digitSprite(digit), noBlock: true,
        });
      }
      ctx.audio.sfx('vec', 0.6);
    }
    if (ph >= 1 && this.sumT <= 0) {
      this.sumT = 13 - ph * 2;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = pc.x + Math.cos(a) * 8, z = pc.z + Math.sin(a) * 8;
        const y = ctx.world.surfaceY(Math.floor(x), Math.floor(z)) + 1;
        if (y > 1) {
          if (ph >= 2 && i === 0) ctx.mobs.add(new VectorMob(x, y + 4, z, 1.5), ctx);
          else { const sp = randomFraction(1.5); ctx.mobs.add(new Fraction(sp.num, sp.den, sp.neg, sp.kind, x, y, z), ctx); }
          ctx.fx.ring(x, y, z, 1.8, 0xe86bff, 0.5);
        }
      }
    }
    if (ph >= 2 && this.waveT <= 0) {
      this.waveT = 8;
      const w = { t: 1.1, x: pl.body.x, y: pl.body.y, z: pl.body.z, r: 6.5 };
      this.waves.push(w);
      ctx.fx.ring(w.x, w.y + 0.1, w.z, w.r, 0xff4040, 1.1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t -= dt;
      if (w.t <= 0) {
        ctx.fx.ring(w.x, w.y + 0.2, w.z, w.r + 1, 0xffffff, 0.35);
        ctx.audio.sfx('boom', 0.7);
        const d = Math.hypot(pl.body.x - w.x, pl.body.z - w.z);
        if (d < w.r && pl.body.y < w.y + 1.1 && !pl.dead) ctx.hurtPlayer(5, new THREE.Vector3(w.x, w.y, w.z), 0);
        this.waves.splice(i, 1);
      }
    }
    if (hd > 90) this.dead = true;
  }

  private defeat(ctx: MobCtx) {
    this.dead = true;
    const diff = ctx.difficulty();
    ctx.fx.text('Q.E.D.', this.pos.x, this.pos.y + 2, this.pos.z, '#fff2a8', true);
    for (let i = 0; i < 6; i++) ctx.fx.ring(this.pos.x, this.pos.y - 1 + i * 0.4, this.pos.z, 6 + i * 2, 0xe86bff, 0.8 + i * 0.1);
    ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [255, 220, 120], 80, 9, 1.6, 0.2);
    ctx.audio.sfx('win', 1);
    const drops: [string, number][] = [['res_cristal', 2 + Math.floor(diff)], ['res_diamant', 3], ['res_or', 5], ['res_fer', 6], ['food_pomme', 3]];
    const ground = ctx.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 2;
    for (const [id, n] of drops) ctx.fx.spawnDrop(id, n, this.pos.x, Math.max(ground, this.pos.y - 3), this.pos.z);
    ctx.onBossEvent?.('defeat', this);
  }

  hurt(_d: number, _i: HitInfo, _ctx: MobCtx): number { return 0; }

  dispose() {
    this.panelMats.map?.dispose(); this.panelMats.dispose();
    (this.axis.material as THREE.MeshBasicMaterial).map?.dispose(); (this.axis.material as THREE.Material).dispose();
    this.axis.geometry.dispose();
    for (const s of this.symbols) { s.material.map?.dispose(); s.material.dispose(); }
  }
}
