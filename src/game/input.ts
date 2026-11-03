import type { Action, Settings } from './settings';

/** Identifiant stable d'une touche : lettres en minuscules (indépendant de AZERTY/QWERTY), sinon code. */
export function keyId(e: KeyboardEvent): string {
  if (e.code === 'Space') return 'Space';
  if (e.key === 'Shift') return 'Shift';
  if (e.key === 'Control') return 'Control';
  if (e.key === 'Alt') return 'Alt';
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}

export function keyLabel(id: string): string {
  const map: Record<string, string> = { Space: 'Espace', Shift: 'Maj', Control: 'Ctrl', Escape: 'Échap', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return map[id] ?? (id.length === 1 ? id.toUpperCase() : id);
}

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mouse = [false, false, false];
  mousePressed = [false, false, false];
  dx = 0;
  dy = 0;
  wheel = 0;
  digit = -1;
  locked = false;
  /** Mode tactile : le verrouillage est virtuel et la souris est ignorée. */
  touch = false;
  axisX = 0;
  axisY = 0;
  autoSprint = false;
  enabled = false; // vrai quand le jeu écoute les entrées
  private settings: Settings;

  constructor(settings: Settings, private canvas: HTMLCanvasElement) {
    this.settings = settings;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => {
      if (!this.locked || this.touch) return;
      this.mouse[e.button] = true;
      this.mousePressed[e.button] = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked || this.touch) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.fill(false); });
    document.addEventListener('pointerlockchange', () => {
      if (this.touch) return;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.down.clear(); this.mouse.fill(false); }
      this.onLockChange?.(this.locked);
    });
  }

  onLockChange?: (locked: boolean) => void;
  onRawKey?: (e: KeyboardEvent) => boolean | void;

  private onKey(e: KeyboardEvent, down: boolean) {
    if (down && this.onRawKey && this.onRawKey(e) === true) return;
    const id = keyId(e);
    if (this.locked) {
      // empêche les raccourcis du navigateur (Ctrl+W ne peut pas, mais Ctrl+S, F5, Tab...)
      if (e.key === 'Tab' || e.key === 'F5' || (e.ctrlKey && e.key.length === 1) || e.key === 'F11' || e.key === 'F3') e.preventDefault();
    }
    if (down) {
      if (!e.repeat) this.pressed.add(id);
      this.down.add(id);
      const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && !e.repeat) this.digit = Number(m[2]) - 1;
    } else this.down.delete(id);
  }

  isDown(a: Action): boolean {
    for (const k of this.settings.keys[a]) if (this.down.has(k)) return true;
    return false;
  }

  wasPressed(a: Action): boolean {
    for (const k of this.settings.keys[a]) if (this.pressed.has(k)) return true;
    return false;
  }

  /** À appeler en fin d'image. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.fill(false);
    this.dx = 0; this.dy = 0; this.wheel = 0; this.digit = -1;
  }

  lock() {
    if (this.touch) {
      if (!this.locked) { this.locked = true; this.onLockChange?.(true); }
      return;
    }
    if (document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => { /* l'utilisateur doit recliquer */ });
      } catch { /* ignore */ }
    }
  }
  unlock() {
    if (this.touch) {
      if (this.locked) { this.locked = false; this.down.clear(); this.mouse.fill(false); this.axisX = this.axisY = 0; this.autoSprint = false; this.onLockChange?.(false); }
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Touche virtuelle (boutons tactiles) : maintenue ou impulsion. */
  virtualKey(id: string, down: boolean, pulse = false) {
    if (down) { this.down.add(id); if (pulse || true) this.pressed.add(id); } else this.down.delete(id);
  }
}
