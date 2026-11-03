import { itemOf, type Stack } from '../data/items';

export const HOTBAR = 9;
export const SLOTS = 36;

export class Inventory {
  slots: (Stack | null)[] = new Array(SLOTS).fill(null);
  selected = 0;
  onChange?: () => void;

  changed() { this.onChange?.(); }

  get held(): Stack | null { return this.slots[this.selected]; }

  /** Ajoute des objets ; renvoie le nombre non placé. */
  add(id: string, n: number): number {
    const max = itemOf(id).stack;
    const order = [...Array(SLOTS).keys()];
    for (const i of order) {
      const s = this.slots[i];
      if (s && s.id === id && s.n < max) {
        const t = Math.min(max - s.n, n);
        s.n += t; n -= t;
        if (!n) break;
      }
    }
    for (const i of order) {
      if (!n) break;
      if (!this.slots[i]) {
        const t = Math.min(max, n);
        this.slots[i] = { id, n: t };
        n -= t;
      }
    }
    this.changed();
    return n;
  }

  count(id: string): number {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  has(id: string, n: number): boolean { return this.count(id) >= n; }

  remove(id: string, n: number): boolean {
    if (!this.has(id, n)) return false;
    // en priorité depuis la fin (réserve) pour garder la barre rapide
    for (let i = SLOTS - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const t = Math.min(s.n, n);
        s.n -= t; n -= t;
        if (s.n <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return true;
  }

  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  /** Peut-on ajouter cette pile en entier ? */
  canFit(id: string, n: number): boolean {
    const max = itemOf(id).stack;
    let room = 0;
    for (const s of this.slots) room += s ? (s.id === id ? max - s.n : 0) : max;
    return room >= n;
  }

  clear() { this.slots.fill(null); this.changed(); }

  toJSON(): { id: string; n: number }[] {
    return this.slots.map((s) => (s ? { id: s.id, n: s.n } : null)) as { id: string; n: number }[];
  }

  fromJSON(arr: ({ id: string; n: number } | null)[] | undefined) {
    this.slots.fill(null);
    if (!arr) return;
    arr.slice(0, SLOTS).forEach((s, i) => { this.slots[i] = s ? { id: s.id, n: s.n } : null; });
    this.changed();
  }
}
