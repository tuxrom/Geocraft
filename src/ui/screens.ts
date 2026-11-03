import { h, type UI } from './ui';
import { Inventory, HOTBAR, SLOTS } from '../game/inventory';
import { ITEMS, ITEM_ORDER, RECIPES, KINDS, KIND, MAT, MATERIALS, MISC_OFFERS, buyOffer, upgradeOffer, itemOf, type Stack, type Offer, type Recipe } from '../data/items';
import { itemImg, iconURL } from '../gfx/icons';
import { describeItem } from './tooltip';

export type Tab = 'inv' | 'craft' | 'creative' | 'shop';

export interface ScreenHooks {
  creative: () => boolean;
  onClose: () => void;
  dropItem: (s: Stack) => void;
  sfx: (n: string) => void;
}

export class Screens {
  cursor: Stack | null = null;
  private cursorEl: HTMLElement;
  private tip: HTMLElement;
  private slotEls: HTMLElement[] = [];
  private dragFrom = -1;
  private dragTime = 0;
  private panel: HTMLElement | null = null;
  tab: Tab = 'inv';
  open = false;
  private root: HTMLElement | null = null;
  private shopMode: 'buy' | 'upgrade' | 'misc' = 'buy';
  private moveHandler = (e: MouseEvent) => this.onMove(e);

  constructor(private ui: UI, private inv: Inventory, private hooks: ScreenHooks) {
    this.cursorEl = h('div', 'cursor-item');
    this.cursorEl.classList.add('hidden');
    this.tip = h('div', 'tooltip');
    this.tip.classList.add('hidden');
    document.body.append(this.cursorEl, this.tip);
    inv.onChange = () => { this.refreshInv(); this.onInvChange?.(); };
  }

  onInvChange?: () => void;

  private onMove(e: MouseEvent) {
    this.cursorEl.style.left = `${e.clientX}px`;
    this.cursorEl.style.top = `${e.clientY}px`;
    if (!this.tip.classList.contains('hidden')) {
      this.tip.style.left = `${Math.min(window.innerWidth - 320, e.clientX + 16)}px`;
      this.tip.style.top = `${Math.min(window.innerHeight - 140, e.clientY + 16)}px`;
    }
  }

  private showTip(id: string | null, e?: MouseEvent) {
    if (!id) { this.tip.classList.add('hidden'); return; }
    this.tip.innerHTML = describeItem(id);
    this.tip.classList.remove('hidden');
    if (e) this.onMove(e);
  }

  show(tab: Tab) {
    this.tab = tab;
    this.open = true;
    window.addEventListener('mousemove', this.moveHandler);
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener('mousemove', this.moveHandler);
    // rend l'objet du curseur
    if (this.cursor) {
      const left = this.inv.add(this.cursor.id, this.cursor.n);
      if (left > 0) this.hooks.dropItem({ id: this.cursor.id, n: left });
      this.cursor = null;
    }
    this.cursorEl.classList.add('hidden');
    this.tip.classList.add('hidden');
    this.ui.close();
    this.root = null; this.panel = null; this.slotEls = [];
    this.hooks.onClose();
  }

  private render() {
    const root = h('div', 'screen dim');
    root.onmousedown = (e) => {
      if (e.target === root && this.cursor) { this.hooks.dropItem(this.cursor); this.cursor = null; this.refreshCursor(); }
    };
    root.oncontextmenu = (e) => e.preventDefault();
    const wrap = h('div');
    const tabs = h('div', 'tabs');
    const mk = (t: Tab, label: string) => {
      const b = h('div', 'tab' + (t === this.tab ? ' on' : ''), label);
      b.onclick = () => { this.tab = t; this.hooks.sfx('ui'); this.render(); };
      tabs.append(b);
    };
    if (this.tab === 'shop') mk('shop', 'Boutique');
    else {
      mk('inv', 'Inventaire');
      mk('craft', 'Fabrication');
      if (this.hooks.creative()) mk('creative', 'Créatif');
    }
    const panel = h('div', 'panel');
    this.panel = panel;
    if (this.tab === 'inv') this.buildInventory(panel);
    else if (this.tab === 'craft') this.buildCraft(panel);
    else if (this.tab === 'creative') this.buildCreative(panel);
    else this.buildShop(panel);
    if (document.body.classList.contains('mobile')) {
      const x = h('button', 'btn small red', 'X');
      x.style.cssText = 'position:absolute;right:6px;top:6px;min-width:0;padding:6px 10px;z-index:5';
      x.onclick = () => this.close();
      panel.style.position = 'relative';
      panel.append(x);
    }
    wrap.append(tabs, panel);
    root.append(wrap);
    this.root = root;
    this.ui.show(root);
    this.refreshCursor();
  }

  // ---------------------------------------------------------- inventaire
  private grid(from: number, to: number, cols: number): HTMLElement {
    const g = h('div', 'slotgrid');
    g.style.gridTemplateColumns = `repeat(${cols}, 52px)`;
    for (let i = from; i < to; i++) {
      const el = h('div', 'slot');
      el.dataset.i = String(i);
      el.onmousedown = (e) => { e.preventDefault(); this.slotDown(i, e); };
      el.onmouseup = (e) => this.slotUp(i, e);
      el.onmouseenter = (e) => this.showTip(this.inv.slots[i]?.id ?? null, e);
      el.onmouseleave = () => this.showTip(null);
      this.slotEls[i] = el;
      g.append(el);
    }
    return g;
  }

  private buildInventory(panel: HTMLElement) {
    panel.innerHTML = '<h2>Inventaire</h2>';
    this.slotEls = [];
    const main = this.grid(HOTBAR, SLOTS, 9);
    const hot = this.grid(0, HOTBAR, 9);
    hot.style.marginTop = '14px';
    panel.append(main, hot);
    const mob = document.body.classList.contains('mobile');
    const hint = h('div', 'desc', mob ? 'Touchez un objet, puis une case pour le déplacer. Touchez hors de la fenêtre pour le jeter.' : 'Clic : prendre ou poser · Clic droit : moitié ou un seul · Maj + clic : déplacer · Glissez un objet hors de la fenêtre pour le jeter.');
    hint.style.marginTop = '10px';
    hint.style.maxWidth = '500px';
    panel.append(hint);
    this.refreshInv();
  }

  refreshInv() {
    if (!this.open) return;
    for (let i = 0; i < SLOTS; i++) {
      const el = this.slotEls[i];
      if (!el) continue;
      el.innerHTML = '';
      el.classList.toggle('sel', i === this.inv.selected);
      const st = this.inv.slots[i];
      if (st) {
        el.append(itemImg(st.id));
        if (st.n > 1) el.append(h('span', 'cnt', String(st.n)));
      }
    }
    if (this.tab === 'craft') this.refreshCraft();
    if (this.tab === 'shop') this.refreshShop();
  }

  private refreshCursor() {
    this.cursorEl.innerHTML = '';
    if (this.cursor) {
      this.cursorEl.classList.remove('hidden');
      this.cursorEl.append(itemImg(this.cursor.id));
      if (this.cursor.n > 1) this.cursorEl.append(h('span', 'cnt', String(this.cursor.n)));
    } else this.cursorEl.classList.add('hidden');
  }

  private slotDown(i: number, e: MouseEvent) {
    const slots = this.inv.slots;
    const st = slots[i];
    this.hooks.sfx('ui');
    if (e.shiftKey && st && !this.cursor) {
      const range = i < HOTBAR ? [HOTBAR, SLOTS] : [0, HOTBAR];
      const max = itemOf(st.id).stack;
      for (let j = range[0]; j < range[1] && st.n > 0; j++) {
        const o = slots[j];
        if (o && o.id === st.id && o.n < max) { const t = Math.min(max - o.n, st.n); o.n += t; st.n -= t; }
      }
      for (let j = range[0]; j < range[1] && st.n > 0; j++) if (!slots[j]) { slots[j] = { id: st.id, n: st.n }; st.n = 0; }
      if (st.n <= 0) slots[i] = null;
      this.inv.changed();
      return;
    }
    if (e.button === 2) {
      if (!this.cursor) {
        if (st) {
          const take = Math.ceil(st.n / 2);
          this.cursor = { id: st.id, n: take };
          st.n -= take;
          if (st.n <= 0) slots[i] = null;
        }
      } else if (!st) { slots[i] = { id: this.cursor.id, n: 1 }; this.cursor.n--; }
      else if (st.id === this.cursor.id && st.n < itemOf(st.id).stack) { st.n++; this.cursor.n--; }
      if (this.cursor && this.cursor.n <= 0) this.cursor = null;
    } else {
      if (!this.cursor) {
        if (st) { this.cursor = st; slots[i] = null; this.dragFrom = i; this.dragTime = performance.now(); }
      } else this.dropOnSlot(i);
    }
    this.inv.changed();
    this.refreshCursor();
  }

  private dropOnSlot(i: number) {
    const slots = this.inv.slots;
    const st = slots[i];
    const c = this.cursor!;
    if (!st) { slots[i] = c; this.cursor = null; }
    else if (st.id === c.id) {
      const max = itemOf(st.id).stack;
      const t = Math.min(max - st.n, c.n);
      st.n += t; c.n -= t;
      if (c.n <= 0) this.cursor = null;
    } else { slots[i] = c; this.cursor = st; }
  }

  /** Relâcher sur une autre case après un glisser : dépose l'objet. */
  private slotUp(i: number, e: MouseEvent) {
    if (e.button !== 0 || !this.cursor || this.dragFrom < 0) return;
    const from = this.dragFrom;
    this.dragFrom = -1;
    if (i === from && performance.now() - this.dragTime < 400) return; // clic simple : on garde l'objet
    this.dropOnSlot(i);
    this.inv.changed();
    this.refreshCursor();
  }

  // ------------------------------------------------------------ créatif
  private buildCreative(panel: HTMLElement) {
    panel.innerHTML = '<h2>Mode créatif : tous les objets</h2>';
    const g = h('div', 'grid-creative');
    for (const id of ITEM_ORDER) {
      const el = h('div', 'slot');
      el.append(itemImg(id));
      el.onmouseenter = (e) => this.showTip(id, e);
      el.onmouseleave = () => this.showTip(null);
      el.onmousedown = (e) => {
        e.preventDefault();
        const max = itemOf(id).stack;
        this.cursor = { id, n: e.button === 2 ? 1 : max };
        this.refreshCursor();
      };
      g.append(el);
    }
    panel.append(g);
    const hot = this.grid(0, HOTBAR, 9);
    hot.style.marginTop = '12px';
    panel.append(hot);
    this.refreshInv();
  }

  // --------------------------------------------------------- fabrication
  private craftList: HTMLElement | null = null;

  private buildCraft(panel: HTMLElement) {
    panel.innerHTML = '<h2>Fabrication</h2>';
    this.craftList = h('div', 'list');
    this.craftList.style.width = 'min(560px, 90vw)';
    panel.append(this.craftList);
    const hot = this.grid(0, HOTBAR, 9);
    hot.style.marginTop = '12px';
    panel.append(hot);
    this.refreshCraft();
    this.refreshInv();
  }

  private costChips(cost: [string, number][]): HTMLElement {
    const box = h('div', 'cost');
    for (const [id, n] of cost) {
      const have = this.inv.count(id);
      const s = h('span', have >= n ? '' : 'no');
      const im = h('img', 'px');
      im.src = iconURL(id);
      s.append(im, document.createTextNode(` ${have}/${n}`));
      s.title = ITEMS[id].label;
      box.append(s);
    }
    return box;
  }

  private canPay(cost: [string, number][]) { return cost.every(([id, n]) => this.inv.has(id, n)); }

  private offerRow(label: string, outId: string, n: number, cost: [string, number][], onClick: () => void, sub = ''): HTMLElement {
    const ok = this.canPay(cost);
    const row = h('div', 'offer' + (ok ? '' : ' cant'));
    row.style.cursor = ok ? 'pointer' : 'default';
    const ico = h('div', 'ico');
    ico.append(itemImg(outId));
    const txt = h('div', 'txt');
    txt.innerHTML = `${label}${n > 1 ? ' x' + n : ''}${sub ? `<br><span style="color:#444">${sub}</span>` : ''}`;
    txt.append(this.costChips(cost));
    row.append(ico, txt);
    row.onmouseenter = (e) => this.showTip(outId, e);
    row.onmouseleave = () => this.showTip(null);
    row.onclick = () => { if (ok) onClick(); else this.hooks.sfx('ui'); };
    return row;
  }

  refreshCraft() {
    if (!this.craftList) return;
    this.craftList.innerHTML = '';
    let group = '';
    for (const r of RECIPES) {
      if (r.group !== group) {
        group = r.group;
        const t = h('div', '', group);
        t.style.cssText = 'font-size:10px;color:#6a1fb0;margin:6px 0 2px';
        this.craftList.append(t);
      }
      this.craftList.append(this.offerRow(ITEMS[r.out].label, r.out, r.n, r.cost, () => this.craft(r)));
    }
  }

  private craft(r: Recipe) {
    if (!this.canPay(r.cost)) return;
    if (!this.inv.canFit(r.out, r.n)) { this.ui.toast('Inventaire plein'); return; }
    for (const [id, n] of r.cost) this.inv.remove(id, n);
    this.inv.add(r.out, r.n);
    this.hooks.sfx('place');
  }

  // ------------------------------------------------------------ boutique
  private shopList: HTMLElement | null = null;

  private buildShop(panel: HTMLElement) {
    panel.innerHTML = '<h2>Professeur Théorème</h2>';
    const intro = h('div', 'desc', '« Bonjour, jeune géomètre ! Tout s’échange : un peu de terre, de la pierre, du minerai... et je vous donne une arme à la mesure de vos exploits. »');
    intro.style.maxWidth = 'min(560px, 90vw)';
    intro.style.marginBottom = '8px';
    panel.append(intro);
    const row = h('div', 'row');
    const mk = (m: 'buy' | 'upgrade' | 'misc', label: string) => {
      const b = h('button', 'btn small' + (this.shopMode === m ? ' green' : ''), label);
      b.onclick = () => { this.shopMode = m; this.hooks.sfx('ui'); this.render(); };
      row.append(b);
    };
    mk('buy', 'Acheter une arme');
    mk('upgrade', 'Améliorer');
    mk('misc', 'Divers');
    panel.append(row);
    this.shopList = h('div', 'list');
    this.shopList.style.cssText = 'width:min(560px,90vw);margin-top:8px';
    panel.append(this.shopList);
    const hot = this.grid(0, HOTBAR, 9);
    hot.style.marginTop = '10px';
    panel.append(hot);
    this.refreshShop();
    this.refreshInv();
  }

  refreshShop() {
    if (!this.shopList) return;
    this.shopList.innerHTML = '';
    if (this.shopMode === 'buy') {
      for (const kd of [...KINDS].sort((a, b) => a.tier - b.tier)) {
        const o = buyOffer(kd.id);
        this.shopList.append(this.offerRow(kd.label, o.item, 1, o.cost, () => this.buy(o), `Palier ${kd.tier}`));
      }
    } else if (this.shopMode === 'upgrade') {
      const seen = new Set<string>();
      let any = false;
      this.inv.slots.forEach((s) => {
        if (!s || ITEMS[s.id].type !== 'weapon' || seen.has(s.id)) return;
        seen.add(s.id);
        const it = ITEMS[s.id];
        const o = upgradeOffer(it.kind!, it.mat!);
        if (!o) return;
        any = true;
        this.shopList!.append(this.offerRow(o.label, o.item, 1, o.cost, () => this.buy(o)));
      });
      if (!any) this.shopList.append(h('div', 'desc', 'Aucune arme à améliorer dans votre inventaire. (Les armes en cristal sont déjà au sommet.)'));
    } else {
      for (const o of MISC_OFFERS) this.shopList.append(this.offerRow(o.label, o.item, o.n ?? 1, o.cost, () => this.buy(o)));
    }
  }

  private buy(o: Offer) {
    if (!this.canPay(o.cost)) return;
    if (o.kind === 'upgrade') {
      // remplace l'arme existante
      const idx = this.inv.slots.findIndex((s) => s && s.id === o.from);
      if (idx < 0) return;
      for (const [id, n] of o.cost) this.inv.remove(id, n);
      this.inv.slots[idx] = { id: o.item, n: 1 };
      this.inv.changed();
    } else {
      const n = o.n ?? 1;
      if (!this.inv.canFit(o.item, n)) { this.ui.toast('Inventaire plein'); return; }
      for (const [id, c] of o.cost) this.inv.remove(id, c);
      this.inv.add(o.item, n);
    }
    this.hooks.sfx('buy');
  }

  /** Utilisé par l'évaluation de l'équilibre. */
  static priceOf(kind: string): [string, number][] { return buyOffer(kind).cost; }
}

export { KIND, MAT, MATERIALS };
