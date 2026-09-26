import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/*
 * 3D models: CC0 packs by Quaternius (https://quaternius.com), downloaded from poly.pizza and
 * optimised by assets-src/build.mjs — Ultimate Modular Men Pack (Adventurer), Toon Shooter Game Kit,
 * Stylized Nature MegaKit, Ultimate Stylized Nature Pack, Medieval Village Pack and Furniture Pack.
 */
const FILES = {
  adventurer: 'models/adventurer.glb',
  rifle: 'models/rifle.glb',
  grunt: 'models/grunt.glb',
  hazmat: 'models/hazmat.glb',
  nature: 'models/nature.glb',
  village: 'models/village.glb',
} as const;

export type AssetKey = keyof typeof FILES;

export class Assets {
  readonly gltf = {} as Record<AssetKey, GLTF>;
  private templates = new Map<string, THREE.Object3D>();

  async load(onProgress: (p: number) => void) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const keys = Object.keys(FILES) as AssetKey[];
    const progress = new Map<AssetKey, number>();
    const report = () => onProgress([...progress.values()].reduce((a, b) => a + b, 0) / keys.length);
    const fetchModel = (key: AssetKey, attempt = 0): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        loader.load(
          `${import.meta.env.BASE_URL}${FILES[key]}`,
          (g) => {
            this.gltf[key] = g;
            progress.set(key, 1);
            report();
            resolve();
          },
          (e) => {
            if (e.total) progress.set(key, e.loaded / e.total);
            report();
          },
          // Flaky mobile networks and cold CDN edges: retry twice with a short backoff.
          (err) => (attempt < 2 ? setTimeout(() => fetchModel(key, attempt + 1).then(resolve, reject), 400 * (attempt + 1)) : reject(err)),
        );
      });
    await Promise.all(keys.map((key) => fetchModel(key)));
    for (const key of ['nature', 'village'] as const) {
      this.gltf[key].scene.updateMatrixWorld(true);
      for (const child of this.gltf[key].scene.children) this.templates.set(child.name, child);
    }
  }

  /** A top-level node from nature.glb or village.glb, by name (e.g. "Tree_1", "Inn"). */
  template(name: string) {
    const t = this.templates.get(name);
    if (!t) throw new Error(`Missing model template "${name}"`);
    return t;
  }

  /** Deep clone of a template with cloned materials (safe to tint/fade). */
  instance(name: string, shadows = true) {
    const obj = this.template(name).clone(true);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        m.receiveShadow = true;
      }
    });
    return obj;
  }
}
