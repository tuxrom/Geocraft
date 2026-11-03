import * as THREE from 'three';

/** Matériaux d'entités éclairés par le cycle jour/nuit (couleur de base x teinte). */
const registry: { mat: THREE.MeshBasicMaterial | THREE.SpriteMaterial; base: THREE.Color }[] = [];
export const entityTint = new THREE.Color(1, 1, 1);

export function litMaterial<T extends THREE.MeshBasicMaterial | THREE.SpriteMaterial>(mat: T): T {
  registry.push({ mat, base: mat.color.clone() });
  mat.color.copy(mat.color).multiply(entityTint);
  return mat;
}

export function applyEntityTint(day: number, tint: THREE.Color) {
  entityTint.setRGB(day * tint.r, day * tint.g, day * tint.b);
  for (const r of registry) r.mat.color.copy(r.base).multiply(entityTint);
}
