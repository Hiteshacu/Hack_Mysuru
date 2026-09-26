import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const WEAPONS = ['AK', 'Pistol', 'SMG', 'Shotgun'];

interface PlayOptions {
  fade?: number;
  once?: boolean;
  timeScale?: number;
}

/**
 * Skinned, animated character (Quaternius Toon Shooter Game Kit, CC0).
 * Handles clip cross-fading, weapon visibility, hit flashes, death and a translucent "spirit" mode.
 */
export class AnimatedCharacter {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private materials: THREE.MeshStandardMaterial[] = [];
  private baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private flashTime = 0;
  private weapon: THREE.Object3D | null = null;
  private muzzleLocal = new THREE.Vector3();
  ghost = false;

  constructor(
    gltf: GLTF,
    opts: {
      weapon: string;
      height?: number;
      extraClips?: THREE.AnimationClip[];
      tint?: string;
      attach?: { object: THREE.Object3D; bone: string; aimClip?: string; length?: number };
    },
  ) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    if (opts.attach) {
      // GLTFLoader sanitises node names ("Index1.R" → "Index1R"), so try both spellings.
      const bone = this.model.getObjectByName(opts.attach.bone) ?? this.model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(opts.attach.bone));
      if (bone) {
        const w = opts.attach.object.clone(true);
        w.name = opts.weapon;
        bone.add(w);
      }
    }

    // Normalise height so every character is ~1.8 m tall regardless of source scale.
    this.model.updateMatrixWorld(true);
    // Precise box evaluates skinned vertices with the current bone pose (source rigs use ×100 bone scales).
    const box = new THREE.Box3().setFromObject(this.model, true);
    const h = box.max.y - box.min.y;
    const scale = (opts.height ?? 1.8) / (h > 1 && h < 4 ? h : 2.2);
    this.model.scale.multiplyScalar(scale);

    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (WEAPONS.includes(o.name)) {
        o.visible = o.name === opts.weapon;
        if (o.visible) this.weapon = o;
      }
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.roughness = Math.max(0.55, c.roughness);
        c.envMapIntensity = 0.35; // skin/cloth shouldn't mirror the sky
        c.metalness = Math.min(0.2, c.metalness);
        if (opts.tint && /Main|Enemy_Red|Hazmat/.test(c.name)) c.color.lerp(new THREE.Color(opts.tint), 0.35);
        this.materials.push(c);
        this.baseEmissive.set(c, c.emissive.clone());
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });

    if (this.weapon) {
      const wb = new THREE.Box3().setFromObject(this.weapon);
      this.weapon.updateMatrixWorld(true);
      // Muzzle ≈ the far end of the weapon's longest axis, expressed in the weapon's local space.
      const size = wb.getSize(new THREE.Vector3());
      const far = new THREE.Vector3(wb.max.x, (wb.min.y + wb.max.y) / 2, (wb.min.z + wb.max.z) / 2);
      if (size.z > size.x) far.set((wb.min.x + wb.max.x) / 2, (wb.min.y + wb.max.y) / 2, wb.max.z);
      this.muzzleLocal.copy(this.weapon.worldToLocal(far));
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = [...gltf.animations];
    for (const extra of opts.extraClips ?? []) if (!clips.some((c) => c.name === extra.name)) clips.push(extra);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    if (opts.attach && this.weapon) this.alignWeapon(opts.attach.aimClip ?? 'Idle_Gun_Pointing', opts.attach.length ?? 0.82);
  }

  /**
   * Fits a weapon taken from a different rig: poses the skeleton in an aiming clip, then rotates/scales
   * the weapon so its barrel points along the character's forward axis with the magazine hanging down.
   * Barrel = longest bounding axis (muzzle on the longer side of the grip origin); up = away from the magazine.
   */
  private alignWeapon(aimClip: string, length: number) {
    const w = this.weapon!;
    const bone = w.parent!;
    w.position.set(0, 0, 0);
    w.quaternion.identity();
    w.scale.set(1, 1, 1);
    this.model.updateMatrixWorld(true);
    const inv = w.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    w.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    });
    const ext = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
    const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
    const axis = (i: number, sign: number) => new THREE.Vector3(i === 0 ? sign : 0, i === 1 ? sign : 0, i === 2 ? sign : 0);
    const a = order[0], b = order[1];
    const maxA = box.max.getComponent(a), minA = box.min.getComponent(a);
    // For the Toon Shooter AK the muzzle sits on the shorter side of the grip origin and the
    // magazine on the shorter vertical side (verified visually in-engine).
    const muzzleSign = maxA > -minA ? -1 : 1;
    const barrel = axis(a, muzzleSign);
    const maxB = box.max.getComponent(b), minB = box.min.getComponent(b);
    const up = axis(b, -minB > maxB ? -1 : 1);
    const side = new THREE.Vector3().crossVectors(up, barrel);
    const localBasis = new THREE.Matrix4().makeBasis(side, up, barrel);
    const targetBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    const qLocal = new THREE.Quaternion().setFromRotationMatrix(localBasis);
    const qTarget = new THREE.Quaternion().setFromRotationMatrix(targetBasis);
    const qAlign = qTarget.multiply(qLocal.invert());

    const action = this.actions.get(aimClip);
    if (action) {
      action.reset().play();
      this.mixer.update(0.25);
    }
    this.model.updateMatrixWorld(true);
    const qBone = bone.getWorldQuaternion(new THREE.Quaternion());
    w.quaternion.copy(qBone.invert().multiply(qAlign));
    const boneScale = bone.getWorldScale(new THREE.Vector3()).x;
    w.scale.setScalar(length / (ext[a] * boneScale));
    // Nudge the grip slightly into the palm.
    w.position.set(0, 0, 0);
    this.mixer.stopAllAction();
    this.muzzleLocal.copy(barrel).multiplyScalar(muzzleSign > 0 ? maxA : -minA);
  }

  has(name: string) {
    return this.actions.has(name);
  }

  get playing() {
    return this.current;
  }

  play(name: string, opts: PlayOptions = {}) {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = opts.timeScale ?? 1;
    if (this.current === name && !opts.once) return;
    const prev = this.actions.get(this.current);
    next.reset();
    next.enabled = true;
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, opts.fade ?? 0.2, false);
    this.current = name;
  }

  setTimeScale(scale: number) {
    const a = this.actions.get(this.current);
    if (a) a.timeScale = scale;
  }

  /** Remaining fraction of a one-shot clip (1 = just started, 0 = finished). */
  progress() {
    const a = this.actions.get(this.current);
    if (!a) return 0;
    return 1 - a.time / a.getClip().duration;
  }

  flash(color = '#ff3b2f') {
    this.flashTime = 0.12;
    for (const m of this.materials) m.emissive.set(color);
  }

  setGhost(on: boolean) {
    this.ghost = on;
    for (const m of this.materials) {
      m.transparent = on;
      m.opacity = on ? 0.32 : 1;
      m.depthWrite = !on;
      m.emissive.copy(on ? new THREE.Color('#5fb4ff') : this.baseEmissive.get(m)!);
      m.emissiveIntensity = on ? 0.6 : 1;
      m.needsUpdate = true;
    }
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = !on;
    });
    if (this.weapon) this.weapon.visible = !on;
  }

  setWeaponVisible(visible: boolean) {
    if (this.weapon) this.weapon.visible = visible && !this.ghost;
  }

  /** Fade the whole character out (used after enemy death). */
  setOpacity(opacity: number) {
    for (const m of this.materials) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
    }
  }

  muzzleWorld(target = new THREE.Vector3()) {
    if (!this.weapon) return this.root.getWorldPosition(target).add(new THREE.Vector3(0, 1.3, 0));
    this.weapon.updateWorldMatrix(true, false);
    return target.copy(this.muzzleLocal).applyMatrix4(this.weapon.matrixWorld);
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) for (const m of this.materials) m.emissive.copy(this.ghost ? new THREE.Color('#5fb4ff') : this.baseEmissive.get(m)!);
    }
  }
}
