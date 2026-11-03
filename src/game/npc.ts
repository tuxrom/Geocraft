import * as THREE from 'three';
import { newId, type Mob, type MobCtx, type HitInfo } from './mobs';
import { entityTint } from '../gfx/lighting';

const mats = new Map<string, THREE.MeshBasicMaterial>();
const mat = (hex: string) => {
  let m = mats.get(hex);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) }); m.userData.base = m.color.clone(); mats.set(hex, m); }
  return m;
};

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function textTexture(lines: { t: string; size: number; color: string; y: number }[], w: number, h: number, bg: string | null, border?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = `${l.size}px "Press Start 2P", monospace`;
    if (!bg) { g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(l.t, w / 2, l.y); }
    g.fillStyle = l.color; g.fillText(l.t, w / 2, l.y);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

/** Le Professeur Théorème : marchand en robe, lunettes et toque. */
export class Professor implements Mob {
  id = newId();
  kind = 'npc' as const;
  pos = new THREE.Vector3();
  radius = 0.45;
  height = 2;
  hp = 9999;
  maxHp = 9999;
  dead = false;
  age = 0;
  obj = new THREE.Group();
  targetable = false;
  private head = new THREE.Group();
  private bodyG = new THREE.Group();
  private armR = new THREE.Group();
  private tintables: THREE.MeshBasicMaterial[] = [];
  private tag: THREE.Sprite;
  private board: THREE.Mesh;

  constructor(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    const body = this.bodyG;
    box(0.62, 0.7, 0.4, 0, 0.35, 0, '#24307f', body); // bas de la robe
    box(0.52, 0.62, 0.3, 0, 1.0, 0, '#3447c4', body); // buste
    box(0.14, 0.62, 0.08, 0, 1.0, 0.16, '#f4f4f4', body); // chemise
    box(0.1, 0.12, 0.06, 0, 1.22, 0.18, '#b3202a', body); // nœud papillon
    // bras gauche
    const armL = new THREE.Group();
    box(0.18, 0.6, 0.2, 0, -0.25, 0, '#3447c4', armL);
    box(0.16, 0.16, 0.16, 0, -0.62, 0, '#f1c27d', armL);
    armL.position.set(-0.36, 1.25, 0);
    body.add(armL);
    // bras droit (tient une craie)
    box(0.18, 0.6, 0.2, 0, -0.25, 0, '#3447c4', this.armR);
    box(0.16, 0.16, 0.16, 0, -0.62, 0, '#f1c27d', this.armR);
    box(0.05, 0.05, 0.28, 0, -0.62, 0.2, '#ffffff', this.armR);
    this.armR.position.set(0.36, 1.25, 0);
    body.add(this.armR);
    // tête
    box(0.5, 0.5, 0.5, 0, 0, 0, '#f1c27d', this.head);
    box(0.54, 0.16, 0.54, 0, 0.2, -0.02, '#eeeeee', this.head); // cheveux blancs
    box(0.1, 0.34, 0.54, -0.28, -0.03, 0, '#eeeeee', this.head);
    box(0.1, 0.34, 0.54, 0.28, -0.03, 0, '#eeeeee', this.head);
    box(0.4, 0.2, 0.08, 0, -0.2, 0.25, '#e8e8e8', this.head); // barbe
    box(0.12, 0.1, 0.08, 0, -0.03, 0.27, '#d99b61', this.head); // nez
    // lunettes
    box(0.18, 0.16, 0.05, -0.12, 0.06, 0.27, '#ffffff', this.head);
    box(0.18, 0.16, 0.05, 0.12, 0.06, 0.27, '#ffffff', this.head);
    box(0.06, 0.06, 0.06, -0.12, 0.06, 0.29, '#111111', this.head);
    box(0.06, 0.06, 0.06, 0.12, 0.06, 0.29, '#111111', this.head);
    box(0.4, 0.04, 0.05, 0, 0.14, 0.27, '#111111', this.head);
    box(0.4, 0.03, 0.05, 0, -0.02, 0.27, '#111111', this.head);
    // toque carrée
    box(0.36, 0.12, 0.36, 0, 0.34, 0, '#15151f', this.head);
    box(0.78, 0.05, 0.78, 0, 0.42, 0, '#15151f', this.head);
    box(0.04, 0.2, 0.04, 0.34, 0.3, 0.34, '#f5c542', this.head);
    this.head.position.set(0, 1.62, 0);
    body.add(this.head);
    this.obj.add(body);

    // étiquette
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([{ t: 'Professeur Théorème', size: 14, color: '#ffe27a', y: 18 }], 320, 36, null), transparent: true, depthTest: true }));
    this.tag.scale.set(3.2, 0.36, 1);
    this.tag.position.set(0, 2.55, 0);
    this.tag.renderOrder = 45;
    this.obj.add(this.tag);

    // tableau noir derrière
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({
        map: textTexture([
          { t: 'a²+b²=c²', size: 15, color: '#f2f2f2', y: 30 },
          { t: 'π ≈ 3,14159', size: 11, color: '#ffe27a', y: 56 },
          { t: 'Σ  ∫  √  ∞', size: 13, color: '#9fe3ff', y: 84 },
          { t: 'Boutique', size: 11, color: '#9cff9c', y: 110 },
        ], 256, 128, '#1d3b2a', '#8a5a2b'),
      }),
    );
    this.board.position.set(0, 1.55, -0.95);
    this.obj.add(this.board);
    this.obj.position.copy(this.pos);
    this.bodyG.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && !this.tintables.includes(m)) this.tintables.push(m); });
  }

  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1, this.pos.z); }

  update(dt: number, ctx: MobCtx) {
    this.age += dt;
    const p = ctx.player.body;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.obj.position.set(this.pos.x, this.pos.y + Math.sin(this.age * 1.6) * 0.015, this.pos.z);
    const bodyYaw = this.bodyG.rotation.y;
    if (d < 9) {
      const target = Math.atan2(dx, dz);
      let diff = target - bodyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.bodyG.rotation.y += diff * Math.min(1, dt * 3);
    }
    this.head.rotation.y = Math.sin(this.age * 0.7) * 0.15;
    this.armR.rotation.x = -0.3 + Math.sin(this.age * 2.3) * 0.18;
    for (const m of this.tintables) {
      const b = m.userData.base as THREE.Color | undefined;
      if (b) m.color.setRGB(entityTint.r * b.r, entityTint.g * b.g, entityTint.b * b.b);
    }
  }

  hurt(_d: number, _i: HitInfo, ctx: MobCtx): number {
    ctx.fx.text('Aïe, la science !', this.pos.x, this.pos.y + 2.4, this.pos.z, '#ffffff');
    return 0;
  }

  dispose() { /* matériaux partagés */ }
}
