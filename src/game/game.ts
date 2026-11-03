import * as THREE from 'three';
import { World } from '../world/world';
import { Player } from './player';
import { Input } from './input';
import { Sky } from '../gfx/sky';
import { UI, toggleFullscreen } from '../ui/ui';
import { loadSettings, saveSettings, type Settings } from './settings';
import { loadMeta, loadMods, type SaveMeta } from './save';
import { buildAtlas } from '../gfx/textures';

export type Mode = 'init' | 'title' | 'loading' | 'play' | 'pause';

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  settings: Settings = loadSettings();
  input: Input;
  ui: UI;
  sky: Sky;
  player = new Player();
  world!: World;
  mode: Mode = 'init';
  meta: SaveMeta | null = null;
  private last = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 0;
  elapsed = 0;
  private orbit = 0;

  constructor() {
    THREE.ColorManagement.enabled = false;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 600);
    this.scene.add(this.camera);
    buildAtlas();
    this.sky = new Sky(this.scene, this.camera);
    this.input = new Input(this.settings, this.canvas);
    this.ui = new UI(document.getElementById('ui')!, this.settings, {
      onPlay: () => void this.play(),
      onNewWorld: () => void this.newWorld(),
      onResume: () => this.resume(),
      onQuitToTitle: () => this.toTitle(),
      onSettingsChanged: () => this.applySettings(),
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'play') this.openPause();
    };
    this.input.onRawKey = (e) => this.onKeyDown(e);
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'play' && !this.input.locked && !this.ui.screen) this.input.lock();
    });
    document.addEventListener('fullscreenchange', () => this.resize());
  }

  async init() {
    this.meta = await loadMeta();
    const seed = this.meta?.seed ?? (Math.floor(Math.random() * 2 ** 31) | 0);
    await this.createWorld(seed, this.meta ? await loadMods() : {});
    this.mode = 'title';
    this.ui.title(!!this.meta);
    this.applySettings();
    this.last = performance.now();
    requestAnimationFrame(() => this.frame());
  }

  protected async createWorld(seed: number, mods: Record<string, number[]>) {
    if (this.world) this.world.dispose();
    this.world = new World(this.scene, seed);
    this.world.setMods(mods);
    this.world.renderDistance = this.settings.renderDistance;
  }

  applySettings() {
    this.world.renderDistance = this.settings.renderDistance;
    this.camera.fov = this.settings.fov;
    this.camera.far = Math.max(200, this.settings.renderDistance * 16 + 220);
    this.camera.updateProjectionMatrix();
    this.sky.cloudsOn = this.settings.clouds;
    this.player.creative = this.settings.creative;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- états
  async newWorld() {
    const { clearSave } = await import('./save');
    await clearSave();
    this.meta = null;
    await this.createWorld(Math.floor(Math.random() * 2 ** 31) | 0, {});
    this.applySettings();
    await this.play();
  }

  async play() {
    this.input.lock();
    this.mode = 'loading';
    this.ui.setHudVisible(false);
    const ld = this.ui.loading();
    const sp = this.world.terrain.spawn();
    const p = this.meta?.player;
    const px = p?.x ?? sp.x, pz = p?.z ?? sp.z;
    // attend les chunks proches
    await new Promise<void>((res) => {
      const tick = () => {
        this.world.update(px, pz);
        const r = this.world.readyCount(px, pz, 2);
        ld.set(Math.min(1, r.ready / r.total));
        if (r.ready >= r.total) res(); else setTimeout(tick, 30);
      };
      tick();
    });
    if (p) {
      this.player.teleport(p.x, p.y, p.z);
      this.player.yaw = p.yaw; this.player.pitch = p.pitch; this.player.health = p.health;
    } else {
      const y = this.world.surfaceY(Math.floor(sp.x), Math.floor(sp.z)) + 1;
      this.player.teleport(sp.x, y + 0.01, sp.z);
      this.player.yaw = Math.PI * 0.25; // face à la cabane
    }
    this.afterLoad();
    this.ui.close();
    this.ui.setHudVisible(true);
    this.mode = 'play';
    this.input.enabled = true;
    // le verrouillage du pointeur est asynchrone : on lui laisse un court délai
    for (let i = 0; i < 20 && !this.input.locked; i++) await new Promise((r) => setTimeout(r, 50));
    if (!this.input.locked && this.mode === 'play') this.openPause();
  }

  /** Point d'extension pour les jalons suivants. */
  protected afterLoad() { /* surchargé */ }

  openPause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.input.enabled = false;
    this.input.unlock();
    this.ui.pause();
  }

  resume() {
    this.ui.close();
    this.mode = 'play';
    this.input.enabled = true;
    this.input.lock();
  }

  toTitle() {
    this.mode = 'title';
    this.input.enabled = false;
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.ui.title(true);
  }

  protected onKeyDown(e: KeyboardEvent): boolean | void {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
      return true;
    }
    if (e.key === 'Escape' && this.mode === 'pause') {
      // dans le menu pause, Échap reprend la partie
      this.resume();
      return true;
    }
  }

  // ---------------------------------------------------------------- boucle
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }

    if (this.mode === 'title' || this.mode === 'loading') this.updateTitle(dt);
    else if (this.mode === 'play' || this.mode === 'pause') this.updateGame(dt);

    this.sky.update(dt, this.world.renderDistance);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    requestAnimationFrame(() => this.frame());
  }

  private updateTitle(dt: number) {
    this.orbit += dt * 0.08;
    const c = { x: 10, z: 10 };
    const r = 34;
    this.world.update(c.x, c.z);
    this.camera.position.set(c.x + Math.cos(this.orbit) * r, 66, c.z + Math.sin(this.orbit) * r);
    this.camera.lookAt(c.x, 50, c.z);
  }

  protected updateGame(dt: number) {
    const p = this.player;
    if (this.mode === 'play') {
      p.update(dt, this.world, this.input, this.settings, this.elapsed);
    }
    this.world.update(p.body.x, p.body.z);
    // caméra
    p.eyePos(this.camera.position);
    this.camera.position.y += Math.sin(p.bob) * 0.03 * Math.min(1, Math.hypot(p.body.vx, p.body.vz) / 4);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    const targetFov = this.settings.fov + (p.sprinting ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    this.ui.waterOverlay.classList.toggle('hidden', !p.headInWater);
    if (this.settings.showFps) {
      const st = this.world.stats();
      this.ui.info.classList.remove('hidden');
      this.ui.info.innerHTML = `${this.fps.toFixed(0)} i/s<br>XYZ ${p.body.x.toFixed(1)} ${p.body.y.toFixed(1)} ${p.body.z.toFixed(1)}<br>Chunks ${st.chunks} · ${Math.round(st.tris / 1000)}k triangles`;
    } else this.ui.info.classList.add('hidden');
  }

  saveSettingsNow() { saveSettings(this.settings); }
}
