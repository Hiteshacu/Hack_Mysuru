import * as THREE from 'three';
import { fbm, smoothstep } from '../utils/math';

/**
 * Distant mountain ranges beyond the playable valley: a wide ring mesh whose ridges rise with distance,
 * painted with forest, meadow and rock tones. Scene fog adds aerial perspective so the layers read as far away.
 */
export class Horizon {
  readonly mesh: THREE.Mesh;

  constructor(innerHeight = (x: number, z: number) => 24 + 0 * (x + z)) {
    const radial = 360;
    const rings = 64;
    const inner = 126;
    const outer = 900;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const forest = new THREE.Color('#3b5d2a');
    const meadow = new THREE.Color('#72924a');
    const rock = new THREE.Color('#8d8a7c');
    const snow = new THREE.Color('#eef2f4');
    const c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const r = inner + (outer - inner) * Math.pow(t, 1.8);
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // Ridges: height grows with distance, with sharper peaks far away.
        // Rolling forested foothills near the valley, taller softer ranges further out.
        const hills = 26 + fbm(x * 0.008 + 7, z * 0.008, 4) * 18;
        const ridge = 1 - Math.abs(fbm(x * 0.0032 + 7, z * 0.0032, 4));
        const big = Math.max(0, fbm(x * 0.0018, z * 0.0018 + 3, 3));
        const far = ridge * ridge * 55 + big * 110;
        let h = innerHeight(x, z) * (1 - smoothstep(0, 0.06, t)) + (hills + far * smoothstep(0.25, 0.7, t)) * smoothstep(0.0, 0.12, t);
        h *= 1 - smoothstep(0.88, 1, t) * 0.5;
        pos.push(x, h - 2, z);
        const n = fbm(x * 0.02, z * 0.02, 3);
        c.copy(forest).lerp(meadow, Math.max(0, n) * 0.7);
        // Canopy stipple so the slopes read as forest rather than flat colour.
        c.multiplyScalar(0.82 + fbm(x * 0.09, z * 0.09, 2) * 0.28);
        c.lerp(rock, smoothstep(95, 150, h) * 0.75);
        c.lerp(snow, smoothstep(150, 185, h + n * 15));
        col.push(c.r, c.g, c.b);
      }
    }
    const row = radial + 1;
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < radial; i++) {
        const a = j * row + i, b = a + 1, d = a + row, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = false;
    this.mesh.name = 'horizon';
  }
}
