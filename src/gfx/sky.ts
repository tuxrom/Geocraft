import * as THREE from 'three';
import { worldUniforms } from './worldMaterial';
import { applyEntityTint } from './lighting';
import { mulberry32 } from '../core/rng';
import { smooth, lerp } from '../core/constants';

function pixelTexture(draw: (c: CanvasRenderingContext2D) => void, size = 16): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export const DAY_LENGTH = 720; // secondes pour un cycle complet

export class Sky {
  time = 0.08; // 0 lever, 0.25 midi, 0.5 coucher, 0.75 minuit
  frozen = false;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private cloudMeshes: THREE.Mesh[] = [];
  private cloudMat: THREE.MeshBasicMaterial;
  private cloudSpan = 24 * 12;
  private cloudTime = 0;
  cloudsOn = true;
  daylight = 1;
  readonly skyColor = new THREE.Color();
  readonly fogColor = new THREE.Color();
  private tmp = new THREE.Color();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    scene.fog = new THREE.Fog(0xffffff, 60, 120);
    const sunTex = pixelTexture((c) => {
      c.fillStyle = '#fff6b0'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#ffe14a'; c.fillRect(2, 2, 12, 12);
      c.fillStyle = '#fffbe0'; c.fillRect(4, 4, 8, 8);
    });
    const moonTex = pixelTexture((c) => {
      c.fillStyle = '#d7dbe6'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#b9bfcf';
      for (const [x, y, w, h] of [[3, 3, 3, 3], [9, 6, 4, 3], [5, 10, 3, 3], [11, 11, 2, 2]]) c.fillRect(x, y, w, h);
    });
    const mk = (tex: THREE.Texture, size: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, color: 0xffffff }),
      );
      m.renderOrder = -10;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.sun = mk(sunTex, 70);
    this.moon = mk(moonTex, 50);

    const rnd = mulberry32(777);
    const sp = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = r * Math.cos(th) * 450; sp[i * 3 + 1] = u * 450; sp[i * 3 + 2] = r * Math.sin(th) * 450;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -11;
    scene.add(this.stars);

    this.cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, fog: true });
    this.buildClouds();
  }

  private buildClouds() {
    const N = 24, S = 12, H = 5;
    const grid = new Uint8Array(N * N);
    const rnd = mulberry32(4242);
    for (let b = 0; b < 15; b++) {
      const bx = rnd() * N, bz = rnd() * N, rx = 2 + rnd() * 3.2, rz = 1.5 + rnd() * 2.5;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let dx = Math.abs(i - bx); dx = Math.min(dx, N - dx);
        let dz = Math.abs(j - bz); dz = Math.min(dz, N - dz);
        if ((dx / rx) ** 2 + (dz / rz) ** 2 < 1 - rnd() * 0.25) grid[j * N + i] = 1;
      }
    }
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    let n = 0;
    const has = (i: number, j: number) => grid[((j + N) % N) * N + ((i + N) % N)] === 1;
    const quad = (p: number[], c: number) => {
      for (let k = 0; k < 4; k++) { pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]); col.push(c, c, c); }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!has(i, j)) continue;
      const x0 = i * S, x1 = x0 + S, z0 = j * S, z1 = z0 + S, y0 = 0, y1 = H;
      quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 1);
      quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], 0.72);
      if (!has(i + 1, j)) quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 0.86);
      if (!has(i - 1, j)) quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], 0.86);
      if (!has(i, j + 1)) quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0.8);
      if (!has(i, j - 1)) quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(N * S / 2, 0, N * S / 2), N * S);
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(g, this.cloudMat);
      m.frustumCulled = false;
      this.scene.add(m);
      this.cloudMeshes.push(m);
    }
    this.cloudSpan = N * S;
  }

  /** Vrai de nuit. */
  get isNight(): boolean { return this.daylight < 0.35; }

  update(dt: number, renderDist: number) {
    if (!this.frozen) this.time = (this.time + dt / DAY_LENGTH) % 1;
    this.cloudTime += dt;
    worldUniforms.time.value += dt;
    const phi = this.time * Math.PI * 2;
    const e = Math.sin(phi);
    const d = smooth(-0.14, 0.22, e);
    this.daylight = d;

    // couleurs
    const day = this.tmp.setRGB(0.47, 0.66, 1.0);
    const night = new THREE.Color(0.012, 0.018, 0.06);
    this.skyColor.copy(night).lerp(day, d);
    const dusk = Math.max(0, 1 - Math.abs(e) / 0.3) * (0.5 + 0.5 * Math.min(1, d + 0.3));
    this.skyColor.lerp(new THREE.Color(0.95, 0.5, 0.3), dusk * 0.55);
    this.fogColor.copy(this.skyColor).lerp(new THREE.Color(0.8, 0.85, 0.95), 0.12 * d);
    this.scene.background = this.skyColor;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.fogColor);
    const far = renderDist * 16;
    fog.near = far * 0.55; fog.far = far * 0.98;
    worldUniforms.fogColor.value.copy(this.fogColor);
    worldUniforms.fogNear.value = fog.near;
    worldUniforms.fogFar.value = fog.far;
    worldUniforms.dayLight.value = lerp(0.27, 1, d);
    const warm = Math.max(0, 1 - Math.abs(e) / 0.3) * 0.5;
    worldUniforms.tint.value.setRGB(lerp(0.78, 1, d) + warm * 0.15, lerp(0.84, 1, d) - warm * 0.05, lerp(1, 1, d) - warm * 0.2);
    applyEntityTint(worldUniforms.dayLight.value, worldUniforms.tint.value);

    // astres
    const cam = this.camera.position;
    const sd = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0.28).normalize();
    this.sun.position.copy(cam).addScaledVector(sd, 400);
    this.sun.lookAt(cam);
    this.moon.position.copy(cam).addScaledVector(sd, -400);
    this.moon.lookAt(cam);
    (this.sun.material as THREE.MeshBasicMaterial).opacity = smooth(-0.25, 0.0, e);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = smooth(-0.0, -0.25, e) * 0.95 + 0.0;
    this.starMat.opacity = smooth(0.05, -0.3, e) * 0.9;
    this.stars.position.copy(cam);
    this.stars.rotation.z = phi;

    // nuages
    for (const m of this.cloudMeshes) m.visible = this.cloudsOn;
    if (this.cloudsOn) {
      const S = this.cloudSpan;
      const off = (this.cloudTime * 1.4) % S;
      const baseX = Math.floor((cam.x - off) / S) * S + off;
      const baseZ = Math.floor(cam.z / S) * S;
      let k = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        this.cloudMeshes[k++].position.set(baseX + i * S, 124, baseZ + j * S);
      }
      this.cloudMat.color.setScalar(lerp(0.22, 1, d));
    }
  }
}
