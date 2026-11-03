import type { Input } from '../game/input';
import type { Settings } from '../game/settings';
import { h } from './ui';

export interface TouchCallbacks {
  inventory(): void;
  craft(): void;
  pause(): void;
}

/** Commandes tactiles : joystick flottant à gauche, regard au doigt à droite, boutons d'action. */
export class TouchControls {
  root = h('div');
  private joyBase = h('div', 'tc-joy');
  private joyKnob = h('div', 'tc-knob');
  private joyId = -1;
  private joyOrigin = { x: 0, y: 0 };
  private lookId = -1;
  private lookLast = { x: 0, y: 0 };
  private sprintOn = false;
  private crouchOn = false;
  private sprintBtn!: HTMLElement;
  private crouchBtn!: HTMLElement;
  private buttons: HTMLElement[] = [];

  constructor(parent: HTMLElement, before: HTMLElement, private input: Input, private settings: Settings, private cb: TouchCallbacks) {
    this.root.id = 'touch';
    this.root.classList.add('hidden');
    this.root.append(this.joyBase, this.joyKnob);
    this.joyBase.classList.add('hidden'); this.joyKnob.classList.add('hidden');
    parent.insertBefore(this.root, before);

    // zone de capture : joystick (moitié gauche) et regard (moitié droite)
    const zone = h('div', 'tc-zone');
    this.root.prepend(zone);
    zone.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    zone.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    zone.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
    zone.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });

    const key = (a: 'sprint' | 'crouch' | 'jump' | 'interact' | 'adjust') => this.settings.keys[a][0];
    const btn = (label: string, cls: string, down: () => void, up?: () => void) => {
      const b = h('div', `tc-btn ${cls}`, label);
      const press = (e: Event) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down(); };
      const release = (e: Event) => { e.preventDefault(); e.stopPropagation(); b.classList.remove('on'); up?.(); };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', release, { passive: false });
      b.addEventListener('touchcancel', release, { passive: false });
      this.root.append(b);
      this.buttons.push(b);
      return b;
    };
    btn('FRAPPER', 'attack', () => { this.input.mouse[0] = true; this.input.mousePressed[0] = true; }, () => { this.input.mouse[0] = false; });
    btn('POSER', 'use', () => { this.input.mouse[2] = true; this.input.mousePressed[2] = true; }, () => { this.input.mouse[2] = false; });
    btn('SAUT', 'jump', () => this.input.virtualKey(key('jump'), true), () => this.input.virtualKey(key('jump'), false));
    this.crouchBtn = btn('ACCR.', 'crouch', () => { this.crouchOn = !this.crouchOn; this.input.virtualKey(key('crouch'), this.crouchOn); this.crouchBtn.classList.toggle('lit', this.crouchOn); });
    this.sprintBtn = btn('COURIR', 'sprint', () => { this.sprintOn = !this.sprintOn; this.input.autoSprint = this.sprintOn; this.sprintBtn.classList.toggle('lit', this.sprintOn); });
    btn('F', 'act-f', () => this.input.virtualKey(key('interact'), true), () => this.input.virtualKey(key('interact'), false));
    btn('R', 'act-r', () => this.input.virtualKey(key('adjust'), true), () => this.input.virtualKey(key('adjust'), false));
    btn('SAC', 'top t1', () => this.cb.inventory());
    btn('FAB.', 'top t2', () => this.cb.craft());
    btn('II', 'top t3', () => this.cb.pause());
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.release();
  }

  /** Relâche tout (changement d'écran). */
  release() {
    this.crouchOn = false; this.sprintOn = false;
    this.crouchBtn.classList.remove('lit'); this.sprintBtn.classList.remove('lit');
    this.joyId = this.lookId = -1;
    this.input.axisX = this.input.axisY = 0;
    this.joyBase.classList.add('hidden'); this.joyKnob.classList.add('hidden');
    this.input.mouse[0] = this.input.mouse[2] = false;
  }

  private onStart(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && this.joyId < 0) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.joyBase.style.left = `${t.clientX}px`; this.joyBase.style.top = `${t.clientY}px`;
        this.joyKnob.style.left = `${t.clientX}px`; this.joyKnob.style.top = `${t.clientY}px`;
        this.joyBase.classList.remove('hidden'); this.joyKnob.classList.remove('hidden');
      } else if (this.lookId < 0 && t.clientX >= window.innerWidth * 0.45) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private onMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        const R = 56;
        let dx = t.clientX - this.joyOrigin.x, dy = t.clientY - this.joyOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        this.joyKnob.style.left = `${this.joyOrigin.x + dx}px`; this.joyKnob.style.top = `${this.joyOrigin.y + dy}px`;
        const dead = 0.12;
        let ax = dx / R, ay = -dy / R;
        if (Math.hypot(ax, ay) < dead) { ax = 0; ay = 0; }
        this.input.axisX = ax; this.input.axisY = ay;
        // pousser à fond vers l'avant fait courir
        if (ay > 0.95 && Math.abs(ax) < 0.5) this.input.autoSprint = true;
        else if (!this.sprintOn) this.input.autoSprint = false;
      } else if (t.identifier === this.lookId) {
        this.input.dx += (t.clientX - this.lookLast.x) * 1.5;
        this.input.dy += (t.clientY - this.lookLast.y) * 1.5;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private onEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.joyId = -1;
        this.input.axisX = this.input.axisY = 0;
        if (!this.sprintOn) this.input.autoSprint = false;
        this.joyBase.classList.add('hidden'); this.joyKnob.classList.add('hidden');
      } else if (t.identifier === this.lookId) this.lookId = -1;
    }
  }
}
