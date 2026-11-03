import * as THREE from 'three';
import type { World } from '../world/world';
import type { Input } from './input';
import type { Settings } from './settings';
import { moveBody, type Body } from './physics';
import { clamp } from '../core/constants';

export class Player {
  body: Body = { x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, hw: 0.3, h: 1.8, onGround: false, hitX: false, hitZ: false };
  yaw = 0;
  pitch = 0;
  health = 20;
  maxHealth = 20;
  flying = false;
  inWater = false;
  headInWater = false;
  crouching = false;
  sprinting = false;
  onLadder = false;
  fallPeak = 0;
  hurtTimer = 0;
  invuln = 0;
  walkDist = 0;
  bob = 0;
  dead = false;
  creative = false;
  jumpLast = -10;
  eye = 1.62;
  speedMul = 1;
  slowTimer = 0;
  onFall?: (dmg: number) => void;
  onStep?: () => void;
  onSplash?: () => void;
  onJump?: () => void;
  private jumpWasDown = false;
  private flyTapTime = -10;

  get pos() { return new THREE.Vector3(this.body.x, this.body.y, this.body.z); }
  eyePos(out = new THREE.Vector3()) { return out.set(this.body.x, this.body.y + this.eye, this.body.z); }
  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  teleport(x: number, y: number, z: number) {
    const b = this.body;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0;
    this.fallPeak = y;
  }

  update(dt: number, w: World, inp: Input, s: Settings, time: number) {
    const b = this.body;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.slowTimer > 0) this.slowTimer -= dt; else this.speedMul = 1;

    // regard
    if (inp.locked) {
      const k = 0.0022 * s.sensitivity;
      this.yaw -= inp.dx * k;
      this.pitch -= inp.dy * k * (s.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }

    const active = inp.locked && inp.enabled;
    let fwd = 0, side = 0;
    if (active) {
      if (inp.isDown('forward')) fwd += 1;
      if (inp.isDown('back')) fwd -= 1;
      if (inp.isDown('right')) side += 1;
      if (inp.isDown('left')) side -= 1;
    }
    const wantJump = active && inp.isDown('jump');
    const wantCrouch = active && inp.isDown('crouch');

    // double appui sur espace : vol (créatif)
    if (this.creative && active && wantJump && !this.jumpWasDown) {
      if (time - this.flyTapTime < 0.3) { this.flying = !this.flying; b.vy = 0; }
      this.flyTapTime = time;
    }
    this.jumpWasDown = wantJump;
    if (!this.creative) this.flying = false;

    // environnement
    this.inWater = w.inLiquid(b.x - b.hw, b.y + 0.2, b.z - b.hw, b.x + b.hw, b.y + 0.6, b.z + b.hw);
    this.headInWater = w.inLiquid(b.x, b.y + this.eye, b.z, b.x, b.y + this.eye, b.z);
    this.onLadder = w.inClimb(b.x - b.hw, b.y, b.z - b.hw, b.x + b.hw, b.y + 1, b.z + b.hw);

    // accroupi
    const wasCrouch = this.crouching;
    this.crouching = wantCrouch && !this.flying;
    if (this.crouching) { b.h = 1.5; this.eye = 1.27; }
    else if (wasCrouch) {
      // se relever seulement s'il y a la place
      if (!w.collides(b.x - b.hw, b.y, b.z - b.hw, b.x + b.hw, b.y + 1.8, b.z + b.hw)) { b.h = 1.8; this.eye = 1.62; }
      else this.crouching = true;
    } else { b.h = 1.8; this.eye = 1.62; }

    this.sprinting = active && inp.isDown('sprint') && fwd > 0 && !this.crouching;

    let speed = 4.3;
    if (this.sprinting) speed = 5.8;
    if (this.crouching) speed = 1.6;
    if (this.inWater) speed *= 0.6;
    if (this.flying) speed = this.sprinting ? 16 : 9;
    speed *= this.speedMul;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * side;
    let wz = -cy * fwd - sy * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    const tx = wx * speed, tz = wz * speed;
    const accel = this.flying ? 12 : b.onGround ? 14 : this.inWater ? 8 : 3.2;
    const k = 1 - Math.exp(-accel * dt);
    b.vx += (tx - b.vx) * k;
    b.vz += (tz - b.vz) * k;

    // vertical
    if (this.flying) {
      const up = (wantJump ? 1 : 0) - (wantCrouch ? 1 : 0);
      const ty = up * (this.sprinting ? 14 : 9);
      b.vy += (ty - b.vy) * (1 - Math.exp(-10 * dt));
    } else if (this.onLadder) {
      let ty = -1.8;
      if (wantJump || fwd > 0) ty = 3.6;
      else if (wantCrouch) ty = 0;
      b.vy += (ty - b.vy) * (1 - Math.exp(-12 * dt));
      if (this.crouching && !wantJump) b.vy = 0;
    } else if (this.inWater) {
      b.vy -= 9 * dt;
      if (wantJump) b.vy += 26 * dt;
      b.vy = clamp(b.vy, -3.2, 4.2);
    } else {
      b.vy -= 30 * dt;
      if (b.vy < -50) b.vy = -50;
      if (wantJump && b.onGround) { b.vy = 9; this.onJump?.(); }
    }

    // arête : l'accroupi ne tombe pas
    const ox = b.x, oz = b.z;
    const wasGround = b.onGround;
    moveBody(w, b, dt, this.crouching || this.flying ? 0.6 : 0.6);
    if (this.crouching && wasGround && !this.flying) {
      if (!w.collides(b.x - b.hw, b.y - 0.55, b.z - b.hw, b.x + b.hw, b.y, b.z + b.hw) && b.vy <= 0) {
        // retente axe par axe
        const nx = b.x, nz = b.z;
        b.x = ox; b.z = nz;
        if (!w.collides(b.x - b.hw, b.y - 0.55, b.z - b.hw, b.x + b.hw, b.y, b.z + b.hw)) { b.x = ox; b.z = oz; b.vx = b.vz = 0; }
        else {
          b.x = nx; b.z = oz;
          if (!w.collides(b.x - b.hw, b.y - 0.55, b.z - b.hw, b.x + b.hw, b.y, b.z + b.hw)) { b.x = ox; b.z = oz; b.vx = b.vz = 0; }
        }
      }
    }

    // chute
    if (this.flying || this.inWater || this.onLadder) this.fallPeak = b.y;
    else if (b.onGround) {
      const dist = this.fallPeak - b.y;
      if (dist > 3.4 && !this.creative) this.onFall?.(Math.floor(dist - 3));
      this.fallPeak = b.y;
    } else if (b.y > this.fallPeak) this.fallPeak = b.y;

    // pas et balancement
    const hs = Math.hypot(b.vx, b.vz);
    if (b.onGround && hs > 0.5) {
      this.walkDist += hs * dt;
      this.bob += hs * dt * 1.9;
      const stride = this.sprinting ? 2.0 : 1.55;
      if (this.walkDist > stride) { this.walkDist = 0; this.onStep?.(); }
    } else this.bob *= 0.9;
  }
}
