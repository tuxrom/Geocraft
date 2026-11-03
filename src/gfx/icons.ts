import { ITEMS, MAT, KIND } from '../data/items';
import { BLOCKS } from '../data/blocks';
import { tileCanvas } from './textures';

/** Petit pinceau de pixels 16x16 pour dessiner les objets. */
class Pix {
  c = document.createElement('canvas');
  g: CanvasRenderingContext2D;
  constructor(public S = 16) {
    this.c.width = this.c.height = S;
    this.g = this.c.getContext('2d', { willReadFrequently: true })!;
  }
  set(x: number, y: number, col: string) {
    if (x < 0 || y < 0 || x >= this.S || y >= this.S) return;
    this.g.fillStyle = col;
    this.g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  line(x0: number, y0: number, x1: number, y1: number, col: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  rect(x: number, y: number, w: number, h: number, col: string) {
    this.g.fillStyle = col; this.g.fillRect(x, y, w, h);
  }
  circle(cx: number, cy: number, r: number, col: string, fill = false) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (fill ? d <= r + 0.3 : Math.abs(d - r) < 0.6) this.set(cx + x, cy + y, col);
    }
  }
  poly(pts: number[][], col: string, fill = false) {
    if (fill) {
      let minY = 99, maxY = -99;
      for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, col);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], col);
    }
  }
  /** Ajoute un contour sombre autour des pixels opaques. */
  outline(col = 'rgb(24,18,30)') {
    const d = this.g.getImageData(0, 0, this.S, this.S);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.S || y >= this.S ? 0 : d.data[(y * this.S + x) * 4 + 3]);
    const marks: [number, number][] = [];
    for (let y = 0; y < this.S; y++) for (let x = 0; x < this.S; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) marks.push([x, y]);
    }
    for (const [x, y] of marks) this.set(x, y, col);
  }
}

interface Pal { m: string; l: string; d: string; h: string; hl: string }
const HANDLE = { h: '#7a5230', hl: '#a87a46' };

/** Dessine le symbole de chaque arme (16x16). Le matériau colore la partie principale. */
const painters: Record<string, (p: Pix, c: Pal) => void> = {
  droite(p, c) {
    p.line(5, 10, 13, 2, c.m); p.line(6, 10, 14, 2, c.l); p.line(5, 11, 13, 3, c.d);
    p.line(12, 1, 15, 1, c.l); p.line(14, 0, 15, 3, c.l); // pointe en flèche
    p.line(2, 9, 8, 15, c.d); p.line(3, 9, 8, 14, c.m); // garde
    p.line(1, 14, 5, 10, c.h); p.line(0, 15, 1, 14, c.hl);
  },
  segment(p, c) {
    p.line(6, 9, 12, 3, c.m); p.line(7, 9, 12, 4, c.d); p.line(6, 8, 11, 3, c.l);
    p.rect(12, 2, 2, 2, c.l); p.rect(4, 11, 2, 2, c.l);
    p.line(3, 10, 7, 14, c.d); p.line(2, 13, 4, 11, c.h);
  },
  demidroite(p, c) {
    p.circle(3, 12, 1, c.l, true);
    p.line(4, 11, 13, 2, c.m); p.line(5, 11, 14, 2, c.d);
    p.poly([[11, 0], [15, 0], [15, 4]], c.l, true);
    p.line(1, 14, 3, 12, c.h);
  },
  mediatrice(p, c) {
    p.line(2, 13, 13, 2, c.m); p.line(3, 13, 13, 3, c.d);
    p.line(4, 3, 11, 10, c.l); p.line(4, 4, 11, 11, c.d); // perpendiculaire au milieu
    p.rect(7, 7, 2, 2, c.l);
    p.circle(2, 13, 1, c.l, true); p.circle(13, 2, 1, c.l, true);
  },
  mediane(p, c) {
    p.poly([[2, 13], [14, 13], [8, 2]], c.m);
    p.line(2, 13, 11, 7, c.l);
    p.rect(10, 7, 2, 2, c.l);
    p.set(2, 13, c.d); p.set(14, 13, c.d); p.set(8, 2, c.d);
  },
  bissectrice(p, c) {
    p.line(2, 14, 14, 2, c.m); p.line(2, 14, 14, 12, c.m);
    p.line(2, 14, 14, 7, c.l); p.line(3, 14, 14, 8, c.d);
    p.set(6, 11, c.l); p.set(5, 12, c.l);
  },
  equerre(p, c) {
    p.poly([[2, 2], [2, 14], [14, 14]], c.m, true);
    p.poly([[5, 7], [5, 11], [9, 11]], 'rgba(0,0,0,0)');
    p.g.clearRect(5, 8, 3, 4);
    p.line(2, 2, 2, 14, c.l); p.line(2, 14, 14, 14, c.d); p.line(2, 2, 14, 14, c.d);
    for (const y of [5, 8, 11]) p.set(3, y, c.d);
  },
  compas(p, c) {
    p.line(8, 2, 3, 14, c.m); p.line(9, 2, 13, 14, c.m); p.line(9, 2, 4, 14, c.d);
    p.circle(8, 2, 1, c.l, true);
    p.rect(7, 0, 3, 1, c.h);
    p.line(5, 9, 11, 9, c.l);
    p.set(3, 15, c.l); p.set(13, 15, c.hl);
  },
  rapporteur(p, c) {
    p.g.fillStyle = 'rgba(0,0,0,0)';
    for (let a = 0; a <= 180; a += 4) {
      const r = (a * Math.PI) / 180;
      p.set(8 + Math.cos(r) * 7, 13 - Math.sin(r) * 10 * 0.8 - 0, c.m);
      p.set(8 + Math.cos(r) * 5, 13 - Math.sin(r) * 6, c.l);
    }
    p.line(1, 13, 15, 13, c.d); p.line(1, 14, 15, 14, c.m);
    for (const x of [3, 8, 13]) p.set(x, 12, c.d);
    p.line(8, 13, 8, 8, c.d);
  },
  plus(p, c) {
    p.line(4, 12, 11, 5, c.h); p.line(3, 13, 4, 12, c.hl);
    p.rect(11, 0, 3, 8, c.m); p.rect(9, 2, 7, 3, c.m);
    p.rect(12, 1, 1, 6, c.l); p.rect(10, 3, 5, 1, c.l);
    p.set(14, 6, c.d); p.set(10, 5, c.d);
  },
  multiplication(p, c) {
    p.line(3, 3, 13, 13, c.m); p.line(13, 3, 3, 13, c.m);
    p.line(4, 3, 13, 12, c.l); p.line(13, 4, 4, 13, c.d);
    p.line(3, 4, 12, 13, c.d); p.line(12, 3, 3, 12, c.l);
  },
  division(p, c) {
    p.rect(2, 7, 12, 2, c.m); p.rect(2, 7, 12, 1, c.l);
    p.rect(6, 2, 4, 3, c.m); p.rect(6, 11, 4, 3, c.m);
    p.rect(6, 2, 4, 1, c.l); p.rect(6, 11, 4, 1, c.l);
  },
  moins(p, c) {
    p.rect(1, 6, 14, 4, c.m); p.rect(1, 6, 14, 1, c.l); p.rect(1, 9, 14, 1, c.d);
  },
  egal(p, c) {
    p.rect(2, 2, 12, 12, c.d);
    p.rect(3, 3, 10, 10, c.m);
    p.rect(4, 5, 8, 2, c.l); p.rect(4, 9, 8, 2, c.l);
    p.rect(3, 3, 10, 1, c.l);
  },
  racine(p, c) {
    // symbole √ sur un manche de pioche
    p.line(5, 15, 13, 5, c.h); p.line(6, 15, 14, 5, c.hl);
    p.line(1, 8, 3, 11, c.m); p.line(3, 11, 6, 3, c.m); p.line(6, 3, 15, 3, c.m);
    p.line(2, 8, 3, 10, c.l); p.line(6, 4, 14, 4, c.d);
    p.line(4, 10, 6, 4, c.d);
  },
  pi(p, c) {
    p.rect(1, 3, 14, 2, c.m); p.rect(1, 3, 14, 1, c.l);
    p.rect(4, 5, 2, 9, c.m); p.rect(10, 5, 2, 8, c.m);
    p.rect(4, 5, 1, 9, c.l); p.rect(10, 5, 1, 8, c.l);
    p.set(11, 14, c.d); p.set(12, 14, c.d); p.set(3, 3, c.d);
    p.set(5, 13, c.d); p.set(5, 14, c.d);
  },
  paralleles(p, c) {
    p.line(3, 12, 11, 4, c.m); p.line(6, 15, 14, 7, c.m);
    p.line(4, 12, 11, 5, c.l); p.line(7, 15, 14, 8, c.d);
    p.set(12, 3, c.l); p.set(15, 6, c.l);
    p.line(1, 14, 3, 12, c.h); p.line(3, 15, 5, 13, c.h);
  },
  perpendiculaire(p, c) {
    p.rect(2, 13, 12, 2, c.m); p.rect(2, 13, 12, 1, c.l);
    p.rect(7, 2, 2, 11, c.m); p.rect(7, 2, 1, 11, c.l);
    p.rect(9, 11, 3, 2, c.d); p.set(9, 10, c.d);
  },
  triangle(p, c) {
    p.poly([[8, 2], [14, 13], [2, 13]], c.m, true);
    p.poly([[8, 5], [11, 11], [5, 11]], c.l);
    p.line(2, 13, 14, 13, c.d); p.line(8, 2, 14, 13, c.d);
  },
  carre(p, c) {
    p.rect(2, 2, 12, 12, c.d); p.rect(3, 3, 10, 10, c.m);
    p.rect(3, 3, 10, 1, c.l); p.rect(3, 3, 1, 10, c.l);
    p.rect(6, 6, 4, 4, c.l);
  },
  rectangle(p, c) {
    p.rect(0, 4, 16, 8, c.d); p.rect(1, 5, 14, 6, c.m);
    p.rect(1, 5, 14, 1, c.l); p.rect(1, 5, 1, 6, c.l);
    p.rect(6, 7, 4, 2, c.l);
  },
  ovale(p, c) {
    for (let a = 0; a < 360; a += 5) {
      const r = (a * Math.PI) / 180;
      for (let t = 0.2; t <= 1; t += 0.2) p.set(8 + Math.cos(r) * 7 * t, 8 + Math.sin(r) * 4.5 * t, t > 0.85 ? c.d : c.m);
    }
    p.line(4, 7, 8, 5, c.l); p.line(5, 6, 10, 5, c.l);
  },
  losange(p, c) {
    p.poly([[8, 1], [14, 8], [8, 15], [2, 8]], c.m, true);
    p.poly([[8, 4], [11, 8], [8, 12], [5, 8]], c.l);
    p.line(8, 15, 14, 8, c.d); p.line(8, 15, 2, 8, c.d);
  },
  trapeze(p, c) {
    p.poly([[1, 13], [15, 13], [11, 4], [5, 4]], c.m, true);
    p.line(5, 4, 11, 4, c.l); p.line(1, 13, 5, 4, c.l);
    p.line(1, 13, 15, 13, c.d); p.line(15, 13, 11, 4, c.d);
    p.rect(6, 7, 4, 3, c.l);
  },
  hexagone(p, c) {
    p.poly([[4, 2], [12, 2], [15, 8], [12, 14], [4, 14], [1, 8]], c.m, true);
    p.poly([[6, 5], [10, 5], [11, 8], [10, 11], [6, 11], [5, 8]], c.l);
    p.line(4, 14, 12, 14, c.d); p.line(12, 14, 15, 8, c.d);
  },
  sinus(p, c) {
    for (let x = 0; x < 16; x++) {
      const y = 8 - Math.sin((x / 15) * Math.PI * 2) * 5;
      p.set(x, y, c.m); p.set(x, y + 1, c.d); p.set(x, y - 1, c.l);
    }
    p.line(0, 8, 15, 8, c.d);
  },
  integrale(p, c) {
    p.line(11, 1, 9, 2, c.m); p.line(9, 2, 8, 5, c.m);
    p.line(8, 5, 8, 11, c.m); p.line(8, 11, 7, 14, c.m); p.line(7, 14, 4, 15, c.m);
    p.line(9, 5, 9, 11, c.l); p.line(7, 5, 7, 11, c.d);
    p.set(12, 1, c.l); p.set(12, 2, c.l); p.set(3, 14, c.l); p.set(3, 13, c.l);
  },
};

const iconCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

function blockIcon(blockId: number): HTMLCanvasElement {
  const b = BLOCKS[blockId];
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const top = tileCanvas(b.tiles[2]), left = tileCanvas(b.tiles[4]), right = tileCanvas(b.tiles[0]);
  const shape = b.render;
  g.save();
  g.setTransform(14 / 16, 7 / 16, -14 / 16, 7 / 16, 16, 2);
  if (shape === 'pyramid' || shape === 'dome') { /* faces dessinées plus bas */ }
  g.drawImage(top, 0, 0);
  g.restore();
  g.save();
  g.setTransform(14 / 16, 7 / 16, 0, 14 / 16, 2, 9);
  g.drawImage(left, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 16, 16);
  g.restore();
  g.save();
  g.setTransform(14 / 16, -7 / 16, 0, 14 / 16, 16, 16);
  g.drawImage(right, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 16, 16);
  g.restore();
  if (shape === 'boxes' && (b.name.startsWith('stairs') || b.name.startsWith('roof'))) {
    // cran d'escalier : gomme l'angle supérieur arrière
    g.clearRect(6, 0, 20, 8);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.restore();
  }
  return c;
}

function drawIngot(p: Pix, c: Pal) {
  p.poly([[2, 9], [9, 4], [14, 7], [7, 12]], c.m, true);
  p.line(2, 9, 9, 4, c.l); p.line(9, 4, 14, 7, c.l);
  p.line(2, 9, 2, 11, c.d); p.line(2, 11, 7, 14, c.d); p.line(7, 14, 14, 9, c.d); p.line(14, 7, 14, 9, c.d);
  p.poly([[2, 10], [7, 13], [7, 12], [2, 9]], c.d, true);
  p.poly([[7, 13], [14, 8], [14, 7], [7, 12]], c.m, true);
}

function drawGem(p: Pix, c: Pal) {
  p.poly([[4, 4], [12, 4], [14, 7], [8, 14], [2, 7]], c.m, true);
  p.line(4, 4, 8, 7, c.l); p.line(12, 4, 8, 7, c.d); p.line(2, 7, 14, 7, c.l);
  p.line(8, 7, 8, 14, c.d); p.line(4, 4, 12, 4, c.l);
  p.set(5, 5, '#fff'); p.set(6, 5, '#fff');
}

function drawCrystal(p: Pix, c: Pal) {
  p.poly([[8, 1], [12, 6], [10, 14], [6, 14], [4, 6]], c.m, true);
  p.line(8, 1, 6, 14, c.l); p.line(8, 1, 12, 6, c.d); p.line(12, 6, 10, 14, c.d);
  p.line(4, 6, 12, 6, c.l);
  p.poly([[2, 9], [5, 7], [5, 14], [3, 14]], c.d, true);
  p.set(8, 4, '#fff'); p.set(7, 6, '#fff');
}

function drawApple(p: Pix) {
  p.circle(7, 9, 4, '#d62828', true); p.circle(10, 9, 3, '#d62828', true);
  p.set(5, 7, '#ff8f8f'); p.set(6, 6, '#ff8f8f'); p.set(5, 8, '#ff8f8f');
  p.line(8, 5, 9, 2, '#6b4a1e'); p.line(10, 3, 13, 2, '#3fa535'); p.line(10, 4, 12, 4, '#3fa535');
  p.line(5, 12, 10, 13, '#8c1414');
}

export function itemIcon(id: string): HTMLCanvasElement {
  let c = iconCache.get(id);
  if (c) return c;
  const it = ITEMS[id];
  if (!it) return (c = document.createElement('canvas'));
  if (it.type === 'block') c = blockIcon(it.block!);
  else {
    const p = new Pix(16);
    if (it.type === 'weapon') {
      const m = MAT[it.mat!];
      const pal: Pal = { m: m.main, l: m.light, d: m.dark, ...HANDLE };
      painters[it.kind!](p, pal);
    } else if (it.type === 'res') {
      const pal: Pal = id === 'res_cuivre' ? { m: '#d1814f', l: '#f6b184', d: '#8a4a26', ...HANDLE }
        : id === 'res_fer' ? { m: '#d6d6dc', l: '#ffffff', d: '#8a8a94', ...HANDLE }
        : id === 'res_or' ? { m: '#f5d33f', l: '#fff4a0', d: '#b08a10', ...HANDLE }
        : id === 'res_diamant' ? { m: '#4be8e0', l: '#cffffc', d: '#1a9a96', ...HANDLE }
        : { m: '#a45df0', l: '#e6ccff', d: '#5b2ca8', ...HANDLE };
      if (id === 'res_diamant') drawGem(p, pal);
      else if (id === 'res_cristal') drawCrystal(p, pal);
      else drawIngot(p, pal);
    } else drawApple(p);
    p.outline();
    c = p.c;
  }
  iconCache.set(id, c);
  return c;
}

export function iconURL(id: string): string {
  let u = urlCache.get(id);
  if (!u) { u = itemIcon(id).toDataURL(); urlCache.set(id, u); }
  return u;
}

export function itemImg(id: string): HTMLImageElement {
  const im = document.createElement('img');
  im.className = 'item-img px';
  im.src = iconURL(id);
  im.draggable = false;
  return im;
}

export { KIND };
