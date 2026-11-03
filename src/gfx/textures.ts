import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, TILE_NAMES, TILE_INDEX } from '../data/blocks';
import { mulberry32 } from '../core/rng';

type RGB = [number, number, number];
const T = 16;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}
const hex = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;
const shade = (c: RGB, k: number): string => hex(c[0] * k, c[1] * k, c[2] * k);

/** Remplit un fond bruité à partir d'une couleur de base. */
function noisy(ctx: CanvasRenderingContext2D, base: RGB, seed: number, amp = 0.14, rect: [number, number, number, number] = [0, 0, T, T]) {
  const r = mulberry32(seed);
  for (let y = rect[1]; y < rect[1] + rect[3]; y++)
    for (let x = rect[0]; x < rect[0] + rect[2]; x++) px(ctx, x, y, shade(base, 1 - amp + r() * amp * 2));
}

function ore(ctx: CanvasRenderingContext2D, seed: number, col: RGB, shine?: RGB) {
  noisy(ctx, [128, 128, 128], 3, 0.1);
  const r = mulberry32(seed);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(r() * 11), cy = 2 + Math.floor(r() * 11);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) {
      if (r() < 0.82) px(ctx, cx + dx, cy + dy, shade(col, 0.8 + r() * 0.4));
    }
    if (shine) px(ctx, cx, cy, hex(shine[0], shine[1], shine[2]));
  }
}

type Painter = (ctx: CanvasRenderingContext2D) => void;

const painters: Record<string, Painter> = {
  grass_top: (c) => noisy(c, [92, 168, 52], 11, 0.12),
  grass_side: (c) => {
    noisy(c, [134, 96, 62], 12, 0.12);
    const r = mulberry32(13);
    for (let x = 0; x < T; x++) {
      const h = 3 + Math.floor(r() * 3);
      for (let y = 0; y < h; y++) px(c, x, y, shade([92, 168, 52], 0.88 + r() * 0.2));
    }
  },
  dirt: (c) => {
    noisy(c, [134, 96, 62], 14, 0.14);
    const r = mulberry32(15);
    for (let i = 0; i < 12; i++) px(c, Math.floor(r() * T), Math.floor(r() * T), shade([100, 70, 45], 0.9));
  },
  stone: (c) => {
    noisy(c, [127, 127, 127], 16, 0.1);
    const r = mulberry32(17);
    for (let i = 0; i < 14; i++) px(c, Math.floor(r() * T), Math.floor(r() * T), shade([100, 100, 100], 0.85 + r() * 0.2));
  },
  sand: (c) => {
    noisy(c, [222, 207, 150], 18, 0.07);
    const r = mulberry32(19);
    for (let i = 0; i < 10; i++) px(c, Math.floor(r() * T), Math.floor(r() * T), shade([200, 185, 130], 1));
  },
  gravel: (c) => {
    noisy(c, [135, 130, 128], 20, 0.2);
    const r = mulberry32(21);
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(r() * 14), y = Math.floor(r() * 14);
      const col: RGB = r() < 0.5 ? [105, 100, 100] : [165, 160, 155];
      px(c, x, y, shade(col, 1)); px(c, x + 1, y, shade(col, 0.9)); px(c, x, y + 1, shade(col, 0.95));
    }
  },
  water: (c) => {
    const r = mulberry32(22);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = 0.9 + 0.12 * Math.sin((x + y * 0.6) * 0.9) + r() * 0.04;
      c.fillStyle = `rgba(${(52 * w) | 0},${(110 * w) | 0},${(220 * w) | 0},0.62)`;
      c.fillRect(x, y, 1, 1);
    }
  },
  log_top: (c) => {
    noisy(c, [160, 125, 75], 23, 0.06);
    for (let r = 0; r < 8; r++) {
      const col = r % 2 === 0 ? shade([120, 88, 50], 1) : shade([175, 140, 85], 1);
      c.strokeStyle = col; c.lineWidth = 1;
      c.strokeRect(0.5 + r, 0.5 + r, T - 1 - 2 * r, T - 1 - 2 * r);
    }
    c.strokeStyle = shade([85, 62, 35], 1); c.strokeRect(0.5, 0.5, T - 1, T - 1);
  },
  log_side: (c) => {
    const r = mulberry32(24);
    for (let x = 0; x < T; x++) {
      const k = 0.78 + (x % 3 === 0 ? 0.12 : 0) + r() * 0.1;
      for (let y = 0; y < T; y++) px(c, x, y, shade([102, 78, 46], k + (r() - 0.5) * 0.06));
    }
  },
  leaves: (c) => {
    const r = mulberry32(25);
    c.clearRect(0, 0, T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (r() < 0.17) continue;
      px(c, x, y, shade([48, 130, 40], 0.65 + r() * 0.55));
    }
  },
  planks: (c) => {
    noisy(c, [176, 138, 82], 26, 0.07);
    c.fillStyle = shade([110, 80, 45], 1);
    for (const y of [0, 5, 10, 15]) c.fillRect(0, y, T, 1);
    const r = mulberry32(27);
    for (let i = 0; i < 4; i++) {
      const y0 = i * 5 + 1; const x = 2 + Math.floor(r() * 12);
      c.fillRect(x, y0, 1, 4);
    }
  },
  bedrock: (c) => {
    noisy(c, [60, 60, 60], 28, 0.45);
  },
  copper_ore: (c) => ore(c, 31, [205, 124, 82], [255, 190, 140]),
  iron_ore: (c) => ore(c, 32, [216, 175, 147]),
  gold_ore: (c) => ore(c, 33, [252, 222, 64], [255, 250, 190]),
  diamond_ore: (c) => ore(c, 34, [80, 232, 228], [220, 255, 255]),
  euclid_ore: (c) => {
    ore(c, 35, [150, 90, 240], [235, 210, 255]);
    // petits triangles brillants
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.beginPath(); c.moveTo(3, 12); c.lineTo(8, 4); c.lineTo(12, 12); c.closePath(); c.stroke();
  },
  stone_bricks: (c) => {
    noisy(c, [135, 135, 135], 36, 0.07);
    c.fillStyle = shade([88, 88, 88], 1);
    for (const y of [0, 5, 10, 15]) c.fillRect(0, y, T, 1);
    for (const [x0, y0] of [[4, 1], [11, 1], [0, 6], [7, 6], [14, 6], [4, 11], [11, 11]]) c.fillRect(x0, y0, 1, 4);
  },
  glass: (c) => {
    c.clearRect(0, 0, T, T);
    c.strokeStyle = 'rgba(200,235,255,1)'; c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, T - 1, T - 1);
    px(c, 3, 3, 'rgb(255,255,255)'); px(c, 4, 4, 'rgb(255,255,255)'); px(c, 5, 5, 'rgb(230,245,255)');
    px(c, 10, 8, 'rgb(255,255,255)'); px(c, 11, 9, 'rgb(230,245,255)');
  },
  snow: (c) => noisy(c, [244, 248, 252], 37, 0.04),
  altar_top: (c) => {
    noisy(c, [60, 40, 90], 38, 0.08);
    c.strokeStyle = 'rgb(210,170,255)'; c.lineWidth = 1;
    c.strokeRect(1.5, 1.5, 13, 13);
    c.beginPath(); c.moveTo(3, 12); c.lineTo(8, 3); c.lineTo(13, 12); c.closePath(); c.stroke();
    px(c, 8, 9, 'rgb(255,255,255)');
  },
  altar_side: (c) => {
    noisy(c, [70, 50, 100], 39, 0.08);
    c.fillStyle = 'rgb(210,170,255)';
    c.fillRect(0, 0, T, 2); c.fillRect(0, 14, T, 2);
    c.fillRect(7, 5, 2, 6); c.fillRect(5, 7, 6, 2);
  },
  roof: (c) => {
    noisy(c, [178, 70, 52], 40, 0.08);
    c.fillStyle = shade([110, 40, 30], 1);
    for (const y of [3, 7, 11, 15]) c.fillRect(0, y, T, 1);
    for (let row = 0; row < 4; row++) for (let x = (row % 2) * 4; x < T; x += 8) c.fillRect(x, row * 4, 1, 3);
  },
  ladder: (c) => {
    c.clearRect(0, 0, T, T);
    c.fillStyle = shade([150, 110, 60], 1);
    c.fillRect(2, 0, 2, T); c.fillRect(12, 0, 2, T);
    c.fillStyle = shade([176, 138, 82], 1);
    for (const y of [2, 6, 10, 14]) c.fillRect(4, y, 8, 2);
  },
  door: (c) => {
    noisy(c, [150, 108, 60], 41, 0.07);
    c.fillStyle = shade([95, 66, 34], 1);
    c.fillRect(0, 0, T, 1); c.fillRect(0, 15, T, 1); c.fillRect(0, 0, 1, T); c.fillRect(15, 0, 1, T);
    c.fillRect(3, 3, 10, 1); c.fillRect(3, 12, 10, 1); c.fillRect(3, 3, 1, 10); c.fillRect(12, 3, 1, 10);
    c.fillStyle = 'rgb(240,200,80)'; c.fillRect(11, 8, 2, 2);
  },
  prism: (c) => {
    noisy(c, [200, 225, 245], 42, 0.05);
    c.strokeStyle = 'rgb(110,150,200)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 15.5); c.lineTo(8, 1.5); c.lineTo(16, 15.5); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(4, 8.5); c.lineTo(12, 8.5); c.stroke();
  },
  pyramid: (c) => {
    noisy(c, [226, 190, 96], 43, 0.06);
    c.strokeStyle = 'rgb(150,110,40)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(16, 16); c.moveTo(16, 0); c.lineTo(0, 16); c.stroke();
    c.strokeRect(0.5, 0.5, 15, 15);
  },
  dome: (c) => {
    noisy(c, [90, 190, 200], 44, 0.05);
    c.strokeStyle = 'rgb(30,110,130)'; c.lineWidth = 1;
    for (const r of [3, 6, 9]) { c.beginPath(); c.arc(8, 8, r, 0, Math.PI * 2); c.stroke(); }
  },
};
export interface Atlas {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  avg: RGB[]; // couleur moyenne par tuile (particules)
}

let atlasCache: Atlas | null = null;
const tileCanvases: HTMLCanvasElement[] = [];

export function tileCanvas(name: string): HTMLCanvasElement {
  buildAtlas();
  return tileCanvases[TILE_INDEX[name]];
}

export function buildAtlas(): Atlas {
  if (atlasCache) return atlasCache;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * T;
  canvas.height = ATLAS_ROWS * T;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const avg: RGB[] = [];
  TILE_NAMES.forEach((name, i) => {
    const tc = document.createElement('canvas');
    tc.width = T; tc.height = T;
    const tctx = tc.getContext('2d', { willReadFrequently: true })!;
    (painters[name] ?? ((c) => noisy(c, [255, 0, 255], 1)))(tctx);
    tileCanvases[i] = tc;
    ctx.drawImage(tc, (i % ATLAS_COLS) * T, Math.floor(i / ATLAS_COLS) * T);
    const d = tctx.getImageData(0, 0, T, T).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let p = 0; p < d.length; p += 4) if (d[p + 3] > 100) { r += d[p]; g += d[p + 1]; b += d[p + 2]; n++; }
    avg[i] = n ? [r / n, g / n, b / n] : [128, 128, 128];
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  atlasCache = { canvas, texture, avg };
  return atlasCache;
}
