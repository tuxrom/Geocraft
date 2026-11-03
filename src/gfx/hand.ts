import * as THREE from 'three';
import { itemModel } from './itemModel';
import { ITEMS } from '../data/items';

/** Objet tenu en main (première personne), rendu dans une scène séparée. */
export class Hand {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private id: string | null = null;
  private swingT = 1;
  private equip = 1;
  private useT = 0;
  private block = false;
  mining = false;
  shield = false;
  time = 0;

  constructor() {
    this.scene.add(this.camera);
    this.camera.add(this.group);
  }

  resize(aspect: number) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  set(id: string | null) {
    if (id === this.id) return;
    this.id = id;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh = null; }
    this.equip = 0;
    if (!id || !ITEMS[id]) return;
    this.mesh = itemModel(id, true);
    this.block = ITEMS[id].type === 'block';
    this.mesh.scale.setScalar(this.block ? 0.17 : 0.22);
    this.group.add(this.mesh);
  }

  swing() { this.swingT = 0; }
  use() { this.useT = 0; }

  update(dt: number, walk: number, sprinting: boolean) {
    this.time += dt;
    this.equip = Math.min(1, this.equip + dt * 5);
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt * 3.6);
    if (this.useT < 1) this.useT = Math.min(1, this.useT + dt * 2.5);
    if (this.mining && this.swingT >= 1) this.swingT = 0;
    const s = Math.sin(this.swingT * Math.PI);
    const s2 = Math.sin(Math.sqrt(this.swingT) * Math.PI);
    const bobx = Math.sin(this.time * 7) * 0.012 * walk, boby = Math.abs(Math.cos(this.time * 7)) * 0.012 * walk;
    const eq = (1 - this.equip) * 0.6;
    if (this.block) {
      this.group.position.set(0.36 + bobx - s2 * 0.1, -0.3 + boby - eq - s * 0.1, -0.75 - s * 0.2);
      this.group.rotation.set(-s * 0.3, 0.55 + s2 * 0.2, 0);
      if (this.mesh) this.mesh.rotation.set(0.1, 0.4, 0);
    } else if (this.shield) {
      this.group.position.set(0.1, -0.2 - eq, -0.65);
      this.group.rotation.set(0.1, 0, 0);
      if (this.mesh) this.mesh.rotation.set(0, 0, 0);
    } else {
      this.group.position.set(0.3 + bobx - s2 * 0.1, -0.27 + boby - eq - s2 * 0.05 - (sprinting ? 0.04 : 0), -0.58 - s * 0.1);
      this.group.rotation.set(0.1 - s2 * 1.2 + Math.sin(this.useT * Math.PI) * 0.4, -0.35 - s2 * 0.3, 0.2 + s2 * 0.5);
      if (this.mesh) this.mesh.rotation.set(0, Math.PI * 0.12, -0.15);
    }
  }
}
