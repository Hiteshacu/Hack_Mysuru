import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { Colliders } from './Colliders';
import type { Assets } from '../core/Assets';
import { ModelScatter } from './ModelScatter';
import { lakes, PLAY_RADIUS, SPAWN, VILLAGE, zones } from './layout';
import { fbm, mulberry32, noise2D } from '../utils/math';
import { preserveAlphaCoverage } from './foliageTexture';

const rnd = mulberry32(4242);

const NORMAL_TREES = ['Tree_1', 'Tree_2', 'Tree_3', 'Tree_4', 'Tree_5'];
const BIRCH = ['BirchTree_1', 'BirchTree_2', 'BirchTree_3', 'BirchTree_4', 'BirchTree_5'];
const MAPLE = ['MapleTree_1', 'MapleTree_2', 'MapleTree_3', 'MapleTree_5'];

/** Model-based nature: textured trees (normal, birch, maple), bushes, flowers, ferns, mushrooms and grass tufts. */
export class Vegetation {
  readonly group = new THREE.Group();
  readonly scatter = new ModelScatter();
  readonly uniforms = {
    uTime: { value: 0 },
    /** Player head in view space — foliage between the camera and the player dithers away. */
    uFocusView: { value: new THREE.Vector3(0, 0, -8) },
    uOcclude: { value: 1 },
  };
  private tmpFocus = new THREE.Vector3();
  private spots: { x: number; z: number; r: number }[] = [];
  /** Footprints where grass must not grow (bushes, rocks, trunks) — applied by Experience. */
  readonly grassBlockers: { x: number; z: number; r: number }[] = [];

  constructor(private terrain: Terrain, private colliders: Colliders, assets: Assets, lowQuality = false, private maxAnisotropy = 1) {
    const s = this.scatter;
    s.onMaterial = (m, variant) => this.tuneMaterial(m, variant);
    for (const name of [...NORMAL_TREES, ...BIRCH, ...MAPLE, 'Bush', 'BushFlowers']) s.define(name, assets.template(name));
    // Colourful variants: same textured trees, leaves re-tinted per instance (orange, gold, pink, lavender, crimson, lime).
    for (const name of [...NORMAL_TREES, ...BIRCH]) s.define(`Color_${name}`, assets.template(name), { variant: 'color' });
    s.define('Flower_1', assets.template('Flower_1'), { maxDistance: 60, castShadow: false });
    s.define('Flower_2', assets.template('Flower_2'), { maxDistance: 60, castShadow: false });
    s.define('FlowerGroup_1', assets.template('FlowerGroup_1'), { maxDistance: 55, castShadow: false });
    s.define('FlowerGroup_2', assets.template('FlowerGroup_2'), { maxDistance: 40, castShadow: false });
    s.define('Fern', assets.template('Fern'), { maxDistance: 60, castShadow: false });
    s.define('Mushroom', assets.template('Mushroom'), { maxDistance: 40, castShadow: false });
    s.define('GrassWispy', assets.template('GrassWispy'), { maxDistance: 45, castShadow: false });

    this.placeTrees(lowQuality ? 0.6 : 1);
    this.placeColorTrees(lowQuality ? 45 : 80);
    this.placeUndergrowth(lowQuality ? 0.5 : 1);
    s.build();
    this.group.add(s.group);
    this.buildRocks();
  }

  /** Vivid fluffy trees (orange, gold, blossom pink, lavender, crimson, lime) dotted through the meadows. */
  private placeColorTrees(count: number) {
    const palette = ['#ff8a2a', '#ffc934', '#ff8fbf', '#b58cff', '#ff4a3d', '#a8e04a', '#ff6fa8', '#ffb347'].map((c) => new THREE.Color(c));
    let placed = 0;
    for (let i = 0; i < 9000 && placed < count; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (PLAY_RADIUS - 6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.terrain.isGrowable(x, z, 1) || this.nearPath(x, z, 3.2) || !this.clearOfLandmarks(x, z, 4)) continue;
      // Favour meadow edges and path sides so the colour is visible from the trails.
      const nearTrail = this.nearPath(x, z, 9);
      if (!nearTrail && rnd() > 0.2) continue;
      if (Math.hypot(x, z) > 70) continue; // colour groves in the valley; hills stay forest-green
      if (!this.free(x, z, 3.6)) continue;
      const y = this.terrain.heightAt(x, z);
      const birch = rnd() < 0.4;
      const name = birch ? BIRCH[Math.floor(rnd() * BIRCH.length)] : NORMAL_TREES[Math.floor(rnd() * NORMAL_TREES.length)];
      const scale = birch ? 1.25 + rnd() * 0.45 : 0.8 + rnd() * 0.4;
      // Neighbouring trees share a hue family so colour reads as groves rather than confetti.
      const hueIndex = Math.floor((noise2D(x * 0.02 + 70, z * 0.02) * 0.5 + 0.5) * palette.length) % palette.length;
      const color = palette[rnd() < 0.75 ? hueIndex : Math.floor(rnd() * palette.length)].clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06);
      this.scatter.add(`Color_${name}`, x, y - 0.1, z, rnd() * Math.PI * 2, scale, color);
      this.grassBlockers.push({ x, z, r: 0.5 * scale });
      this.spots.push({ x, z, r: 1.6 * scale });
      this.colliders.addCircle(x, z, 0.42 * scale);
      placed++;
    }
  }

  // ------------------------------------------------------------ helpers

  private clearOfLandmarks(x: number, z: number, extra: number) {
    for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.flat + extra) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9 + extra) return false;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + extra) return false;
    return true;
  }

  private nearPath(x: number, z: number, r: number) {
    const t = this.terrain;
    return (
      t.mask(x, z, 0) > 0.02 || t.mask(x + r, z, 0) > 0.02 || t.mask(x - r, z, 0) > 0.02 || t.mask(x, z + r, 0) > 0.02 || t.mask(x, z - r, 0) > 0.02
    );
  }

  private free(x: number, z: number, r: number) {
    for (const p of this.spots) if (Math.hypot(p.x - x, p.z - z) < p.r + r) return false;
    return !this.colliders.blocked(x, z, r * 0.6);
  }

  private tuneMaterial(src: THREE.Material, variant?: string) {
    const m = src.clone() as THREE.MeshStandardMaterial;
    const name = src.name;
    const foliage = /Leaves|Flowers|Grass|Mushrooms/.test(name);
    m.roughness = 1;
    m.metalness = 0;
    m.envMapIntensity = 0.4;
    // Batched geometry carries only position/normal/uv; a vertexColors material would read black.
    m.vertexColors = false;
    if (foliage) {
      m.side = THREE.DoubleSide;
      m.shadowSide = THREE.DoubleSide;
      if (m.transparent || m.alphaTest > 0 || m.map) {
        m.transparent = false;
        m.alphaTest = Math.max(m.alphaTest, 0.42);
        // Without this, leaf canopies fade out with distance and only the trunks remain.
        if (m.map) preserveAlphaCoverage(m.map, m.alphaTest, this.maxAnisotropy);
      }
      const isTree = /Tree/.test(name);
      const start = isTree ? '2.0' : '0.0';
      const amount = isTree ? '0.018' : /Grass/.test(name) ? '0.12' : '0.07';
      const tinted = variant === 'color';
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.uniforms.uTime;
        shader.uniforms.uFocusView = this.uniforms.uFocusView;
        shader.uniforms.uOcclude = this.uniforms.uOcclude;
        if (tinted) {
          // Grey-scale the leaf texture, then apply the per-instance colour for vivid seasonal canopies.
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#if defined( USE_BATCHING_COLOR ) || defined( USE_COLOR_ALPHA )
              float leafLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              diffuseColor.rgb = mix(vec3(leafLuma) * 2.1, diffuseColor.rgb, 0.08) * vColor.rgb;
            #else
              #include <color_fragment>
            #endif`,
          );
        }
        // Leaves stay solid from every angle (above, below, inside a canopy). Only the foliage that sits
        // between the camera and the character is screen-door dithered, so the player is never hidden,
        // plus a tiny radius right at the lens to avoid near-plane slicing.
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uFocusView;\nuniform float uOcclude;')
          .replace(
            '#include <alphatest_fragment>',
            `#include <alphatest_fragment>
            vec3 fragV = -vViewPosition;
            float keep = smoothstep(0.25, 0.7, length(fragV));
            if (uOcclude > 0.5) {
              float segT = dot(fragV, uFocusView) / max(dot(uFocusView, uFocusView), 1e-4);
              float segD = length(fragV - uFocusView * clamp(segT, 0.0, 1.0));
              float radius = mix(0.5, 1.35, clamp(segT, 0.0, 1.0));
              float clear = smoothstep(radius * 0.45, radius, segD);
              // Only in front of the character (segT < 1); canopies behind it are untouched.
              clear = max(clear, smoothstep(0.92, 1.0, segT));
              keep = min(keep, max(clear, 0.1));
            }
            if (keep < 0.999) {
              vec2 cell = floor(gl_FragCoord.xy);
              float dither = fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
              if (dither > keep) discard;
            }`,
          );
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_BATCHING
              vec3 swayOrigin = batchingMatrix[3].xyz;
            #else
              vec3 swayOrigin = vec3(0.0);
            #endif
            float swayH = max(position.y - ${start}, 0.0);
            float swayPh = uTime * 1.3 + swayOrigin.x * 0.13 + swayOrigin.z * 0.11;
            float gustW = sin(uTime * 0.37 + swayOrigin.x * 0.02) * 0.5 + 0.8;
            transformed.x += sin(swayPh) * ${amount} * swayH * gustW;
            transformed.z += cos(swayPh * 0.83) * ${amount} * 0.6 * swayH * gustW;`,
          );
      };
      m.customProgramCacheKey = () => `sway2-${start}-${amount}-${tinted ? 'tint' : 'plain'}`;
    }
    return m;
  }

  // ------------------------------------------------------------ placement

  private placeTrees(amount: number) {
    const s = this.scatter;
    let interior = 0;
    for (let i = 0; i < 12000 && interior < 230 * amount; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (PLAY_RADIUS - 4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const forest = fbm(x * 0.017 + 3, z * 0.017, 3);
      if (rnd() > Math.max(0.05, (forest + 0.1) * 1.5)) continue;
      if (!this.terrain.isGrowable(x, z, 1) || this.nearPath(x, z, 3.5) || !this.clearOfLandmarks(x, z, 5)) continue;
      if (!this.free(x, z, 4.2)) continue;
      const y = this.terrain.heightAt(x, z);
      const meadow = noise2D(x * 0.03, z * 0.03);
      let name: string, scale: number;
      if (meadow > 0.45) {
        name = MAPLE[Math.floor(rnd() * MAPLE.length)];
        scale = 1.05 + rnd() * 0.45;
      } else if (meadow < -0.35) {
        name = BIRCH[Math.floor(rnd() * BIRCH.length)];
        scale = 1.2 + rnd() * 0.5;
      } else {
        name = NORMAL_TREES[Math.floor(rnd() * NORMAL_TREES.length)];
        scale = 0.8 + rnd() * 0.45;
      }
      s.add(name, x, y - 0.1, z, rnd() * Math.PI * 2, scale);
      this.spots.push({ x, z, r: 1.5 * scale });
      this.colliders.addCircle(x, z, 0.42 * scale);
      this.grassBlockers.push({ x, z, r: 0.5 * scale });
      interior++;
    }

    // Forest covering the surrounding hills, all the way up to the ridge line (denser higher up).
    let rim = 0;
    for (let i = 0; i < 30000 && rim < 560 * amount; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 66 + Math.sqrt(rnd()) * 118;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) > 127 || Math.abs(z) > 127) continue;
      if (rnd() > 0.35 + Math.min(0.65, (d - 66) / 60)) continue;
      const y = this.terrain.heightAt(x, z);
      if (y < 1 || this.terrain.normalAt(x, z).y < 0.72) continue;
      if (this.nearPath(x, z, 3) || !this.clearOfLandmarks(x, z, 4)) continue;
      if (lakes.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 4)) continue;
      if (!this.free(x, z, 3.0)) continue;
      const pick = rnd();
      const name = pick < 0.55 ? NORMAL_TREES[Math.floor(rnd() * 5)] : pick < 0.8 ? BIRCH[Math.floor(rnd() * 5)] : MAPLE[Math.floor(rnd() * MAPLE.length)];
      const scale = name.startsWith('Tree') ? 0.9 + rnd() * 0.6 : 1.2 + rnd() * 0.6;
      s.add(name, x, y - 0.2, z, rnd() * Math.PI * 2, scale);
      this.spots.push({ x, z, r: 1.4 * scale });
      if (d < PLAY_RADIUS + 4) this.colliders.addCircle(x, z, 0.45 * scale);
      this.grassBlockers.push({ x, z, r: 0.55 * scale });
      rim++;
    }
  }

  private placeUndergrowth(amount: number) {
    const s = this.scatter;
    const scatterNear = (count: number, fn: (x: number, z: number, i: number) => boolean) => {
      let placed = 0;
      for (let i = 0; i < count * 12 && placed < count; i++) {
        const x = (rnd() - 0.5) * PLAY_RADIUS * 2, z = (rnd() - 0.5) * PLAY_RADIUS * 2;
        if (Math.hypot(x, z) > PLAY_RADIUS + 6) continue;
        if (fn(x, z, placed)) placed++;
      }
    };

    // Bushes (collidable)
    scatterNear(170 * amount, (x, z) => {
      if (!this.terrain.isGrowable(x, z, 1) || this.nearPath(x, z, 2) || !this.clearOfLandmarks(x, z, 1.5) || !this.free(x, z, 1.4)) return false;
      const flowers = noise2D(x * 0.05 + 20, z * 0.05) > 0.55;
      const scale = flowers ? 1.3 + rnd() * 0.6 : 1.0 + rnd() * 0.6;
      s.add(flowers ? 'BushFlowers' : 'Bush', x, this.terrain.heightAt(x, z) + 0.02, z, rnd() * 6.28, scale);
      this.spots.push({ x, z, r: 0.9 * scale });
      this.colliders.addCircle(x, z, 0.45 * scale);
      this.grassBlockers.push({ x, z, r: (flowers ? 0.45 : 0.85) * scale });
      return true;
    });

    // Flower meadows: dense patches of petal flowers driven by noise, two species per patch.
    scatterNear(2200 * amount, (x, z) => {
      const meadow = noise2D(x * 0.045 + 50, z * 0.045);
      if (meadow < 0.2 || !this.terrain.isGrowable(x, z)) return false;
      const species = noise2D(x * 0.12, z * 0.12);
      const y = this.terrain.heightAt(x, z) - 0.03;
      if (species > 0) s.add('Flower_1', x, y, z, rnd() * 6.28, 0.3 + rnd() * 0.2);
      else s.add('Flower_2', x, y, z, rnd() * 6.28, 0.28 + rnd() * 0.18);
      return true;
    });

    // Ferns, mushroom clusters and toadstools in the forest shade
    scatterNear(420 * amount, (x, z, i) => {
      if (fbm(x * 0.017 + 3, z * 0.017, 3) < 0.05) return false;
      if (!this.terrain.isGrowable(x, z) || this.nearPath(x, z, 1)) return false;
      const y = this.terrain.heightAt(x, z) - 0.05;
      if (i % 9 === 0) s.add('Mushroom', x, y, z, rnd() * 6.28, 0.12 + rnd() * 0.08);
      else if (i % 9 === 1) s.add('FlowerGroup_1', x, y, z, rnd() * 6.28, 0.45 + rnd() * 0.25);
      else if (i % 9 === 2) s.add('FlowerGroup_2', x, y, z, rnd() * 6.28, 0.35 + rnd() * 0.2);
      else s.add('Fern', x, y, z, rnd() * 6.28, 0.14 + rnd() * 0.1);
      return true;
    });

    // Wispy grass tufts soften path edges and plazas
    scatterNear(700 * amount, (x, z) => {
      const edge = this.terrain.mask(x, z, 0);
      if (edge < 0.05 || edge > 0.45) return false;
      if (this.terrain.heightAt(x, z) < 0.5) return false;
      s.add('GrassWispy', x, this.terrain.heightAt(x, z) - 0.05, z, rnd() * 6.28, 0.45 + rnd() * 0.45);
      return true;
    });
  }

  private buildRocks() {
    const variants = 3;
    const perVariant: { x: number; y: number; z: number; s: number; r: number }[][] = [[], [], []];
    for (let i = 0; i < 5000 && perVariant.flat().length < 170; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (PLAY_RADIUS + 10);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = this.terrain.heightAt(x, z);
      if (y < -0.6 || this.nearPath(x, z, 1.4) || !this.clearOfLandmarks(x, z, 1)) continue;
      const nearLake = lakes.some((l) => Math.abs(Math.hypot(l.x - x, l.z - z) - l.r) < 5);
      if (!nearLake && rnd() > 0.3) continue;
      if (this.colliders.blocked(x, z, 1.2)) continue;
      const sc = nearLake ? 0.5 + rnd() * 1.6 : 0.35 + rnd() * 1.1;
      perVariant[Math.floor(rnd() * variants)].push({ x, y, z, s: sc, r: rnd() * Math.PI * 2 });
      this.grassBlockers.push({ x, z, r: sc * 1.05 });
      if (sc > 0.6 && d < PLAY_RADIUS + 2) this.colliders.addCircle(x, z, sc * 0.85);
    }
    const mat = new THREE.MeshLambertMaterial({ color: '#9c968a', flatShading: true });
    for (let v = 0; v < variants; v++) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const p = geo.attributes.position as THREE.BufferAttribute;
      const seed = v * 13.7;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + noise2D(x * 1.3 + seed, z * 1.3 + y) * 0.28;
        p.setXYZ(i, x * k * 1.15, Math.max(-0.35, y * k * 0.72), z * k);
      }
      geo.computeVertexNormals();
      const list = perVariant[v];
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      list.forEach((r, i) => {
        m.compose(new THREE.Vector3(r.x, r.y + r.s * 0.12, r.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.r, (rnd() - 0.5) * 0.3)), new THREE.Vector3(r.s, r.s, r.s));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.setHSL(0.1, 0.08 + rnd() * 0.08, 0.5 + rnd() * 0.22));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  update(time: number, player: THREE.Vector3, camera?: THREE.Camera, focus?: THREE.Vector3) {
    this.uniforms.uTime.value = time;
    if (camera && focus) {
      camera.updateMatrixWorld();
      this.uniforms.uFocusView.value.copy(this.tmpFocus.copy(focus)).applyMatrix4(camera.matrixWorldInverse);
      this.uniforms.uOcclude.value = 1;
    } else this.uniforms.uOcclude.value = 0;
    this.scatter.update(player);
  }
}
