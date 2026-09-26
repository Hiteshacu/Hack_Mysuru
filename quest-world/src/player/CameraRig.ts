import * as THREE from 'three';
import type { Terrain } from '../world/Terrain';
import { angleLerp, clamp, damp } from '../utils/math';

/**
 * Third-person camera.
 * Explore: orbit by dragging, gently swings behind the character while walking.
 * Battle: over-the-shoulder, driven by pointer-lock mouse movement, with a centred crosshair.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.36;
  distance = 8.5;
  targetDistance = 8.5;
  sensitivity = 1;
  follow = true;
  cinematic = false;
  indoor = false;
  shoulder = false;
  scope = false;
  private scopeBlend = 0;
  locked = false;
  shake = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;

  /** Weapon kick: pushes the aim up (and slightly sideways), then settles back. */
  kick(amount: number) {
    this.recoilPitch -= amount;
    this.recoilYaw += (Math.random() - 0.5) * amount * 0.8;
  }

  get recoil() {
    return Math.abs(this.recoilPitch);
  }
  /** Keeps the camera inside a room (set by the experience while the player is indoors). */
  clampCamera?: (focus: THREE.Vector3, pos: THREE.Vector3) => void;
  readonly focus = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private initialised = false;
  private indoorBlend = 0;
  private shoulderBlend = 0;
  private camPos = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, private terrain: Terrain) {}

  snap(target: THREE.Vector3, yaw: number) {
    this.yaw = yaw;
    this.focus.copy(target).add(new THREE.Vector3(0, 1.5, 0));
    this.initialised = false;
  }

  /** Where the camera would sit for the current yaw/pitch/distance. */
  computeDesired(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    return out.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
  }

  /** Camera forward yaw as a character facing angle (the character looks where the camera looks). */
  get forwardFacing() {
    return this.yaw + Math.PI;
  }

  update(
    dt: number,
    player: THREE.Vector3,
    playerFacing: number,
    playerSpeed: number,
    input: { dragX: number; dragY: number; wheel: number; lastDragTime: number },
    now: number,
  ) {
    if (this.cinematic) return;
    this.scopeBlend += ((this.scope ? 1 : 0) - this.scopeBlend) * damp(12, dt);
    const mouseScale = (this.locked ? 0.0026 : 0.0055) * (1 - this.scopeBlend * 0.7);
    this.yaw -= input.dragX * mouseScale * this.sensitivity;
    this.pitch = clamp(this.pitch + input.dragY * (this.locked ? 0.0022 : 0.004) * this.sensitivity, -0.35, 1.2);
    this.targetDistance = clamp(this.targetDistance * (1 + input.wheel * 0.0011), 3.2, 18);

    this.shoulderBlend += ((this.shoulder ? 1 : 0) - this.shoulderBlend) * damp(6, dt);
    this.indoorBlend += ((this.indoor ? 1 : 0) - this.indoorBlend) * damp(4, dt);
    let want = this.targetDistance;
    want = want + (Math.min(want, 4.6) - want) * this.shoulderBlend;
    want = want + (1.1 - want) * this.scopeBlend;
    want = want + (Math.min(want, 3.6) - want) * this.indoorBlend;
    this.distance += (want - this.distance) * damp(8, dt);

    // Explore: ease the camera behind the character while moving (not while the user is dragging).
    if (this.follow && !this.shoulder && playerSpeed > 1.2 && now - input.lastDragTime > 1.2) {
      const behind = playerFacing + Math.PI;
      const diff = Math.abs(((((behind - this.yaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 2.4) this.yaw = angleLerp(this.yaw, behind, damp(0.8 * Math.min(1, playerSpeed / 5), dt));
    }

    const target = this.desired.copy(player);
    target.y += 1.5 - this.shoulderBlend * 0.1;
    // Over-the-shoulder: shift the focus to the character's right.
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const shoulderOffset = 0.75 * this.shoulderBlend * (1 - this.scopeBlend * 0.55);
    target.x += rightX * shoulderOffset;
    target.z += rightZ * shoulderOffset;
    target.y += this.scopeBlend * 0.3; // eye height through the scope
    if (!this.initialised) {
      this.focus.copy(target);
    } else {
      this.focus.x += (target.x - this.focus.x) * damp(14, dt);
      this.focus.z += (target.z - this.focus.z) * damp(14, dt);
      this.focus.y += (target.y - this.focus.y) * damp(8, dt);
    }

    // Recoil rides on top of the aim and decays back to it.
    this.recoilPitch += (0 - this.recoilPitch) * damp(7, dt);
    this.recoilYaw += (0 - this.recoilYaw) * damp(7, dt);
    const savedPitch = this.pitch + this.recoilPitch;
    // Indoors: a low, close over-the-shoulder view that stays under the ceiling (no top-down view).
    this.pitch = savedPitch + (clamp(savedPitch, 0.05, 0.42) - savedPitch) * this.indoorBlend;
    // Through the scope the camera stays near eye level so the view isn't buried in grass.
    this.pitch = this.pitch + (clamp(savedPitch, -0.25, 0.1) - this.pitch) * this.scopeBlend;
    const savedYaw = this.yaw;
    this.yaw += this.recoilYaw;
    const pos = this.computeDesired(new THREE.Vector3());
    this.yaw = savedYaw;
    this.pitch = savedPitch - this.recoilPitch;
    const minY = this.terrain.heightAt(pos.x, pos.z) + 0.6;
    if (pos.y < minY) pos.y = minY;
    if (this.indoor && this.clampCamera) {
      this.clampCamera(this.focus, pos);
      // Snap faster indoors so the camera never lingers outside a wall.
      this.camPos.lerp(pos, damp(40, dt));
    } else if (!this.initialised) this.camPos.copy(pos);
    else this.camPos.lerp(pos, damp(22, dt));
    if (this.indoor && this.clampCamera) this.clampCamera(this.focus, this.camPos);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.camera.lookAt(this.focus);
    this.initialised = true;

    const fov = (52 - this.shoulderBlend * 4 + clamp((playerSpeed - 5.8) / 3, 0, 1) * 6) * (1 - this.scopeBlend) + 17 * this.scopeBlend;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * damp(4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
