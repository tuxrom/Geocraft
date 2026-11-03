import { h } from './ui';
import type { Inventory } from '../game/inventory';
import { HOTBAR } from '../game/inventory';
import { ITEMS, RESOURCES, KIND, MAT } from '../data/items';
import { itemImg, iconURL } from '../gfx/icons';

const HEART = [
  '..##.##..',
  '.#######.',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
];

function heartCanvas(kind: 'full' | 'half' | 'empty'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
    if (HEART[y][x] !== '#') continue;
    const edge = y === 0 || HEART[y - 1]?.[x] !== '#' || HEART[y + 1]?.[x] !== '#' || HEART[y][x - 1] !== '#' || HEART[y][x + 1] !== '#';
    const filled = kind === 'full' || (kind === 'half' && x < 5);
    g.fillStyle = edge ? '#2b0606' : filled ? '#e32424' : '#401414';
    g.fillRect(x, y, 1, 1);
    if (!edge && filled && ((x === 2 && y === 2) || (x === 3 && y === 2) || (x === 2 && y === 3))) { g.fillStyle = '#ff9a9a'; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

export class Hud {
  private slots: HTMLElement[] = [];
  private hearts: HTMLElement;
  private resEls = new Map<string, HTMLElement>();
  private nameEl: HTMLElement;
  private weaponEl: HTMLElement;
  private bossEl: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private heartImgs = { full: heartCanvas('full').toDataURL(), half: heartCanvas('half').toDataURL(), empty: heartCanvas('empty').toDataURL() };
  private lastHp = -1;
  private nameTimer = 0;
  private lastSel = -1;
  helpEl: HTMLElement | null = null;
  clickMsg: HTMLElement;

  constructor(private hud: HTMLElement, private inv: Inventory, private keyLabels: () => Record<string, string>) {
    const hot = h('div'); hot.id = 'hotbar';
    for (let i = 0; i < HOTBAR; i++) {
      const s = h('div', 'hslot');
      s.append(h('span', 'key', String(i + 1)));
      hot.append(s);
      this.slots.push(s);
    }
    const bars = h('div'); bars.id = 'bars';
    this.hearts = h('div'); this.hearts.id = 'hearts';
    bars.append(this.hearts);
    const res = h('div'); res.id = 'res';
    for (const r of RESOURCES) {
      const row = h('div', 'rr');
      const im = h('img', 'px');
      im.src = iconURL(r.id); im.title = r.label;
      const sp = h('span', '', '0');
      row.append(im, sp);
      res.append(row);
      this.resEls.set(r.id, sp);
    }
    this.nameEl = h('div'); this.nameEl.id = 'itemname';
    this.weaponEl = h('div'); this.weaponEl.id = 'weapon-hud';
    this.bossEl = h('div'); this.bossEl.id = 'bossbar'; this.bossEl.classList.add('hidden');
    this.bossName = h('div'); this.bossFill = h('i');
    const bar = h('div', 'bar'); bar.append(this.bossFill);
    this.bossEl.append(this.bossName, bar);
    this.clickMsg = h('div', '', 'Cliquez pour reprendre la partie');
    this.clickMsg.style.cssText = 'position:absolute;left:0;right:0;top:60%;text-align:center;font-size:12px;text-shadow:2px 2px 0 #000;pointer-events:none';
    this.clickMsg.classList.add('hidden');
    hud.append(hot, bars, res, this.nameEl, this.weaponEl, this.bossEl, this.clickMsg);
    this.refresh();
  }

  refresh() {
    for (let i = 0; i < HOTBAR; i++) {
      const el = this.slots[i];
      el.querySelectorAll('.item-img,.cnt,.dur').forEach((e) => e.remove());
      const st = this.inv.slots[i];
      if (st) {
        el.append(itemImg(st.id));
        if (st.n > 1) el.append(h('span', 'cnt', String(st.n)));
      }
      el.classList.toggle('sel', i === this.inv.selected);
    }
    const counts = new Map<string, number>();
    for (const s of this.inv.slots) if (s) counts.set(s.id, (counts.get(s.id) ?? 0) + s.n);
    for (const [id, el] of this.resEls) el.textContent = String(counts.get(id) ?? 0);
    if (this.inv.selected !== this.lastSel) {
      this.lastSel = this.inv.selected;
      const st = this.inv.held;
      this.nameEl.textContent = st ? ITEMS[st.id].label : '';
      this.nameEl.style.opacity = '1';
      this.nameTimer = 2.2;
    }
  }

  setHealth(hp: number, max: number) {
    const q = Math.round(hp);
    if (q === this.lastHp) return;
    this.lastHp = q;
    this.hearts.innerHTML = '';
    this.hearts.classList.toggle('low', hp <= 6);
    for (let i = 0; i < max / 2; i++) {
      const v = q - i * 2;
      const im = h('canvas', 'px') as HTMLCanvasElement;
      im.width = 9; im.height = 9;
      const src = v >= 2 ? this.heartImgs.full : v === 1 ? this.heartImgs.half : this.heartImgs.empty;
      const img = new Image(); img.src = src;
      img.onload = () => im.getContext('2d')!.drawImage(img, 0, 0);
      this.hearts.append(im);
    }
  }

  setWeaponInfo(html: string) { this.weaponEl.innerHTML = html; }

  setBoss(name: string | null, frac = 0) {
    if (!name) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.bossName.textContent = name;
    this.bossFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  update(dt: number) {
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer < 0.6) this.nameEl.style.opacity = String(Math.max(0, this.nameTimer / 0.6));
    }
  }

  showHelp(onClose: () => void) {
    const k = this.keyLabels();
    const el = h('div', 'panel');
    el.id = 'help';
    el.style.pointerEvents = 'auto';
    el.innerHTML = `<h2>Bienvenue dans Geocraft</h2><table>
      <tr><td>${k.forward}${k.left}${k.back}${k.right}</td><td>Se déplacer (ZQSD ou WASD)</td></tr>
      <tr><td>${k.jump} / ${k.sprint} / ${k.crouch}</td><td>Sauter / courir / s'accroupir</td></tr>
      <tr><td>Clic gauche</td><td>Frapper ou miner (maintenu)</td></tr>
      <tr><td>Clic droit</td><td>Poser un bloc ou utiliser l'objet</td></tr>
      <tr><td>Molette, 1 à 9</td><td>Choisir dans la barre rapide</td></tr>
      <tr><td>${k.inventory}</td><td>Inventaire</td></tr>
      <tr><td>${k.craft}</td><td>Fabrication</td></tr>
      <tr><td>${k.interact}</td><td>Parler au Professeur Théorème</td></tr>
      <tr><td>${k.adjust}</td><td>Régler l'arme (rayon, angle)</td></tr>
      <tr><td>Échap / F11</td><td>Menu pause / plein écran</td></tr></table>
      <p style="font-size:9px;line-height:1.8;color:#333">Récoltez du bois et de la pierre, rejoignez la cabane du Professeur Théorème, et survivez la nuit aux fractions et aux vecteurs.</p>`;
    const b = h('button', 'btn green small', 'Compris');
    b.onclick = () => { el.remove(); this.helpEl = null; onClose(); };
    el.append(b);
    this.hud.parentElement!.append(el);
    this.helpEl = el;
  }
}

export function weaponHtml(id: string | null, param?: string): string {
  if (!id) return '';
  const it = ITEMS[id];
  if (it.type !== 'weapon') return '';
  const kd = KIND[it.kind!], m = MAT[it.mat!];
  const dmg = (kd.dmg * m.dmg).toFixed(1);
  return `${kd.label}<br>${dmg} dégâts${param ? '<br>' + param : ''}`;
}
