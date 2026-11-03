import { ACTION_LABELS, DEFAULT_KEYS, saveSettings, type Action, type Settings } from '../game/settings';
import { keyId, keyLabel } from '../game/input';

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const LETTERS: Record<string, string[]> = {
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

function letterCanvas(ch: string): HTMLCanvasElement {
  const S = 12;
  const c = document.createElement('canvas');
  c.width = 5 * S; c.height = 7 * S;
  const g = c.getContext('2d')!;
  const rows = LETTERS[ch];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    if (rows[y][x] !== '#') continue;
    const grass = y < 2;
    const base = grass ? [92, 168, 52] : [128, 128, 128];
    const k = (n: number) => `rgb(${base.map((v) => Math.min(255, v * n) | 0).join(',')})`;
    g.fillStyle = k(1); g.fillRect(x * S, y * S, S, S);
    g.fillStyle = k(1.25); g.fillRect(x * S, y * S, S, 2); g.fillRect(x * S, y * S, 2, S);
    g.fillStyle = k(0.6); g.fillRect(x * S, y * S + S - 2, S, 2); g.fillRect(x * S + S - 2, y * S, 2, S);
    // grains
    g.fillStyle = k(0.85);
    g.fillRect(x * S + 4 + ((x * 7 + y * 3) % 4), y * S + 4 + ((x * 5 + y) % 4), 2, 2);
  }
  return c;
}

export interface UICallbacks {
  onPlay(): void;
  onNewWorld(): void;
  onResume(): void;
  onQuitToTitle(): void;
  onSettingsChanged(): void;
  onPlatform(p: 'pc' | 'mobile'): void;
}

export class UI {
  root: HTMLElement;
  screen: HTMLElement | null = null;
  hud: HTMLElement;
  crosshair: HTMLElement;
  info: HTMLElement;
  toastEl: HTMLElement;
  damage: HTMLElement;
  waterOverlay: HTMLElement;
  private toastTimer = 0;
  settings: Settings;
  cb: UICallbacks;

  constructor(root: HTMLElement, settings: Settings, cb: UICallbacks) {
    this.root = root;
    this.settings = settings;
    this.cb = cb;
    this.hud = h('div');
    this.hud.id = 'hud';
    this.crosshair = h('div');
    this.crosshair.id = 'crosshair';
    this.info = h('div');
    this.info.id = 'info';
    this.toastEl = h('div');
    this.toastEl.id = 'toast';
    this.damage = h('div');
    this.damage.id = 'damage';
    this.waterOverlay = h('div');
    this.waterOverlay.id = 'water';
    this.waterOverlay.classList.add('hidden');
    this.hud.append(this.waterOverlay, this.damage, this.crosshair, this.info, this.toastEl);
    root.append(this.hud);
    this.setHudVisible(false);
  }

  setHudVisible(v: boolean) { this.hud.classList.toggle('hidden', !v); }

  toast(msg: string, ms = 2200) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }

  flashDamage() {
    this.damage.style.transition = 'none';
    this.damage.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.damage.style.transition = 'opacity 0.5s';
      this.damage.style.opacity = '0';
    }));
  }

  close() {
    if (this.screen) { this.screen.remove(); this.screen = null; }
  }

  show(el: HTMLElement) {
    this.close();
    this.screen = el;
    this.root.append(el);
  }

  // ----------------------------------------------------------- chargement
  loading(): { set: (p: number, msg?: string) => void } {
    const el = h('div', 'screen');
    el.id = 'loading';
    const t = h('div', '', 'Génération du monde...');
    const bar = h('div', 'progress');
    const fill = h('i');
    bar.append(fill);
    el.append(t, bar);
    this.show(el);
    return { set: (p, msg) => { fill.style.width = `${Math.round(p * 100)}%`; if (msg) t.textContent = msg; } };
  }

  // ------------------------------------------------- choix de la plateforme
  platformChoice(onDone: () => void) {
    const el = h('div', 'screen');
    el.id = 'title';
    el.style.background = 'rgba(0,0,0,0.55)';
    const logo = h('div', 'logo');
    for (const ch of 'GEOCRAFT') logo.append(letterCanvas(ch));
    const q = h('div', 'subtitle', 'Comment jouez-vous ?');
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const row = h('div', 'row');
    row.style.flexWrap = 'wrap';
    row.style.justifyContent = 'center';
    const mk = (p: 'pc' | 'mobile', title: string, sub: string) => {
      const b = h('button', 'btn' + ((p === 'mobile') === coarse ? ' green' : ''), `${title}<br><span style="font-size:8px;line-height:2">${sub}</span>`);
      b.style.minWidth = '230px';
      b.onclick = () => { this.cb.onPlatform(p); onDone(); };
      row.append(b);
    };
    mk('pc', 'Ordinateur', 'Clavier et souris');
    mk('mobile', 'Mobile', 'Écran tactile');
    const note = h('div', 'footer', 'Ce choix se change à tout moment dans Options.');
    el.append(logo, q, row, note);
    this.show(el);
  }

  // ----------------------------------------------------------------- titre
  title(hasSave: boolean) {
    const el = h('div', 'screen');
    el.id = 'title';
    const logo = h('div', 'logo');
    for (const ch of 'GEOCRAFT') logo.append(letterCanvas(ch));
    const sub = h('div', 'subtitle', 'Le bac à sable des mathématiques');
    const menu = h('div', 'menu');
    const play = h('button', 'btn green', hasSave ? 'Continuer' : 'Jouer');
    play.onclick = () => this.cb.onPlay();
    menu.append(play);
    if (hasSave) {
      const nw = h('button', 'btn', 'Nouveau monde');
      nw.onclick = () => {
        if (confirm('Repartir d’un monde neuf efface définitivement votre sauvegarde. Continuer ?')) this.cb.onNewWorld();
      };
      menu.append(nw);
    }
    const opt = h('button', 'btn', 'Options');
    opt.onclick = () => this.options(() => this.title(hasSave));
    menu.append(opt);
    const lab = h('label', 'check');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = this.settings.creative;
    cb.onchange = () => { this.settings.creative = cb.checked; saveSettings(this.settings); this.cb.onSettingsChanged(); };
    lab.append(cb, document.createTextNode('Mode créatif (vol, inventaire complet)'));
    menu.append(lab);
    const plat = h('button', 'btn small', `Plateforme : ${this.settings.platform === 'mobile' ? 'Mobile' : 'Ordinateur'} (changer)`);
    plat.onclick = () => this.platformChoice(() => this.title(hasSave));
    menu.append(plat);
    const foot = h('div', 'footer', this.settings.platform === 'mobile' ? 'Geocraft · joystick à gauche, regard au doigt à droite' : 'Geocraft · Z/W Q/A S D pour bouger · Échap pour le menu');
    el.append(logo, sub, menu, foot);
    this.show(el);
  }

  // ----------------------------------------------------------------- pause
  pause() {
    const el = h('div', 'screen dim');
    el.id = 'pause';
    const p = h('div', 'panel');
    p.style.minWidth = '320px';
    p.innerHTML = '<h2>Jeu en pause</h2>';
    const menu = h('div', 'menu');
    const resume = h('button', 'btn green', 'Reprendre');
    resume.onclick = () => this.cb.onResume();
    const opt = h('button', 'btn', 'Options');
    opt.onclick = () => this.options(() => this.pause());
    const fs = h('button', 'btn', 'Plein écran (F11)');
    fs.onclick = () => toggleFullscreen();
    const quit = h('button', 'btn', 'Quitter vers le titre');
    quit.onclick = () => this.cb.onQuitToTitle();
    const fresh = h('button', 'btn red', 'Repartir d’un monde neuf');
    fresh.onclick = () => {
      if (confirm('Repartir d’un monde neuf efface définitivement votre sauvegarde (monde, inventaire, position). Continuer ?')) this.cb.onNewWorld();
    };
    menu.append(resume, opt, fs, quit, fresh);
    p.append(menu);
    el.append(p);
    this.show(el);
  }

  // --------------------------------------------------------------- options
  options(back: () => void) {
    const s = this.settings;
    const el = h('div', 'screen dim');
    const p = h('div', 'panel');
    p.style.width = 'min(640px, 96vw)';
    p.innerHTML = '<h2>Options</h2>';
    const sc = h('div', 'scroll');
    const changed = () => { saveSettings(s); this.cb.onSettingsChanged(); };

    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) => {
      const row = h('div', 'opt');
      const lab = h('span');
      const inp = h('input');
      inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(get());
      const upd = () => { lab.textContent = `${label} : ${fmt(get())}`; };
      inp.oninput = () => { set(Number(inp.value)); upd(); changed(); };
      upd();
      row.append(lab, inp);
      sc.append(row);
    };
    const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const row = h('div', 'opt');
      const lab = h('label', 'check');
      lab.style.color = '#222'; lab.style.textShadow = 'none';
      const inp = h('input');
      inp.type = 'checkbox'; inp.checked = get();
      inp.onchange = () => { set(inp.checked); changed(); };
      lab.append(inp, document.createTextNode(label));
      row.append(lab);
      sc.append(row);
    };
    const title = (t: string) => { const e = h('div', '', t); e.style.cssText = 'font-size:10px;color:#6a1fb0;margin:12px 0 4px'; sc.append(e); };

    title('Plateforme');
    {
      const row = h('div', 'opt');
      const lab = h('span', '', `Mode : ${s.platform === 'mobile' ? 'Mobile (tactile)' : 'Ordinateur'}`);
      const b = h('button', 'btn small', 'Changer');
      b.onclick = () => this.platformChoice(() => this.options(back));
      row.append(lab, b);
      sc.append(row);
    }
    title('Graphismes');
    slider('Distance de rendu', 2, 20, 1, () => s.renderDistance, (v) => (s.renderDistance = v), (v) => `${v} chunks`);
    slider('Champ de vision', 55, 110, 1, () => s.fov, (v) => (s.fov = v), (v) => `${v}°`);
    check('Nuages', () => s.clouds, (v) => (s.clouds = v));
    check('Afficher les images par seconde', () => s.showFps, (v) => (s.showFps = v));
    title('Audio');
    slider('Volume général', 0, 1, 0.05, () => s.master, (v) => (s.master = v), (v) => `${Math.round(v * 100)} %`);
    slider('Effets sonores', 0, 1, 0.05, () => s.sfx, (v) => (s.sfx = v), (v) => `${Math.round(v * 100)} %`);
    slider('Musique', 0, 1, 0.05, () => s.music, (v) => (s.music = v), (v) => `${Math.round(v * 100)} %`);
    title('Contrôles');
    slider('Sensibilité de la souris', 0.2, 3, 0.05, () => s.sensitivity, (v) => (s.sensitivity = v), (v) => v.toFixed(2));
    check('Inverser l’axe vertical', () => s.invertY, (v) => (s.invertY = v));
    title('Touches (cliquer puis appuyer sur une touche)');
    const keys = h('div', 'keys');
    (Object.keys(ACTION_LABELS) as Action[]).forEach((a) => {
      const row = h('div', 'opt');
      row.style.margin = '0';
      const lab = h('span', '', ACTION_LABELS[a]);
      const btn = h('button', 'keybtn');
      const refresh = () => { btn.textContent = s.keys[a].map(keyLabel).join(' / '); };
      refresh();
      btn.onclick = () => {
        btn.classList.add('wait'); btn.textContent = '...';
        const onKey = (e: KeyboardEvent) => {
          e.preventDefault(); e.stopPropagation();
          window.removeEventListener('keydown', onKey, true);
          btn.classList.remove('wait');
          if (e.key !== 'Escape') {
            const id = keyId(e);
            // retire cette touche des autres actions
            for (const o of Object.keys(s.keys) as Action[]) s.keys[o] = s.keys[o].filter((k) => k !== id);
            s.keys[a] = [id];
            changed();
          }
          keys.querySelectorAll('.keybtn').forEach((b) => b.dispatchEvent(new Event('refresh')));
        };
        window.addEventListener('keydown', onKey, true);
      };
      btn.addEventListener('refresh', refresh);
      row.append(lab, btn);
      keys.append(row);
    });
    sc.append(keys);
    const reset = h('button', 'btn small', 'Touches par défaut');
    reset.style.marginTop = '8px';
    reset.onclick = () => { s.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); changed(); this.options(back); };
    sc.append(reset);
    p.append(sc);
    const done = h('button', 'btn green', 'Terminé');
    done.style.marginTop = '12px';
    done.onclick = () => { changed(); back(); };
    p.append(done);
    el.append(p);
    this.show(el);
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}
