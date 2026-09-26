import * as THREE from 'three';
import type { Terrain } from '../world/Terrain';
import type { Colliders } from '../world/Colliders';
import { PLAY_RADIUS, WATER_LEVEL } from '../world/layout';
import { angleLerp, damp } from '../utils/math';

// Speeds are matched to the Adventurer's Walk/Run animation cycles to avoid foot sliding.
const WALK = 2.3;
const JOG = 5.6;
const SPRINT = 8.6;
const BATTLE = 4.6;
const GRAVITY = 26;
const JUMP = 8.8;
const RADIUS = 0.38;

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0;
  grounded = true;
  landed = false;
  inWater = false;
  moveTarget: THREE.Vector3 | null = null;
  private next = new THREE.Vector3();

  constructor(private terrain: Terrain, private colliders: Colliders) {}

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  teleport(x: number, z: number, facing: number) {
    this.position.set(x, this.groundAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.moveTarget = null;
    this.grounded = true;
  }

  /** When set, the character turns to face this yaw (aiming) instead of its movement direction. */
  aimYaw: number | null = null;

  groundAt(x: number, z: number) {
    return Math.max(this.terrain.heightAt(x, z), this.colliders.floorAt(x, z));
  }

  update(dt: number, axis: { x: number; y: number }, sprint: boolean, jump: boolean, cameraYaw: number, opts: { walk?: boolean; battle?: boolean } = {}) {
    this.landed = false;
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
    let dx = fx * axis.y + rx * axis.x;
    let dz = fz * axis.y + rz * axis.x;
    let amount = Math.min(1, Math.hypot(axis.x, axis.y));

    if (amount > 0.05) this.moveTarget = null;
    else if (this.moveTarget) {
      const tx = this.moveTarget.x - this.position.x, tz = this.moveTarget.z - this.position.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.5) this.moveTarget = null;
      else {
        dx = tx;
        dz = tz;
        amount = Math.min(1, d / 1.5);
      }
    }
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }

    const farTarget = !!this.moveTarget && this.moveTarget.distanceTo(this.position) > 14;
    let base = opts.walk || amount < 0.5 ? WALK : JOG;
    if (sprint || farTarget) base = SPRINT;
    if (opts.battle) base = Math.min(base, sprint ? JOG : BATTLE);
    const maxSpeed = base * (this.inWater ? 0.55 : 1);
    if (amount > 0.05 && !this.moveTarget) amount = 1;
    const targetVX = dx * maxSpeed * amount, targetVZ = dz * maxSpeed * amount;
    const accel = damp(this.grounded ? 11 : 2.5, dt);
    this.velocity.x += (targetVX - this.velocity.x) * accel;
    this.velocity.z += (targetVZ - this.velocity.z) * accel;

    // Horizontal move with axis-separated water/edge blocking so the player slides along shores.
    const tryMove = (nx: number, nz: number) => {
      const h = this.terrain.heightAt(nx, nz);
      const floor = this.colliders.floorAt(nx, nz);
      if (floor > this.position.y + 0.62) return false; // too high to step onto
      if (floor < -1e8 && h < WATER_LEVEL - 0.6) return false;
      const r = Math.hypot(nx, nz);
      if (r > PLAY_RADIUS && r > Math.hypot(this.position.x, this.position.z)) return false;
      return true;
    };
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    if (tryMove(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (tryMove(nx, this.position.z)) {
      this.position.x = nx;
      this.velocity.z *= 0.2;
    } else if (tryMove(this.position.x, nz)) {
      this.position.z = nz;
      this.velocity.x *= 0.2;
    } else {
      this.velocity.x *= 0.2;
      this.velocity.z *= 0.2;
      this.moveTarget = null;
    }

    this.next.copy(this.position);
    this.colliders.resolve(this.next, RADIUS);
    this.position.x = this.next.x;
    this.position.z = this.next.z;

    // Vertical
    const terrainY = this.terrain.heightAt(this.position.x, this.position.z);
    const ground = Math.max(terrainY, this.colliders.floorAt(this.position.x, this.position.z));
    this.inWater = ground < WATER_LEVEL - 0.12;
    if (jump && this.grounded) {
      this.velocity.y = JUMP;
      this.grounded = false;
    }
    this.velocity.y -= GRAVITY * dt;
    this.position.y += this.velocity.y * dt;
    if (this.grounded && this.velocity.y < 0 && this.position.y - ground < 0.45) {
      this.position.y = ground;
      this.velocity.y = 0;
    } else if (this.position.y <= ground) {
      if (!this.grounded) this.landed = true;
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.position.y - ground > 0.45) {
      this.grounded = false;
    }

    if (this.aimYaw !== null) {
      this.facing = angleLerp(this.facing, this.aimYaw, damp(22, dt));
    } else if (this.speed > 0.25) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = angleLerp(this.facing, target, damp(14, dt));
    }
  }
}
