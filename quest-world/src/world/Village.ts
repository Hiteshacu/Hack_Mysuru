import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { Colliders } from './Colliders';
import type { Terrain } from './Terrain';
import type { Labels } from './Labels';
import { enemySpawns, VILLAGE, villageBuildings, villageProps } from './layout';
import { mulberry32 } from '../utils/math';

const rnd = mulberry32(31337);

/** Medieval village (Quaternius Medieval Village Pack, CC0) plus sandbag outposts for the enemies. */
export class Village {
  readonly group = new THREE.Group();
  /** Exploding barrels the combat system can detonate. */
  readonly barrels: { mesh: THREE.Object3D; x: number; z: number; alive: boolean }[] = [];

  constructor(private terrain: Terrain, private colliders: Colliders, private assets: Assets, labels: Labels) {
    for (const b of villageBuildings) this.place(b.model, b.x, b.z, b.rot, b.scale, 'box');
    for (const p of villageProps) this.place(p.model, p.x, p.z, p.rot, p.scale, p.collide ? p.collide : undefined);

    // Outposts: a curved sandbag wall and a couple of explosive barrels at every enemy spawn.
    for (const e of enemySpawns) {
      const face = Math.atan2(-e.x, -e.z); // walls face the valley centre
      for (let k = -1; k <= 1; k += 2) {
        const a = face + k * 0.55;
        const wx = e.x + Math.sin(a) * 4.2, wz = e.z + Math.cos(a) * 4.2;
        this.place('SackTrench', wx, wz, a + Math.PI / 2, 1.1, 'box');
      }
      for (let i = 0; i < 2; i++) {
        const a = face + Math.PI + (i - 0.5) * 1.2;
        const bx = e.x + Math.sin(a) * 3.5, bz = e.z + Math.cos(a) * 3.5;
        const mesh = this.place('ExplodingBarrel', bx, bz, rnd() * 6, 1.1, 0.5);
        this.barrels.push({ mesh, x: bx, z: bz, alive: true });
      }
    }

    labels.create('Oakridge Village', new THREE.Vector3(VILLAGE.x, this.terrain.heightAt(VILLAGE.x, VILLAGE.z) + 17, VILLAGE.z - 4), {
      subtitle: 'Village',
      accent: '#e8a36b',
      near: 45,
      far: 80,
    });
  }

  private place(model: string, x: number, z: number, rot: number, scale: number, collide?: 'box' | number) {
    const obj = this.assets.instance(model);
    obj.scale.setScalar(scale);
    obj.rotation.y = rot;
    // Sit on the lowest terrain point under the footprint so nothing floats.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.45;
    let ground = Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) ground = Math.min(ground, this.terrain.heightAt(x + dx, z + dz));
    obj.position.set(x, ground - box.min.y - 0.05, z);
    this.group.add(obj);

    if (collide === 'box') {
      // Local (unrotated) footprint for an oriented box collider.
      const probe = this.assets.instance(model, false);
      probe.scale.setScalar(scale);
      const local = new THREE.Box3().setFromObject(probe);
      const c = local.getCenter(new THREE.Vector3());
      const ls = local.getSize(new THREE.Vector3());
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const wx = x + c.x * cos + c.z * sin;
      const wz = z - c.x * sin + c.z * cos;
      this.colliders.addBox(wx, wz, ls.x * 0.92, ls.z * 0.92, -rot);
    } else if (typeof collide === 'number') {
      this.colliders.addCircle(x, z, collide);
    }
    return obj;
  }
}
