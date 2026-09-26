import * as THREE from 'three';
import { catmullRom, clamp, fbm, lerp, noise2D, smoothstep } from '../utils/math';
import {
  enemySpawns,
  extraFlats,
  lakes,
  pathRoutes,
  SPAWN,
  VILLAGE,
  villageBuildings,
  WATER_LEVEL,
  WORLD_SIZE,
  zones,
} from './layout';
import { noiseGLSL } from '../shaders/noise.glsl';

const SEGMENTS = 256;
const MASK_RES = 512;

/** Zones that get a stone plaza instead of grass. */
const PLAZAS: Record<string, number> = { welcome: 6.5, skills: 8.5, projects: 11, achievements: 6.5 };
/** Zones that get a bare-earth clearing. */
const CLEARINGS: Record<string, number> = { contact: 6.5, about: 5.5, certifications: 4 };

export class Terrain {
  readonly size = WORLD_SIZE;
  readonly half = WORLD_SIZE / 2;
  readonly step = WORLD_SIZE / SEGMENTS;
  readonly heights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
  /** RGBA mask: R = path/clearing, G = water depth, B = plaza. */
  readonly maskData = new Uint8Array(MASK_RES * MASK_RES * 4);
  readonly maskTexture: THREE.DataTexture;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  readonly uniforms = {
    uMask: { value: null as THREE.Texture | null },
    uWorldSize: { value: WORLD_SIZE },
    uGrassDark: { value: new THREE.Color('#284418') },
    uGrassLight: { value: new THREE.Color('#4c7426') },
    uGrassDry: { value: new THREE.Color('#9a9a4a') },
    uPath: { value: new THREE.Color('#b59468') },
    uPathDark: { value: new THREE.Color('#8a6d4a') },
    uRock: { value: new THREE.Color('#7b7568') },
    uSand: { value: new THREE.Color('#d9c393') },
    uWetSand: { value: new THREE.Color('#8f7b58') },
    uStone: { value: new THREE.Color('#a29a88') },
  };

  constructor() {
    this.buildMask();
    this.buildHeights();
    this.bakeWaterDepth();

    this.maskTexture = new THREE.DataTexture(this.maskData, MASK_RES, MASK_RES, THREE.RGBAFormat);
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.wrapS = this.maskTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTexture.needsUpdate = true;
    this.uniforms.uMask.value = this.maskTexture;

    this.mesh = this.buildMesh();

    // Heights as a half-float texture so GPU grass can sit on the terrain without CPU work.
    const V = SEGMENTS + 1;
    const half = new Uint16Array(V * V);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(this.heights[i]);
    this.heightTexture = new THREE.DataTexture(half, V, V, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTexture.magFilter = this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.needsUpdate = true;
  }

  readonly heightTexture: THREE.DataTexture;

  // ---------------------------------------------------------------- masks

  private stamp(channel: number, cx: number, cz: number, radius: number, soft: number) {
    const texel = WORLD_SIZE / MASK_RES;
    const r = radius + soft;
    const x0 = Math.floor((cx - r + this.half) / texel), x1 = Math.ceil((cx + r + this.half) / texel);
    const z0 = Math.floor((cz - r + this.half) / texel), z1 = Math.ceil((cz + r + this.half) / texel);
    for (let gz = Math.max(0, z0); gz <= Math.min(MASK_RES - 1, z1); gz++) {
      for (let gx = Math.max(0, x0); gx <= Math.min(MASK_RES - 1, x1); gx++) {
        const wx = gx * texel - this.half + texel * 0.5;
        const wz = gz * texel - this.half + texel * 0.5;
        const d = Math.hypot(wx - cx, wz - cz);
        const v = 1 - smoothstep(radius, radius + soft, d);
        if (v <= 0) continue;
        const i = (gz * MASK_RES + gx) * 4 + channel;
        this.maskData[i] = Math.max(this.maskData[i], Math.round(v * 255));
      }
    }
  }

  private buildMask() {
    for (const route of pathRoutes) {
      const pts = catmullRom(route, 16);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(len / 0.5));
        for (let s = 0; s < n; s++) {
          const x = lerp(ax, bx, s / n);
          const z = lerp(az, bz, s / n);
          const w = 1.25 + noise2D(x * 0.05, z * 0.05) * 0.35;
          this.stamp(0, x, z, w, 1.1);
        }
      }
    }
    this.stamp(0, SPAWN.x, SPAWN.z, 3.2, 2);
    this.stamp(0, VILLAGE.x, VILLAGE.z, 11, 5);
    for (const b of villageBuildings) this.stamp(0, b.x, b.z, 4.5 * (b.scale / 2.8), 2.5);
    for (const e of enemySpawns) this.stamp(0, e.x, e.z, 3.2, 2.5);
    for (const z of zones) {
      if (PLAZAS[z.id]) this.stamp(2, z.x, z.z, PLAZAS[z.id], 0.8);
      if (CLEARINGS[z.id]) this.stamp(0, z.x, z.z, CLEARINGS[z.id], 2.5);
    }
  }

  /** Sample the mask channel (0..1) at a world position. */
  mask(x: number, z: number, channel: number) {
    const texel = WORLD_SIZE / MASK_RES;
    const gx = clamp(Math.round((x + this.half) / texel - 0.5), 0, MASK_RES - 1);
    const gz = clamp(Math.round((z + this.half) / texel - 0.5), 0, MASK_RES - 1);
    return this.maskData[(gz * MASK_RES + gx) * 4 + channel] / 255;
  }

  // ---------------------------------------------------------------- heights

  private baseHeight(x: number, z: number) {
    let h = 2.6 + fbm(x * 0.011, z * 0.011, 4) * 5.2;
    h += Math.abs(fbm(x * 0.035 + 40, z * 0.035, 3)) * 1.1;
    // Soft floor keeps the meadow above water everywhere except the real lakes.
    const floor = 1.5;
    h = floor + Math.log1p(Math.exp((h - floor) * 2.2)) / 2.2;
    // Gentle forested hills around the valley: a long, smooth ramp (≈20–25° max) instead of cliff walls.
    const r = Math.hypot(x, z) + fbm(x * 0.02, z * 0.02, 2) * 9;
    const edge = smoothstep(60, 138, r);
    h += Math.pow(edge, 1.5) * (20 + fbm(x * 0.014 + 12, z * 0.014, 3) * 9);
    h += edge * Math.abs(fbm(x * 0.05 + 3, z * 0.05, 2)) * 2.2;
    return h;
  }

  private buildHeights() {
    const zoneTargets = zones.map((zn) => Math.max(1.6, this.baseHeight(zn.x, zn.z) * 0.6 + 1));
    const flatTargets = extraFlats.map((f) => Math.max(1.6, Math.min(8, this.baseHeight(f.x, f.z) * 0.6 + 1)));
    const V = SEGMENTS + 1;
    for (let row = 0; row < V; row++) {
      for (let col = 0; col < V; col++) {
        const x = col * this.step - this.half;
        const z = row * this.step - this.half;
        let h = this.baseHeight(x, z);

        for (const lake of lakes) {
          const ang = Math.atan2(z - lake.z, x - lake.x);
          const wobble = 1 + noise2D(Math.cos(ang) * 1.3 + lake.x, Math.sin(ang) * 1.3) * 0.16;
          const d = Math.hypot(x - lake.x, z - lake.z) / (lake.r * wobble);
          if (d < 1.6) {
            const t = smoothstep(1.35, 0.7, d);
            const floor = WATER_LEVEL - 0.35 - lake.depth * (1 - smoothstep(0, 1, d));
            h = lerp(h, Math.min(h, floor), t);
          }
        }

        for (let i = 0; i < zones.length; i++) {
          const zn = zones[i];
          const d = Math.hypot(x - zn.x, z - zn.z);
          const t = 1 - smoothstep(zn.flat, zn.flat + 12, d);
          if (t > 0) h = lerp(h, zoneTargets[i], t);
        }
        for (let i = 0; i < extraFlats.length; i++) {
          const f = extraFlats[i];
          const d = Math.hypot(x - f.x, z - f.z);
          const t = 1 - smoothstep(f.r, f.r + 10, d);
          if (t > 0) h = lerp(h, flatTargets[i], t);
        }
        const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
        h = lerp(h, Math.max(1.8, this.baseHeight(SPAWN.x, SPAWN.z) * 0.7), 1 - smoothstep(6, 16, ds));

        const path = this.mask(x, z, 0);
        h -= path * 0.1;

        this.heights[row * V + col] = h;
      }
    }
    // One smoothing pass keeps the stylised look soft.
    const copy = this.heights.slice();
    for (let row = 1; row < V - 1; row++) {
      for (let col = 1; col < V - 1; col++) {
        const i = row * V + col;
        this.heights[i] = copy[i] * 0.5 + (copy[i - 1] + copy[i + 1] + copy[i - V] + copy[i + V]) * 0.125;
      }
    }
  }

  private bakeWaterDepth() {
    const texel = WORLD_SIZE / MASK_RES;
    for (let gz = 0; gz < MASK_RES; gz++) {
      for (let gx = 0; gx < MASK_RES; gx++) {
        const h = this.heightAt(gx * texel - this.half + texel * 0.5, gz * texel - this.half + texel * 0.5);
        const depth = WATER_LEVEL - h; // positive under water
        this.maskData[(gz * MASK_RES + gx) * 4 + 1] = Math.round(clamp((depth + 1) / 8, 0, 1) * 255);
        this.maskData[(gz * MASK_RES + gx) * 4 + 3] = 255;
      }
    }
  }

  heightAt(x: number, z: number) {
    const V = SEGMENTS + 1;
    const fx = clamp((x + this.half) / this.step, 0, SEGMENTS - 0.0001);
    const fz = clamp((z + this.half) / this.step, 0, SEGMENTS - 0.0001);
    const c = Math.floor(fx), r = Math.floor(fz);
    const tx = fx - c, tz = fz - r;
    const h00 = this.heights[r * V + c], h10 = this.heights[r * V + c + 1];
    const h01 = this.heights[(r + 1) * V + c], h11 = this.heights[(r + 1) * V + c + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x: number, z: number, target = new THREE.Vector3()) {
    const e = 0.6;
    return target
      .set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e))
      .normalize();
  }

  /** True where decoration (grass, trees, flowers) may grow. */
  isGrowable(x: number, z: number, margin = 0) {
    if (Math.abs(x) > this.half - 2 || Math.abs(z) > this.half - 2) return false;
    const h = this.heightAt(x, z);
    if (h < WATER_LEVEL + 0.45 + margin * 0.2) return false;
    if (this.mask(x, z, 0) > 0.28 - margin * 0.1) return false;
    if (this.mask(x, z, 2) > 0.05) return false;
    return this.normalAt(x, z).y > 0.74;
  }

  /** Grass may grow here (growable and not under a bush, rock, tree trunk or building). */
  grassAllowed(x: number, z: number) {
    return this.mask(x, z, 3) > 0.5 && this.isGrowable(x, z);
  }

  /** Remove grass inside a circle (alpha channel of the mask texture). */
  blockGrass(cx: number, cz: number, radius: number) {
    const texel = WORLD_SIZE / MASK_RES;
    const x0 = Math.max(0, Math.floor((cx - radius + this.half) / texel)), x1 = Math.min(MASK_RES - 1, Math.ceil((cx + radius + this.half) / texel));
    const z0 = Math.max(0, Math.floor((cz - radius + this.half) / texel)), z1 = Math.min(MASK_RES - 1, Math.ceil((cz + radius + this.half) / texel));
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const wx = gx * texel - this.half + texel * 0.5, wz = gz * texel - this.half + texel * 0.5;
        if (Math.hypot(wx - cx, wz - cz) < radius) this.maskData[(gz * MASK_RES + gx) * 4 + 3] = 0;
      }
  }

  /** Remove grass inside an oriented rectangle (buildings, platforms). `rot` uses the Colliders convention. */
  blockGrassBox(cx: number, cz: number, hw: number, hd: number, rot: number) {
    const texel = WORLD_SIZE / MASK_RES;
    const R = Math.hypot(hw, hd) + texel;
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    const x0 = Math.max(0, Math.floor((cx - R + this.half) / texel)), x1 = Math.min(MASK_RES - 1, Math.ceil((cx + R + this.half) / texel));
    const z0 = Math.max(0, Math.floor((cz - R + this.half) / texel)), z1 = Math.min(MASK_RES - 1, Math.ceil((cz + R + this.half) / texel));
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const wx = gx * texel - this.half + texel * 0.5 - cx, wz = gz * texel - this.half + texel * 0.5 - cz;
        const lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.maskData[(gz * MASK_RES + gx) * 4 + 3] = 0;
      }
  }

  /** Bakes slope/water/path limits into the grass mask and re-uploads it. Call after all props are placed. */
  finalizeGrassMask() {
    const texel = WORLD_SIZE / MASK_RES;
    for (let gz = 0; gz < MASK_RES; gz++)
      for (let gx = 0; gx < MASK_RES; gx++) {
        const i = (gz * MASK_RES + gx) * 4 + 3;
        if (this.maskData[i] === 0) continue;
        if (!this.isGrowable(gx * texel - this.half + texel * 0.5, gz * texel - this.half + texel * 0.5)) this.maskData[i] = 0;
      }
    this.maskTexture.needsUpdate = true;
  }

  // ---------------------------------------------------------------- mesh

  private buildMesh() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos;
          varying vec3 vWNormal;
          uniform sampler2D uMask;
          uniform float uWorldSize;
          uniform vec3 uGrassDark, uGrassLight, uGrassDry, uPath, uPathDark, uRock, uSand, uWetSand, uStone;
          ${noiseGLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `
          vec2 muv = vWPos.xz / uWorldSize + 0.5;
          vec4 m = texture2D(uMask, muv);
          float n1 = fbm2(vWPos.xz * 0.06);
          float n2 = vnoise(vWPos.xz * 0.9);
          vec3 col = mix(uGrassDark, uGrassLight, clamp(n1 * 1.2 - 0.1 + n2 * 0.15, 0.0, 1.0));
          col = mix(col, uGrassDry, smoothstep(0.55, 0.78, fbm2(vWPos.xz * 0.018 + 7.0)) * 0.55);
          float slope = 1.0 - vWNormal.y;
          // Hills stay grassy (slightly deeper green higher up); bare rock only on genuinely steep faces.
          col = mix(col, col * vec3(0.82, 0.9, 0.84), smoothstep(8.0, 22.0, vWPos.y) * 0.6);
          col = mix(col, uRock, smoothstep(0.42, 0.6, slope + n2 * 0.08));
          // Grass-like micro striations and clover patches so the ground never reads as flat colour.
          float strands = vnoise(vec2(vWPos.x * 6.0 + vWPos.z * 1.7, vWPos.z * 1.3 - vWPos.x * 0.4));
          float patches = smoothstep(0.35, 0.8, fbm2(vWPos.xz * 0.35));
          col *= (0.86 + strands * 0.22) * (0.92 + patches * 0.12);

          float path = smoothstep(0.38, 0.62, m.r + (n2 - 0.5) * 0.3);
          col = mix(col, mix(uPathDark, uPath, n2 * 0.6 + n1 * 0.4), path);

          vec2 cell = voronoiEdge(vWPos.xz * 0.62);
          float grout = smoothstep(0.02, 0.07, cell.x);
          vec3 stone = uStone * (0.8 + cell.y * 0.26) * (0.94 + n2 * 0.12) * mix(0.55, 1.0, grout);
          float plaza = smoothstep(0.45, 0.6, m.b + (n2 - 0.5) * 0.08);
          col = mix(col, stone, plaza);

          float h = vWPos.y + (n2 - 0.5) * 0.25;
          col = mix(col, uSand, 1.0 - smoothstep(0.45, 1.15, h));
          col = mix(col, uWetSand, 1.0 - smoothstep(-0.25, 0.4, h));
          diffuseColor.rgb *= col;
          terrainBumpH = (fbm2(vWPos.xz * 0.9) * 0.09 + strands * 0.012 * (1.0 - path)) * (1.0 - plaza * 0.7) + plaza * (1.0 - grout) * -0.04;
          `,
        )
        .replace(
          'void main() {',
          'float terrainBumpH = 0.0;\nvoid main() {',
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          // Derivative bump mapping from the procedural height → real 3D relief on the ground.
          {
            vec3 dpdx = dFdx(-vViewPosition);
            vec3 dpdy = dFdy(-vViewPosition);
            float dBx = dFdx(terrainBumpH) * 2.2;
            float dBy = dFdy(terrainBumpH) * 2.2;
            vec3 R1 = cross(dpdy, normal);
            vec3 R2 = cross(normal, dpdx);
            float det = dot(dpdx, R1);
            vec3 grad = sign(det) * (dBx * R1 + dBy * R2);
            normal = normalize(abs(det) * normal - grad);
          }`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}
