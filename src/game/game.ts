import * as THREE from 'three';
import { World } from '../world/world';
import { Player } from './player';
import { Input, keyId, keyLabel } from './input';
import { Sky } from '../gfx/sky';
import { UI, toggleFullscreen, h } from '../ui/ui';
import { loadSettings, saveSettings, type Action, type Settings } from './settings';
import { loadMeta, loadMods, saveAll, clearSave, type SaveMeta } from './save';
import { buildAtlas } from '../gfx/textures';
import { Inventory } from './inventory';
import { AudioSys, surfaceOf } from './audio';
import { Effects } from './effects';
import { Interaction } from './interaction';
import { Hand } from '../gfx/hand';
import { Hud, weaponHtml } from '../ui/hud';
import { Screens, type Tab } from '../ui/screens';
import { BLOCKS } from '../data/blocks';
import { weaponId, ITEMS } from '../data/items';
import { Mobs, Spawner, type MobCtx } from './mobs';
import { Projectiles } from './projectiles';
import { Combat } from './combat';
import { Professor } from './npc';
import { EquationBoss } from './boss';
import { HUB_X, HUB_Z, HUB_H } from '../world/gen';

export type Mode = 'init' | 'title' | 'loading' | 'play' | 'pause' | 'dead';

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  settings: Settings = loadSettings();
  input: Input;
  ui: UI;
  sky: Sky;
  audio: AudioSys;
  player = new Player();
  inv = new Inventory();
  hand = new Hand();
  world!: World;
  fx!: Effects;
  interaction!: Interaction;
  mobs!: Mobs;
  proj!: Projectiles;
  combat!: Combat;
  spawner = new Spawner();
  mobCtx!: MobCtx;
  hud!: Hud;
  screens!: Screens;
  mode: Mode = 'init';
  screenOpen = false;
  meta: SaveMeta | null = null;
  private last = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 0;
  elapsed = 0;
  playTime = 0;
  private orbit = 0;
  private saveT = 0;
  private regenT = 0;
  private sinceHurt = 99;
  private extras: ((dt: number) => void)[] = [];

  constructor() {
    THREE.ColorManagement.enabled = false;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.autoClear = true;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 600);
    this.scene.add(this.camera);
    buildAtlas();
    this.sky = new Sky(this.scene, this.camera);
    this.input = new Input(this.settings, this.canvas);
    this.audio = new AudioSys(this.settings);
    this.ui = new UI(document.getElementById('ui')!, this.settings, {
      onPlay: () => void this.play(),
      onNewWorld: () => void this.newWorld(),
      onResume: () => this.resume(),
      onQuitToTitle: () => this.toTitle(),
      onSettingsChanged: () => this.applySettings(),
    });
    this.hud = new Hud(this.ui.hud, this.inv, () => this.keyLabels());
    this.screens = new Screens(this.ui, this.inv, {
      creative: () => this.settings.creative,
      onClose: () => this.onScreenClosed(),
      dropItem: (s) => this.dropFromPlayer(s.id, s.n),
      sfx: (n) => this.audio.sfx(n),
    });
    this.screens.onInvChange = () => this.hud.refresh();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'play' && !this.screenOpen) this.openPause();
    };
    this.input.onRawKey = (e) => this.onKeyDown(e);
    this.canvas.addEventListener('click', () => {
      this.audio.init();
      if (this.mode === 'play' && !this.input.locked && !this.screenOpen) this.input.lock();
    });
    document.addEventListener('fullscreenchange', () => this.resize());
    window.addEventListener('beforeunload', () => { void this.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) void this.saveNow(); });
    this.player.onFall = (d) => this.hurt(d, 'chute');
    this.player.onStep = () => {
      const b = this.player.body;
      const id = this.world.getBlock(Math.floor(b.x), Math.floor(b.y - 0.1), Math.floor(b.z));
      this.audio.sfx('step', this.player.sprinting ? 0.9 : 0.6, surfaceOf(BLOCKS[Math.max(0, id)]));
    };
    this.player.onJump = () => this.audio.sfx('jump', 0.6);
  }

  keyLabels(): Record<string, string> {
    const k = this.settings.keys;
    const l = (a: Action) => keyLabel(k[a][0]);
    return { forward: l('forward'), back: l('back'), left: l('left'), right: l('right'), jump: l('jump'), sprint: l('sprint'), crouch: l('crouch'), inventory: l('inventory'), craft: l('craft'), interact: l('interact'), adjust: l('adjust') };
  }

  async init() {
    try { await Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('16px "Press Start 2P"', 'π√²')]); } catch { /* police système */ }
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
    if (this.world) { this.world.dispose(); this.fx.clearDrops(); }
    this.world = new World(this.scene, seed);
    this.world.setMods(mods);
    this.world.renderDistance = this.settings.renderDistance;
    this.fx = new Effects(this.scene, this.world, this.audio);
    this.interaction = new Interaction(this.scene, this.world, this.player, this.input, this.inv, this.fx, this.audio, this.ui, this.hand);
    if (this.mobs) { this.mobs.clear(); this.proj.clear(); }
    this.mobs = new Mobs(this.scene);
    this.proj = new Projectiles(this.scene, this.world, this.fx);
    const g = this;
    this.mobCtx = {
      world: this.world, player: this.player, fx: this.fx, audio: this.audio, mobs: this.mobs,
      hurtPlayer: (amount, from, slow) => this.hurtPlayer(amount, from, slow),
      difficulty: () => g.spawner.difficulty(g.player, g.sky.isNight),
      get night() { return g.sky.isNight; },
      get time() { return g.elapsed; },
    };
    this.mobCtx.onBossEvent = (ev, m) => {
      if (ev === 'phase') this.ui.toast(`${m.hp > 0 ? 'Nouvelle équation ! Trouvez et frappez les racines.' : ''}`, 2800);
      else if (ev === 'defeat') { this.ui.toast('Q.E.D. : l’équation est résolue !', 4000); this.settingsBossKills++; }
    };
    this.interaction.onAltar = (x, y, z) => this.summonBoss(x, y, z);
    this.combat = new Combat(this.world, this.player, this.input, this.inv, this.interaction, this.hand, this.audio, this.fx, this.mobs, this.proj, this.ui, () => this.mobCtx, (n) => this.heal(n));
    this.onWorldCreated();
  }

  /** Extension pour les jalons suivants. */
  protected onWorldCreated() { /* surchargé */ }
  addSystem(fn: (dt: number) => void) { this.extras.push(fn); }

  applySettings() {
    this.world.renderDistance = this.settings.renderDistance;
    this.camera.fov = this.settings.fov;
    this.camera.far = Math.max(200, this.settings.renderDistance * 16 + 220);
    this.camera.updateProjectionMatrix();
    this.sky.cloudsOn = this.settings.clouds;
    this.player.creative = this.settings.creative;
    this.audio.apply();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hand.resize(w / h);
  }

  // ---------------------------------------------------------------- états
  async newWorld() {
    await clearSave();
    this.meta = null;
    this.inv.clear();
    await this.createWorld(Math.floor(Math.random() * 2 ** 31) | 0, {});
    this.applySettings();
    await this.play();
  }

  starterKit() {
    this.inv.clear();
    this.inv.slots[0] = { id: weaponId('droite', 'bois'), n: 1 };
    this.inv.slots[1] = { id: weaponId('racine', 'bois'), n: 1 };
    this.inv.changed();
  }

  async play() {
    this.input.lock();
    this.audio.init();
    this.mode = 'loading';
    this.ui.setHudVisible(false);
    const ld = this.ui.loading();
    const sp = this.world.terrain.spawn();
    const p = this.meta?.player;
    const px = p?.x ?? sp.x, pz = p?.z ?? sp.z;
    await new Promise<void>((res) => {
      const tick = () => {
        this.world.update(px, pz);
        const r = this.world.readyCount(px, pz, 2);
        ld.set(Math.min(1, r.ready / r.total));
        if (r.ready >= r.total) res(); else setTimeout(tick, 30);
      };
      tick();
    });
    if (this.meta) {
      this.inv.fromJSON(this.meta.inventory as { id: string; n: number }[]);
      this.inv.selected = this.meta.hotbar ?? 0;
      this.sky.time = this.meta.time;
      this.playTime = this.meta.playTime ?? 0;
    } else {
      this.starterKit();
      this.sky.time = 0.08;
      this.playTime = 0;
    }
    if (p) {
      this.player.teleport(p.x, p.y, p.z);
      this.player.yaw = p.yaw; this.player.pitch = p.pitch; this.player.health = p.health;
    } else {
      this.respawn(true);
    }
    this.player.dead = false;
    this.afterLoad();
    this.hud.refresh();
    this.ui.close();
    this.ui.setHudVisible(true);
    this.mode = 'play';
    this.input.enabled = true;
    for (let i = 0; i < 20 && !this.input.locked; i++) await new Promise((r) => setTimeout(r, 50));
    if (!this.input.locked && this.mode === 'play') this.openPause();
    else if (!this.settings.helpSeen) {
      this.settings.helpSeen = true;
      saveSettings(this.settings);
      this.screenOpen = true;
      this.input.unlock();
      this.hud.showHelp(() => { this.screenOpen = false; this.input.lock(); });
    }
  }

  respawn(first = false) {
    const sp = this.world.terrain.spawn();
    const y = this.world.surfaceY(Math.floor(sp.x), Math.floor(sp.z)) + 1;
    this.player.teleport(sp.x, y + 0.01, sp.z);
    if (first) this.player.yaw = Math.PI * 0.25;
    this.player.health = this.player.maxHealth;
  }

  prof: Professor | null = null;
  settingsBossKills = 0;

  protected afterLoad() {
    this.mobs.clear();
    this.prof = new Professor(HUB_X + 0.5, HUB_H + 1, HUB_Z - 1.5);
    this.mobs.add(this.prof);
  }

  openPause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.input.enabled = false;
    this.input.unlock();
    this.ui.pause();
    void this.saveNow();
  }

  resume() {
    this.ui.close();
    this.mode = 'play';
    this.input.enabled = true;
    this.input.lock();
  }

  toTitle() {
    void this.saveNow();
    this.mode = 'title';
    this.input.enabled = false;
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.meta = { ...(this.collectMeta()) };
    this.ui.title(true);
  }

  // ------------------------------------------------------------ écrans
  openScreen(tab: Tab) {
    if (this.mode !== 'play' || this.screenOpen) return;
    this.screenOpen = true;
    this.input.unlock();
    this.screens.show(tab);
  }

  closeScreen() {
    if (!this.screenOpen) return;
    this.screens.close();
  }

  private onScreenClosed() {
    this.screenOpen = false;
    if (this.mode === 'play') this.input.lock();
  }

  dropFromPlayer(id: string, n: number) {
    const e = this.player.eyePos();
    const d = this.player.lookDir();
    this.fx.spawnDrop(id, n, e.x + d.x * 0.5, e.y - 0.3, e.z + d.z * 0.5, d.x * 4, 2, d.z * 4);
    this.fx.drops[this.fx.drops.length - 1].delay = 1.5;
  }

  protected onKeyDown(e: KeyboardEvent): boolean | void {
    const id = keyId(e);
    const k = this.settings.keys;
    if (id === 'F11') { e.preventDefault(); toggleFullscreen(); return true; }
    if (e.repeat) return;
    if (this.mode === 'pause' && id === 'Escape') { this.resume(); return true; }
    if (this.mode === 'play') {
      if (this.screenOpen) {
        if (id === 'Escape' || k.inventory.includes(id) || (this.screens.tab === 'craft' && k.craft.includes(id))) {
          if (this.hud.helpEl) return;
          this.closeScreen();
          e.preventDefault();
          return true;
        }
        return;
      }
      if (this.input.locked) {
        if (k.inventory.includes(id)) { e.preventDefault(); this.openScreen('inv'); return true; }
        if (k.craft.includes(id)) { e.preventDefault(); this.openScreen('craft'); return true; }
      }
    }
  }

  // ----------------------------------------------------------- santé
  hurt(amount: number, _src = '') {
    if (this.settings.creative || this.player.dead || this.mode === 'dead') return;
    if (this.player.invuln > 0) return;
    this.player.health = Math.max(0, this.player.health - amount);
    this.player.invuln = 0.45;
    this.sinceHurt = 0;
    this.ui.flashDamage();
    this.audio.sfx('hurt');
    if (this.player.health <= 0) this.die();
  }

  summonBoss(x: number, y: number, z: number) {
    if (this.mobs.list.some((m) => m.kind === 'boss' && !m.dead)) { this.ui.toast('Une équation est déjà éveillée.'); return; }
    const diff = this.spawner.difficulty(this.player, false);
    const b = new EquationBoss(x + 0.5, y + 8, z + 0.5, diff, this.proj);
    this.mobs.add(b);
    this.audio.sfx('roar', 1);
    this.ui.toast('L’autel s’illumine : une équation s’éveille ! Frappez ses racines lumineuses.', 4000);
  }

  /** Dégâts infligés par un ennemi : bouclier, recul et ralentissement. */
  hurtPlayer(amount: number, from?: THREE.Vector3, slow = 0) {
    if (this.player.dead || this.mode !== 'play') return;
    const a = this.combat.mitigate(amount, from);
    const before = this.player.health;
    this.hurt(a, 'ennemi');
    if (this.player.health < before || this.settings.creative) {
      const b = this.player.body;
      if (from) {
        const dx = b.x - from.x, dz = b.z - from.z, d = Math.hypot(dx, dz) || 1;
        b.vx += (dx / d) * 5; b.vz += (dz / d) * 5; b.vy = Math.max(b.vy, 4);
      }
      if (slow > 0) { this.player.speedMul = 0.55; this.player.slowTimer = slow; }
    }
  }

  heal(n: number) { this.player.health = Math.min(this.player.maxHealth, this.player.health + n); }

  die() {
    this.player.dead = true;
    this.mode = 'dead';
    this.input.enabled = false;
    this.input.unlock();
    this.audio.sfx('die');
    const el = h('div', 'screen');
    el.style.background = 'rgba(120,0,0,0.55)';
    el.innerHTML = '<div style="font-size:22px;text-shadow:3px 3px 0 #000">Vous êtes tombé !</div><div style="font-size:10px">Un monstre vous a ramené à zéro...</div>';
    const b = h('button', 'btn green', 'Réapparaître');
    b.onclick = () => {
      this.ui.close();
      this.respawn();
      this.mobs.clear(); this.proj.clear();
      this.player.dead = false;
      this.mode = 'play';
      this.input.enabled = true;
      this.input.lock();
      this.onRespawn();
    };
    el.append(b);
    this.ui.show(el);
  }

  protected onRespawn() { /* surchargé */ }

  // ---------------------------------------------------------- sauvegarde
  collectMeta(): SaveMeta {
    const b = this.player.body;
    return {
      version: 1, seed: this.world.seed, time: this.sky.time, playTime: this.playTime,
      player: { x: b.x, y: b.y, z: b.z, yaw: this.player.yaw, pitch: this.player.pitch, health: this.player.health },
      inventory: this.inv.toJSON(), hotbar: this.inv.selected, creative: this.settings.creative,
      savedAt: Date.now(),
    };
  }

  async saveNow() {
    if (this.mode === 'init' || this.mode === 'loading' || !this.world) return;
    if (this.mode === 'title' && !this.meta) return;
    const mods = new Map<string, number[]>();
    for (const k of this.world.dirtyChunks) {
      const m = this.world.mods.get(k);
      if (!m) continue;
      const arr: number[] = [];
      for (const [i, v] of m) arr.push(i, v);
      mods.set(String(k), arr);
    }
    this.world.dirtyChunks.clear();
    await saveAll(this.collectMeta(), mods);
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
    else if (this.mode === 'play' || this.mode === 'pause' || this.mode === 'dead') this.updateGame(dt);

    this.sky.update(this.mode === 'pause' ? 0 : dt, this.world.renderDistance);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'play' || this.mode === 'pause') {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.hand.scene, this.hand.camera);
      this.renderer.autoClear = true;
    }
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
    const playing = this.mode === 'play';
    const active = playing && this.input.locked && this.input.enabled && !this.screenOpen;
    if (playing) {
      this.playTime += dt;
      p.update(dt, this.world, this.input, this.settings, this.elapsed);
      // barre rapide
      if (active) {
        if (this.input.wheel) {
          this.inv.selected = (this.inv.selected + (this.input.wheel > 0 ? 1 : 8)) % 9;
          this.hud.refresh();
        }
        if (this.input.digit >= 0) { this.inv.selected = this.input.digit; this.hud.refresh(); }
      }
      this.sinceHurt += dt;
      if (this.sinceHurt > 6 && p.health < p.maxHealth && !p.dead) {
        this.regenT += dt;
        if (this.regenT > 3) { this.regenT = 0; p.health = Math.min(p.maxHealth, p.health + 1); }
      }
      this.combat.update(dt, active, this.settings.creative);
      this.interaction.update(dt, active, this.settings.creative);
      this.spawner.playTime = this.playTime;
      this.mobs.update(dt, this.mobCtx);
      this.proj.update(dt, this.mobCtx, this.mobs);
      this.spawner.update(dt, this.mobCtx, this.sky);
      this.updateNpcPrompt(active);
      for (const fn of this.extras) fn(dt);
      this.fx.update(dt, p, this.inv, this.settings.creative);
      this.autosave(dt);
    }
    this.world.update(p.body.x, p.body.z);
    // main
    const held = this.inv.held?.id ?? null;
    this.hand.set(held);
    this.hand.update(dt, Math.min(1, Math.hypot(p.body.vx, p.body.vz) / 4) * (p.body.onGround ? 1 : 0), p.sprinting);
    const boss = this.mobs.list.find((m) => m.kind === 'boss' && !m.dead);
    this.hud.setBoss(boss ? (boss as EquationBoss).name : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.setHealth(p.health, p.maxHealth);
    this.hud.update(dt);
    this.hud.clickMsg.classList.toggle('hidden', !(playing && !this.input.locked && !this.screenOpen && this.mode === 'play'));
    this.audio.update(this.elapsed, this.sky.isNight, playing);
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
      this.ui.info.innerHTML = `${this.fps.toFixed(0)} i/s<br>XYZ ${p.body.x.toFixed(1)} ${p.body.y.toFixed(1)} ${p.body.z.toFixed(1)}<br>Chunks ${st.chunks} · ${Math.round(st.tris / 1000)}k triangles<br>Heure ${String(Math.floor((this.sky.time * 24 + 6) % 24)).padStart(2, '0')}h`;
    } else this.ui.info.classList.add('hidden');
    this.hud.setWeaponInfo(weaponHtml(held, this.combat.info()));
  }

  private updateNpcPrompt(active: boolean) {
    const pr = this.prof;
    let near = false;
    if (pr && active) {
      const b = this.player.body;
      near = Math.hypot(b.x - pr.pos.x, b.z - pr.pos.z) < 3.6 && Math.abs(b.y - pr.pos.y) < 2.5;
    }
    this.hud.setHint(near ? `[${keyLabel(this.settings.keys.interact[0])}] Parler au Professeur Théorème` : null);
    if (near && this.input.wasPressed('interact')) { this.audio.sfx('bell', 0.4); this.openScreen('shop'); }
  }

  private autosave(dt: number) {
    this.saveT += dt;
    if (this.saveT > 15) { this.saveT = 0; void this.saveNow(); }
  }

  saveSettingsNow() { saveSettings(this.settings); }
  itemLabel(id: string) { return ITEMS[id].label; }
}
