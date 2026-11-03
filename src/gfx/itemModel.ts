import * as THREE from 'three';
import { ITEMS } from '../data/items';
import { BLOCKS, FACE_TILE } from '../data/blocks';
import { itemIcon } from './icons';
import { litMaterial } from './lighting';
import { makeWorldMaterials } from './worldMaterial';

const cubeCache = new Map<number, THREE.BufferGeometry>();
const voxCache = new Map<string, THREE.BufferGeometry>();
let worldMat: THREE.ShaderMaterial | null = null;
let voxMat: THREE.MeshBasicMaterial | null = null;
let voxMatHand: THREE.MeshBasicMaterial | null = null;

/** Cube unitaire centré, avec les attributs du matériau de monde. */
export function blockCubeGeometry(id: number): THREE.BufferGeometry {
  let g = cubeCache.get(id);
  if (g) return g;
  const d = BLOCKS[id];
  const pos: number[] = [], uv: number[] = [], tile: number[] = [], light: number[] = [], idx: number[] = [];
  const faces: [number[], number, number][] = [
    [[1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1], 0, 0.72],
    [[0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0], 1, 0.72],
    [[0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0], 2, 1],
    [[0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], 3, 0.5],
    [[0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1], 4, 0.86],
    [[1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], 5, 0.86],
  ];
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  let n = 0;
  for (const [p, f, l] of faces) {
    for (let i = 0; i < 4; i++) {
      pos.push(p[i * 3] - 0.5, p[i * 3 + 1] - 0.5, p[i * 3 + 2] - 0.5);
      uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      tile.push(FACE_TILE[d.id * 6 + f]);
      light.push(l);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('tile', new THREE.Float32BufferAttribute(tile, 1));
  g.setAttribute('light', new THREE.Float32BufferAttribute(light, 1));
  g.setIndex(idx);
  cubeCache.set(id, g);
  return g;
}

/** Sprite extrudé en voxels depuis l'icône 16x16 (couleurs par sommet). */
export function voxelGeometry(itemId: string): THREE.BufferGeometry {
  let g = voxCache.get(itemId);
  if (g) return g;
  const cv = itemIcon(itemId);
  const S = cv.width;
  const data = cv.getContext('2d')!.getImageData(0, 0, S, S).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && data[(y * S + x) * 4 + 3] > 40;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let n = 0;
  const T = 1 / S; // épaisseur
  const quad = (p: number[], r: number, gr: number, b: number, k: number) => {
    for (let i = 0; i < 4; i++) { pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); col.push(r * k, gr * k, b * k); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y)) continue;
    const i = (y * S + x) * 4;
    const r = data[i] / 255, gg = data[i + 1] / 255, b = data[i + 2] / 255;
    const x0 = x / S - 0.5, x1 = (x + 1) / S - 0.5, y0 = 0.5 - (y + 1) / S, y1 = 0.5 - y / S, z0 = -T, z1 = T;
    quad([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], r, gg, b, 1); // avant
    quad([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], r, gg, b, 0.85); // arrière
    if (!solid(x, y - 1)) quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], r, gg, b, 0.95);
    if (!solid(x, y + 1)) quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], r, gg, b, 0.6);
    if (!solid(x + 1, y)) quad([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], r, gg, b, 0.75);
    if (!solid(x - 1, y)) quad([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], r, gg, b, 0.75);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  voxCache.set(itemId, g);
  return g;
}

/** Modèle 3D d'un objet : cube texturé pour un bloc, sprite extrudé sinon. */
export function itemModel(itemId: string, hand = false): THREE.Mesh {
  const it = ITEMS[itemId];
  if (it?.type === 'block') {
    if (!worldMat) worldMat = makeWorldMaterials().opaque;
    return new THREE.Mesh(blockCubeGeometry(it.block!), worldMat);
  }
  if (!voxMat) voxMat = litMaterial(new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (!voxMatHand) voxMatHand = litMaterial(new THREE.MeshBasicMaterial({ vertexColors: true }));
  return new THREE.Mesh(voxelGeometry(itemId), hand ? voxMatHand : voxMat);
}
