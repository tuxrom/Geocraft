import * as THREE from 'three';
import type { World } from '../world/world';
import type { Player } from './player';
import type { Effects } from './effects';
import type { AudioSys } from './audio';
import { moveBody, type Body } from './physics';
import { entityTint } from '../gfx/lighting';
import { SEA } from '../core/constants';
import { SOLID, LIQUID } from '../data/blocks';

export type Op = '+' | '-' | 'x' | '/' | '=' | '';

export interface HitInfo {
  op?: Op;
  knock?: THREE.Vector3;
  src: string;
  /** Vecteur à ajouter (déviation des vecteurs ennemis). */
  vec?: THREE.Vector3;
  noFloat?: boolean;
}

export interface MobCtx {
  world: World;
  player: Player;
  fx: Effects;
  audio: AudioSys;
  mobs: Mobs;
  hurtPlayer(amount: number, from?: THREE.Vector3, slow?: number): void;
  difficulty(): number;
  night: boolean;
  time: number;
  onKill?(m: Mob): void;
  onBossEvent?(ev: string, m: Mob): void;
}

export interface Mob {
  id: number;
  kind: 'fraction' | 'vector' | 'boss' | 'npc' | 'root';
  pos: THREE.Vector3; // pieds
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  age: number;
  obj: THREE.Object3D;
  /** Vrai si peut être ciblé par les attaques du joueur. */
  targetable: boolean;
  center(out?: THREE.Vector3): THREE.Vector3;
  update(dt: number, ctx: MobCtx): void;
  hurt(dmg: number, info: HitInfo, ctx: MobCtx): number;
  dispose(): void;
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
let nextId = 1;
export const newId = () => nextId++;

// ============================================================ Fractions
export type FracKind = 'propre' | 'impropre' | 'decimale' | 'irreductible' | 'negative';

const FRAC_COLORS: Record<FracKind, string> = {
  propre: '#58b83c', impropre: '#e8872a', decimale: '#2fb4cc', irreductible: '#8d97a6', negative: '#8a4bd0',
};

const texCache = new Map<string, THREE.CanvasTexture>();

function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function fractionTexture(num: number, den: number, neg: boolean, kind: FracKind, armored: boolean, reinforced: boolean): THREE.CanvasTexture {
  const key = `${neg ? '-' : ''}${num}/${den}|${kind}|${armored ? 1 : 0}|${reinforced ? 1 : 0}`;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const base = FRAC_COLORS[kind];
  g.fillStyle = shadeHex(base, 0.55); g.fillRect(0, 0, 64, 64);
  g.fillStyle = base; g.fillRect(3, 3, 58, 58);
  g.fillStyle = shadeHex(base, 1.25); g.fillRect(3, 3, 58, 3); g.fillRect(3, 3, 3, 58);
  g.fillStyle = shadeHex(base, 0.75); g.fillRect(3, 58, 58, 3); g.fillRect(58, 3, 3, 58);
  if (armored) {
    g.strokeStyle = '#3d4552'; g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
    g.fillStyle = '#dde3ee';
    for (const [x, y] of [[6, 6], [56, 6], [6, 56], [56, 56], [31, 4], [31, 58]]) g.fillRect(x - 1, y - 1, 3, 3);
  }
  if (reinforced) { g.strokeStyle = '#ff4040'; g.lineWidth = 2; g.strokeRect(5, 5, 54, 54); }
  // yeux
  g.fillStyle = '#fff'; g.fillRect(14, 9, 10, 8); g.fillRect(40, 9, 10, 8);
  g.fillStyle = '#111'; g.fillRect(19, 11, 5, 6); g.fillRect(45, 11, 5, 6);
  // texte
  g.font = '13px "Press Start 2P", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const put = (s: string, x: number, y: number) => {
    g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(s, x, y);
    g.fillStyle = '#fff'; g.fillText(s, x, y);
  };
  const w = Math.max(String(num).length, String(den).length) * 13;
  const cx = neg ? 36 : 32;
  put(String(num), cx, 28);
  g.fillStyle = '#000'; g.fillRect(cx - w / 2 - 3, 36, w + 6, 6);
  g.fillStyle = '#fff'; g.fillRect(cx - w / 2 - 2, 37, w + 4, 4);
  put(String(den), cx, 50);
  if (neg) { g.fillStyle = '#000'; g.fillRect(3, 35, 12, 8); g.fillStyle = '#fff'; g.fillRect(4, 37, 10, 4); }
  if (kind === 'decimale') {
    const v = (num / den).toString().replace('.', ',');
    g.font = '7px "Press Start 2P", monospace';
    g.fillStyle = '#000'; g.fillText('=' + v, 33, 60); g.fillStyle = '#e8ffff'; g.fillText('=' + v, 32, 59);
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (texCache.size > 300) texCache.clear();
  texCache.set(key, t);
  return t;
}

export interface FracSpec { num: number; den: number; neg: boolean; kind: FracKind }

export function randomFraction(diff: number): FracSpec {
  const r = Math.random();
  const hi = 2 + Math.floor(diff * 3.2);
  const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const pIrr = 0.05 + diff * 0.07, pNeg = 0.07 + diff * 0.04, pDec = 0.1 + diff * 0.03, pImp = 0.2;
  if (r < pIrr) {
    for (let k = 0; k < 30; k++) {
      const den = ri(5, 9 + Math.floor(diff * 3)), num = ri(2, den + 3);
      if (gcd(num, den) === 1 && num !== den) return { num, den, neg: false, kind: 'irreductible' };
    }
  }
  if (r < pIrr + pNeg) {
    const den = ri(2, 6 + hi), num = ri(1, den - 1);
    return { num, den, neg: true, kind: 'negative' };
  }
  if (r < pIrr + pNeg + pDec) {
    const den = Math.random() < 0.7 ? 10 : 100;
    const num = den === 10 ? ri(1, 9) : [5, 25, 75, 12, 8, 45][ri(0, 5)];
    return { num, den, neg: false, kind: 'decimale' };
  }
  if (r < pIrr + pNeg + pDec + pImp) {
    const den = ri(2, 4 + hi), num = den + ri(1, hi + 2);
    return { num, den, neg: false, kind: 'impropre' };
  }
  const den = ri(2, 5 + hi), num = ri(1, Math.max(1, Math.min(den - 1, 2 + hi)));
  return { num, den, neg: false, kind: 'propre' };
}

export function lootFor(diff: number, mult = 1, value = 1): [string, number][] {
  const out: [string, number][] = [];
  const m = mult;
  const r = Math.random;
  if (r() < 0.8) out.push([r() < 0.5 ? 'b_dirt' : 'b_stone', 1 + Math.floor(r() * 2 * m)]);
  if (r() < 0.22 * m) out.push(['res_cuivre', 1]);
  if (diff > 0.4 && r() < 0.12 * m) out.push(['res_fer', 1]);
  if (diff > 0.9 && r() < 0.07 * m) out.push(['res_or', 1]);
  if (diff > 1.5 && r() < 0.03 * m) out.push(['res_diamant', 1]);
  if (r() < 0.06) out.push(['food_pomme', 1]);
  void value;
  return out;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class Fraction implements Mob {
  id = newId();
  kind = 'fraction' as const;
  pos = new THREE.Vector3();
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  dead = false;
  age = 0;
  obj = new THREE.Group();
  targetable = true;
  body: Body;
  size: number;
  dmg: number;
  speed: number;
  atkCd = 1;
  flash = 0;
  slowT = 0;
  buff = 1;
  reinforced = false;
  armored = false;
  lootMul = 1;
  private mesh: THREE.Mesh;
  private matSide: THREE.MeshBasicMaterial;
  private matTop: THREE.MeshBasicMaterial;
  private wander = 0;
  private wdx = 0;
  private wdz = 0;
  private spawnAge = 0;
  private squash = 0;

  constructor(public num: number, public den: number, public neg: boolean, public fkind: FracKind, x: number, y: number, z: number, hp?: number, sizeScale = 1) {
    this.armored = fkind === 'irreductible';
    const baseHp = Math.round(4 + num * 1.6 + (fkind === 'impropre' ? 2 : 0));
    this.maxHp = hp ? Math.max(1, hp) : baseHp;
    this.hp = this.maxHp;
    this.size = Math.max(0.55, Math.min(1.9, (0.7 + 0.1 * Math.sqrt(this.maxHp)) * sizeScale));
    this.radius = this.size * 0.5;
    this.height = this.size;
    this.dmg = 1 + den * 0.35 + (fkind === 'impropre' ? 1 : 0);
    this.speed = 2.1 + 3 / (2 + den * 0.35) + (fkind === 'decimale' ? 0.5 : 0);
    this.body = { x, y, z, vx: 0, vy: 0, vz: 0, hw: this.size * 0.42, h: this.size, onGround: false, hitX: false, hitZ: false };
    this.pos.set(x, y, z);
    this.matSide = new THREE.MeshBasicMaterial({ map: fractionTexture(num, den, neg, fkind, this.armored, false) });
    this.matTop = new THREE.MeshBasicMaterial({ color: new THREE.Color(FRAC_COLORS[fkind]).multiplyScalar(0.8) });
    this.mesh = new THREE.Mesh(boxGeo, [this.matSide, this.matSide, this.matTop, this.matTop, this.matSide, this.matSide]);
    this.mesh.scale.setScalar(this.size);
    this.mesh.frustumCulled = false;
    this.obj.add(this.mesh);
    this.obj.position.set(x, y, z);
    this.wander = Math.random() * 3;
  }

  center(out = new THREE.Vector3()) { return out.set(this.body.x, this.body.y + this.height / 2, this.body.z); }

  private refreshTexture() {
    this.matSide.map = fractionTexture(this.num, this.den, this.neg, this.fkind, this.armored, this.reinforced);
    this.matSide.needsUpdate = true;
  }

  update(dt: number, ctx: MobCtx) {
    this.age += dt;
    this.spawnAge += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.atkCd -= dt;
    const b = this.body;
    const p = ctx.player.body;
    const dx = p.x - b.x, dz = p.z - b.z;
    const hd = Math.hypot(dx, dz);
    const vd = (p.y + 0.9) - (b.y + this.height / 2);
    const inWater = LIQUID[ctx.world.getBlock(Math.floor(b.x), Math.floor(b.y + 0.3), Math.floor(b.z))] === 1;
    const aggro = hd < (ctx.night || b.y < SEA - 2 ? 26 : 14) && !ctx.player.dead && !ctx.player.creative;
    let tx = 0, tz = 0;
    const spd = this.speed * (this.slowT > 0 ? 0.45 : 1);
    if (aggro) {
      if (hd > 0.01) { tx = (dx / hd) * spd; tz = (dz / hd) * spd; }
    } else {
      this.wander -= dt;
      if (this.wander <= 0) {
        this.wander = 1.5 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        const moving = Math.random() < 0.6;
        this.wdx = moving ? Math.cos(a) * spd * 0.4 : 0; this.wdz = moving ? Math.sin(a) * spd * 0.4 : 0;
      }
      tx = this.wdx; tz = this.wdz;
    }
    const k = 1 - Math.exp(-(b.onGround ? 9 : 2.5) * dt);
    b.vx += (tx - b.vx) * k; b.vz += (tz - b.vz) * k;
    if (inWater) { b.vy += (1.5 - b.vy) * Math.min(1, 4 * dt); } else b.vy = Math.max(-40, b.vy - 28 * dt);
    if ((b.hitX || b.hitZ) && b.onGround && (aggro || this.wander > 0)) b.vy = 8.2;
    moveBody(ctx.world, b, dt, 0.55);
    // attaque
    const reach = this.radius + 0.75;
    if (aggro && this.atkCd <= 0 && hd < reach + 0.3 && Math.abs(vd) < this.height * 0.5 + 1.1) {
      this.atkCd = 1.1;
      ctx.hurtPlayer(this.dmg * this.buff, this.center(), this.neg ? 2.5 : 0);
      b.vx -= (dx / Math.max(hd, 0.01)) * 3; b.vz -= (dz / Math.max(hd, 0.01)) * 3;
    }
    // animation et teinte
    this.squash = Math.sin(this.age * 7) * 0.05 * Math.min(1, Math.hypot(b.vx, b.vz));
    const grow = Math.min(1, this.spawnAge * 3);
    this.mesh.scale.set(this.size * (1 - this.squash) * grow, this.size * (1 + this.squash) * grow, this.size * (1 - this.squash) * grow);
    this.obj.position.set(b.x, b.y + (this.height * (1 - grow)) / 2 * 0, b.z);
    this.mesh.position.y = this.height / 2;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.pos.set(b.x, b.y, b.z);
    const f = this.flash > 0 ? 1 : 0;
    const lr = entityTint.r, lg = entityTint.g, lb = entityTint.b;
    const glow = this.reinforced ? 1.15 : 1;
    this.matSide.color.setRGB(lr * (1 + f * 0.8) * glow, lg * (1 - f * 0.6), lb * (1 - f * 0.6));
    this.matTop.color.setRGB(lr * (0.8 + f * 0.6), lg * (0.8 - f * 0.4), lb * (0.8 - f * 0.4));
    if (b.y < -20) this.dead = true;
  }

  hurt(dmg: number, info: HitInfo, ctx: MobCtx): number {
    if (this.dead) return 0;
    if (this.armored && info.op !== '/') dmg *= 0.5;
    let applied = dmg;
    // opérateur '÷' : retire le blindage, puis fragmente
    if (info.op === '/') {
      this.armored = false;
      this.refreshTexture();
    }
    this.hp -= applied;
    this.flash = 0.18;
    const c = this.center();
    if (!info.noFloat) ctx.fx.text(String(Math.max(1, Math.round(applied))), c.x, c.y + this.height * 0.6, c.z, this.armored ? '#9fb4d4' : '#ffd54a');
    ctx.audio.sfx('hit', 0.9);
    ctx.fx.burst(c.x, c.y, c.z, [200, 255, 160], 6, 3, 0.5, 0.09);
    if (info.knock) { this.body.vx += info.knock.x; this.body.vz += info.knock.z; this.body.vy += Math.max(2.5, info.knock.y); this.body.onGround = false; }
    if (this.hp <= 0) { this.die(ctx); return applied; }
    if (info.op === '/') this.divide(ctx);
    else if (info.op === 'x') this.multiply(ctx);
    else if (info.op === '-') this.subtract(ctx);
    else if (info.op === '+') this.add(ctx);
    return applied;
  }

  private divide(ctx: MobCtx) {
    if (this.hp < 1.6 || this.den * 2 > 99) return;
    const half = Math.max(1, Math.ceil(this.hp / 2));
    const c = this.center();
    const sc = 0.72;
    for (const s of [-1, 1]) {
      const f = new Fraction(this.num, this.den * 2, this.neg, this.fkind === 'irreductible' ? 'propre' : this.fkind, c.x + s * 0.4, this.body.y + 0.05, c.z, half, sc);
      f.body.vx = s * 3; f.body.vy = 5; f.body.vz = (Math.random() - 0.5) * 2;
      f.lootMul = 0.7;
      ctx.mobs.add(f, ctx);
    }
    ctx.audio.sfx('split', 0.8);
    ctx.fx.text('÷', c.x, c.y + this.height, c.z, '#7dd3fc', true);
    this.dead = true;
    this.cleanup();
  }

  private multiply(ctx: MobCtx) {
    this.reinforced = true;
    this.buff = Math.min(2.5, this.buff * 1.25);
    this.hp = Math.min(this.maxHp * 1.3, this.hp + 2);
    this.refreshTexture();
    const c = this.center();
    ctx.fx.text('x', c.x, c.y + this.height, c.z, '#ff7b7b', true);
  }

  private subtract(ctx: MobCtx) {
    this.slowT = 3.5;
    const c = this.center();
    if (this.neg) { this.neg = false; this.buff = 1; this.refreshTexture(); ctx.fx.text('-(-)=+', c.x, c.y + this.height, c.z, '#c4b5fd', true); }
    else if (this.reinforced || this.buff > 1) { this.reinforced = false; this.buff = 1; this.refreshTexture(); ctx.fx.text('bonus retiré', c.x, c.y + this.height, c.z, '#fca5a5'); }
    else ctx.fx.text('-', c.x, c.y + this.height, c.z, '#93c5fd', true);
  }

  /** Addition : fusionne avec la fraction la plus proche (a/b + c/d). */
  private add(ctx: MobCtx) {
    let best: Fraction | null = null, bd = 5;
    for (const m of ctx.mobs.list) {
      if (m === this || m.dead || !(m instanceof Fraction)) continue;
      const d = m.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) { const c = this.center(); ctx.fx.text('+', c.x, c.y + this.height, c.z, '#86efac', true); return; }
    const sa = this.neg ? -1 : 1, sb = best.neg ? -1 : 1;
    let n = sa * this.num * best.den + sb * best.num * this.den;
    let d = this.den * best.den;
    const g = gcd(n, d) || 1;
    n /= g; d /= g;
    if (n === 0 || d > 99 || Math.abs(n) > 99) { const c = this.center(); ctx.fx.text('+', c.x, c.y + this.height, c.z, '#86efac', true); return; }
    const neg = n < 0;
    const num = Math.abs(n);
    const kind: FracKind = neg ? 'negative' : num > d ? 'impropre' : gcd(num, d) === 1 && d > 6 ? 'irreductible' : 'propre';
    const hp = Math.min(60, this.hp + best.hp);
    const c = this.center();
    const mid = new THREE.Vector3().addVectors(c, best.center()).multiplyScalar(0.5);
    const f = new Fraction(num, d, neg, kind, mid.x, Math.min(this.body.y, best.body.y), mid.z, hp, 1.1);
    f.lootMul = 2;
    ctx.mobs.add(f, ctx);
    ctx.fx.text(`${num}/${d}`, mid.x, mid.y + 1.2, mid.z, '#86efac', true);
    ctx.audio.sfx('bell', 0.4);
    best.dead = true; best.cleanup();
    this.dead = true; this.cleanup();
  }

  private die(ctx: MobCtx) {
    this.dead = true;
    const c = this.center();
    ctx.fx.burst(c.x, c.y, c.z, [100 + Math.random() * 100, 230, 120], 22, 5, 0.8, 0.12);
    ctx.audio.sfx('die', 0.7);
    for (const [id, n] of lootFor(ctx.difficulty(), this.lootMul, this.num / this.den)) ctx.fx.spawnDrop(id, n, c.x, c.y, c.z);
    ctx.onKill?.(this);
    this.cleanup();
  }

  private cleanup() { /* le gestionnaire retire l'objet de la scène */ }

  dispose() { this.matSide.dispose(); this.matTop.dispose(); }
}

// ============================================================ Vecteurs
const vecLabelCache = new Map<string, THREE.CanvasTexture>();
function vecLabel(v: THREE.Vector3, norm: number): THREE.CanvasTexture {
  const f = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1).replace('.', ','));
  const l1 = `v=(${f(v.x)} ; ${f(v.y)} ; ${f(v.z)})`;
  const l2 = `norme ${norm.toFixed(1).replace('.', ',')}`;
  const key = l1 + l2;
  let t = vecLabelCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const g = c.getContext('2d')!;
  g.font = '12px "Press Start 2P", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = '#000';
  g.strokeText(l1, 128, 15); g.fillStyle = '#8be9ff'; g.fillText(l1, 128, 15);
  g.strokeText(l2, 128, 40); g.fillStyle = '#ffffff'; g.fillText(l2, 128, 40);
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (vecLabelCache.size > 150) vecLabelCache.clear();
  vecLabelCache.set(key, t);
  return t;
}

let arrowGeo: THREE.BufferGeometry | null = null;
function arrowGeometry(): THREE.BufferGeometry {
  if (arrowGeo) return arrowGeo;
  const shaft = new THREE.BoxGeometry(0.22, 0.22, 1.0);
  shaft.translate(0, 0, -0.1);
  const head = new THREE.ConeGeometry(0.46, 0.7, 4);
  head.rotateX(Math.PI / 2);
  head.rotateZ(Math.PI / 4);
  head.translate(0, 0, 0.75);
  const fin1 = new THREE.BoxGeometry(0.5, 0.06, 0.3); fin1.translate(0, 0, -0.55);
  const fin2 = new THREE.BoxGeometry(0.06, 0.5, 0.3); fin2.translate(0, 0, -0.55);
  const parts = [shaft, head, fin1, fin2];
  const pos: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  arrowGeo = new THREE.BufferGeometry();
  arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  arrowGeo.setIndex(idx);
  return arrowGeo;
}

type VState = 'hover' | 'aim' | 'charge' | 'recover' | 'stun';

export class VectorMob implements Mob {
  id = newId();
  kind = 'vector' as const;
  pos = new THREE.Vector3();
  radius = 0.6;
  height = 0.8;
  hp: number;
  maxHp: number;
  dead = false;
  age = 0;
  obj = new THREE.Group();
  targetable = true;
  v: THREE.Vector3;
  norm: number;
  state: VState = 'hover';
  private t = 1.5 + Math.random() * 2;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private label: THREE.Sprite;
  private labelMat: THREE.SpriteMaterial;
  private orbit = Math.random() * 6.28;
  private chargeDir = new THREE.Vector3(0, 0, 1);
  private dist = 0;
  deflected = false;
  private flash = 0;
  private vel = new THREE.Vector3();
  private hitSet = new Set<number>();
  private hoverH = 3 + Math.random() * 3;
  private R = 7 + Math.random() * 4;

  constructor(x: number, y: number, z: number, diff = 0) {
    const ri = (n: number) => Math.floor(Math.random() * (2 * n + 1)) - n;
    const m = 2 + Math.floor(diff * 1.5);
    this.v = new THREE.Vector3(ri(m) || 1, ri(Math.max(1, m - 1)), ri(m) || -1);
    this.norm = this.v.length();
    this.maxHp = Math.round(this.norm * 1.5 + 3);
    this.hp = this.maxHp;
    this.pos.set(x, y, z);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x4fd8ff });
    this.mesh = new THREE.Mesh(arrowGeometry(), this.mat);
    const s = 0.8 + Math.min(0.6, this.norm * 0.07);
    this.mesh.scale.setScalar(s);
    this.radius = 0.55 * s;
    this.obj.add(this.mesh);
    this.labelMat = new THREE.SpriteMaterial({ map: vecLabel(this.v, this.norm), transparent: true, depthTest: false });
    this.label = new THREE.Sprite(this.labelMat);
    this.label.scale.set(2.6, 0.57, 1);
    this.label.position.y = 1.0;
    this.label.renderOrder = 40;
    this.obj.add(this.label);
    this.obj.position.copy(this.pos);
  }

  center(out = new THREE.Vector3()) { return out.copy(this.pos); }

  private setVector(v: THREE.Vector3) {
    this.v.copy(v);
    this.norm = v.length();
    this.labelMat.map = vecLabel(this.v, this.norm);
    this.labelMat.needsUpdate = true;
  }

  update(dt: number, ctx: MobCtx) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.t -= dt;
    const pl = ctx.player;
    const pc = new THREE.Vector3(pl.body.x, pl.body.y + 1.0, pl.body.z);
    switch (this.state) {
      case 'hover': {
        this.orbit += dt * 0.5;
        const tgt = new THREE.Vector3(pc.x + Math.cos(this.orbit) * this.R, pc.y + this.hoverH, pc.z + Math.sin(this.orbit) * this.R);
        const to = tgt.sub(this.pos);
        const d = to.length();
        if (d > 0.1) this.pos.addScaledVector(to, Math.min(1, (3.5 * dt) / d));
        const face = pc.clone().sub(this.pos);
        this.orient(face, dt, 4);
        if (this.t <= 0 && !pl.dead && !pl.creative && face.length() < 40) { this.state = 'aim'; this.t = 1.0; ctx.audio.sfx('vec', 0.7); }
        break;
      }
      case 'aim': {
        const face = pc.clone().sub(this.pos);
        this.orient(face, dt, 10);
        this.mat.color.setHex(Math.floor(this.age * 14) % 2 ? 0xffffff : 0xff5555);
        if (this.t <= 0) {
          this.chargeDir.copy(face).normalize();
          this.setVector(this.chargeDir.clone().multiplyScalar(this.norm));
          this.state = 'charge';
          this.dist = 0;
          this.hitSet.clear();
          this.deflected = false;
          this.mat.color.setHex(0xff8a3a);
        }
        break;
      }
      case 'charge': {
        const speed = 7 + this.norm * 1.8;
        const step = speed * dt;
        const dir = this.chargeDir;
        const nx = this.pos.x + dir.x * step, ny = this.pos.y + dir.y * step, nz = this.pos.z + dir.z * step;
        const w = ctx.world;
        const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id < 0 || SOLID[id]) {
          ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [120, 220, 255], 14, 5, 0.6);
          ctx.audio.sfx('hit', 0.6);
          this.state = 'stun'; this.t = 1.4; this.vel.set(0, 0, 0);
          this.mat.color.setHex(0x7a8a99);
          break;
        }
        this.pos.set(nx, ny, nz);
        this.dist += step;
        this.orient(dir, dt, 30);
        ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [100, 220, 255], 1, 0.4, 0.3, 0.07, 0);
        if (this.deflected) {
          for (const m of ctx.mobs.list) {
            if (m === this || m.dead || !m.targetable || this.hitSet.has(m.id)) continue;
            if (m.center().distanceTo(this.pos) < m.radius + this.radius + 0.2) {
              this.hitSet.add(m.id);
              m.hurt(this.norm * 2, { op: '', src: 'vecteur', knock: dir.clone().multiplyScalar(4) }, ctx);
            }
          }
        } else if (!pl.dead && pc.distanceTo(this.pos) < 0.95 + this.radius * 0.5) {
          ctx.hurtPlayer(this.norm * 1.1, this.pos, 0);
          ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [255, 120, 80], 10, 4, 0.5);
          this.state = 'recover'; this.t = 2;
          this.mat.color.setHex(0x4fd8ff);
          break;
        }
        if (this.dist > 22) { this.state = 'recover'; this.t = 1.2; this.mat.color.setHex(0x4fd8ff); }
        break;
      }
      case 'stun': {
        this.vel.y -= 12 * dt;
        this.pos.addScaledVector(this.vel, dt);
        const id = ctx.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.4), Math.floor(this.pos.z));
        if (id > 0 && SOLID[id]) { this.pos.y += 8 * dt; this.vel.y = 0; }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.8; this.mat.color.setHex(0x4fd8ff); }
        break;
      }
      case 'recover': {
        this.pos.y += 2.5 * dt;
        if (this.t <= 0) { this.state = 'hover'; this.t = 2 + Math.random() * 2; this.hoverH = 3 + Math.random() * 3; }
        break;
      }
    }
    this.obj.position.copy(this.pos);
    // couleur fixe (flèches lumineuses, non assombries par la nuit)
    let col = 0x4fd8ff;
    if (this.state === 'charge') col = this.deflected ? 0xffcf40 : 0xff8a3a;
    else if (this.state === 'stun') col = 0x7a8a99;
    else if (this.state === 'aim') col = Math.floor(this.age * 14) % 2 ? 0xffffff : 0xff5555;
    this.mat.color.setHex(this.flash > 0 ? 0xffffff : col);
    if (this.pos.distanceTo(pc) > 70 || this.pos.y < 2) this.dead = true;
  }

  private orient(dir: THREE.Vector3, dt: number, rate: number) {
    if (dir.lengthSq() < 1e-6) return;
    const target = new THREE.Object3D();
    target.position.copy(this.pos);
    target.lookAt(this.pos.clone().add(dir));
    this.obj.quaternion.slerp(target.quaternion, Math.min(1, rate * dt));
    this.label.quaternion.identity();
  }

  hurt(dmg: number, info: HitInfo, ctx: MobCtx): number {
    if (this.dead) return 0;
    // somme de vecteurs : l'équerre et le plus dévient la charge
    if (info.vec) {
      const nv = this.v.clone().add(info.vec);
      if (nv.lengthSq() < 0.01) nv.set(0.1, 1, 0);
      this.chargeDir.copy(nv).normalize();
      this.setVector(nv);
      this.deflected = true;
      this.hitSet.clear();
      if (this.state !== 'charge') { this.state = 'charge'; this.dist = 0; this.mat.color.setHex(0xffcf40); }
      ctx.fx.text(`v + w`, this.pos.x, this.pos.y + 1.4, this.pos.z, '#8be9ff', true);
      ctx.audio.sfx('bell', 0.5);
      dmg *= 0.5;
    }
    if (info.op === '/') { // diviser réduit la norme
      const nv = this.v.clone().multiplyScalar(0.5);
      this.setVector(nv);
      this.maxHp = Math.max(1, Math.ceil(this.maxHp * 0.6));
      this.hp = Math.min(this.hp, this.maxHp);
      ctx.fx.text('÷2', this.pos.x, this.pos.y + 1.4, this.pos.z, '#7dd3fc', true);
    }
    if (info.op === '-') this.t += 1.5;
    this.hp -= dmg;
    this.flash = 0.12;
    ctx.fx.text(String(Math.max(1, Math.round(dmg))), this.pos.x, this.pos.y + 0.9, this.pos.z, '#ffd54a');
    ctx.audio.sfx('hit', 0.9);
    ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [140, 230, 255], 6, 3, 0.5, 0.08);
    if (info.knock) this.pos.addScaledVector(info.knock, 0.08);
    if (this.hp <= 0) {
      this.dead = true;
      ctx.fx.burst(this.pos.x, this.pos.y, this.pos.z, [120, 230, 255], 24, 6, 0.9, 0.12);
      ctx.audio.sfx('die', 0.6);
      for (const [id, n] of lootFor(ctx.difficulty() + 0.3, 1.3)) ctx.fx.spawnDrop(id, n, this.pos.x, this.pos.y, this.pos.z);
      ctx.onKill?.(this);
    }
    return dmg;
  }

  dispose() { this.mat.dispose(); this.labelMat.dispose(); }
}

// ================================================================ Gestion
export class Mobs {
  list: Mob[] = [];
  constructor(private scene: THREE.Scene) {}

  add(m: Mob, _ctx?: MobCtx) {
    this.list.push(m);
    this.scene.add(m.obj);
  }

  private remove(i: number) {
    const m = this.list[i];
    this.scene.remove(m.obj);
    m.dispose();
    this.list.splice(i, 1);
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this.remove(i); }

  count(kind?: string): number { return kind ? this.list.filter((m) => m.kind === kind && !m.dead).length : this.list.length; }

  update(dt: number, ctx: MobCtx) {
    for (const m of [...this.list]) m.update(dt, ctx);
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].dead) this.remove(i);
  }

  /** Mob le plus proche touché par un rayon (sphères englobantes). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, pad = 0.3, filter?: (m: Mob) => boolean): { mob: Mob; dist: number } | null {
    let best: { mob: Mob; dist: number } | null = null;
    const c = new THREE.Vector3();
    for (const m of this.list) {
      if (m.dead || !m.targetable || (filter && !filter(m))) continue;
      m.center(c);
      const r = Math.max(m.radius, m.height * 0.5) + pad;
      const oc = c.clone().sub(o);
      const t = oc.dot(d);
      if (t < -r || t > maxDist + r) continue;
      const d2 = oc.lengthSq() - t * t;
      if (d2 > r * r) continue;
      const dist = Math.max(0, t - Math.sqrt(r * r - d2));
      if (dist <= maxDist && (!best || dist < best.dist)) best = { mob: m, dist };
    }
    return best;
  }

  within(p: THREE.Vector3, r: number, filter?: (m: Mob) => boolean): Mob[] {
    const out: Mob[] = [];
    const c = new THREE.Vector3();
    for (const m of this.list) {
      if (m.dead || !m.targetable || (filter && !filter(m))) continue;
      if (m.center(c).distanceTo(p) <= r + m.radius) out.push(m);
    }
    return out;
  }
}

// ================================================================= Apparition
export class Spawner {
  private t = 0;
  playTime = 0;

  difficulty(player: Player, night: boolean): number {
    const depth = Math.max(0, SEA - player.body.y) / 45;
    const time = Math.min(1.5, this.playTime / 1800);
    return Math.min(3, depth + time + (night ? 0.25 : 0));
  }

  update(dt: number, ctx: MobCtx, sky: { daylight: number }) {
    this.t -= dt;
    const pl = ctx.player;
    if (pl.dead || pl.creative) return;
    // disparition des monstres de surface au lever du jour ou trop éloignés
    for (const m of ctx.mobs.list) {
      if (m.kind !== 'fraction' && m.kind !== 'vector') continue;
      const d = m.pos.distanceTo(pl.pos);
      if (d > 64) m.dead = true;
      else if (sky.daylight > 0.7 && d > 20 && m.age > 20 && Math.random() < dt * 0.15) {
        const h = ctx.world.surfaceY(Math.floor(m.pos.x), Math.floor(m.pos.z));
        if (h >= 0 && m.pos.y >= h - 1) { m.dead = true; ctx.fx.burst(m.pos.x, m.pos.y + 0.5, m.pos.z, [255, 255, 255], 10, 2, 0.6); }
      }
    }
    if (this.t > 0) return;
    this.t = 1.2 + Math.random() * 1.2;
    const night = sky.daylight < 0.4;
    const diff = this.difficulty(pl, night);
    const px = pl.body.x, py = pl.body.y, pz = pl.body.z;
    const surf = ctx.world.surfaceY(Math.floor(px), Math.floor(pz));
    const underground = surf >= 0 && py < surf - 4;
    const fr = ctx.mobs.count('fraction'), vec = ctx.mobs.count('vector');
    const capF = underground ? 7 + Math.floor(diff * 2) : night ? 9 + Math.floor(diff * 3) : 1;
    const capV = night ? 2 + Math.floor(diff) : underground ? 1 : 0;
    if (fr < capF) this.spawnFraction(ctx, px, py, pz, underground, night, diff);
    if (vec < capV && Math.random() < 0.35) this.spawnVector(ctx, px, py, pz, diff);
  }

  private spawnFraction(ctx: MobCtx, px: number, py: number, pz: number, underground: boolean, night: boolean, diff: number) {
    if (!underground && !night) return;
    const w = ctx.world;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 16;
      const x = Math.floor(px + Math.cos(a) * d), z = Math.floor(pz + Math.sin(a) * d);
      let y: number;
      if (underground) {
        y = Math.floor(py + (Math.random() - 0.5) * 24);
        if (y < 3) continue;
      } else {
        y = w.surfaceY(x, z) + 1;
        if (y <= 0) continue;
      }
      const below = w.getBlock(x, y - 1, z), here = w.getBlock(x, y, z), up = w.getBlock(x, y + 1, z), up2 = w.getBlock(x, y + 2, z);
      if (below <= 0 || !SOLID[below] || here !== 0 || up !== 0 || up2 !== 0) continue;
      if (Math.hypot(x - px, y - py, z - pz) < 12) continue;
      const spec = randomFraction(diff);
      ctx.mobs.add(new Fraction(spec.num, spec.den, spec.neg, spec.kind, x + 0.5, y, z + 0.5), ctx);
      return;
    }
  }

  private spawnVector(ctx: MobCtx, px: number, py: number, pz: number, diff: number) {
    const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 10;
    const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    const y = py + 4 + Math.random() * 5;
    const id = ctx.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id !== 0) return;
    ctx.mobs.add(new VectorMob(x, y, z, diff), ctx);
  }
}
