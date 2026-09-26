import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { Colliders } from './Colliders';
import { PLAY_RADIUS, WORLD_SIZE } from './layout';
import { fbm, mulberry32 } from '../utils/math';
import { noiseGLSL } from '../shaders/noise.glsl';

/*
 * Realistic stylised grass in two layers:
 *  1. Chunked field over the whole valley (generated lazily around the player for fast loading).
 *  2. A very dense GPU "near field" that follows the player: blade positions wrap inside a tile in the
 *     vertex shader and sample terrain height + path masks from textures, so it costs no CPU per frame.
 * Techniques gathered from open-source work: Ebenezer's FluffyGrass (MIT), spacejack/terra, al-ro's grass,
 * James Smyth's BotW-style grass, the Codrops fluffy-grass article — bezier-bent blades, clumping,
 * rounded normals, back-light translucency, layered wind and density LOD.
 */

const CHUNK = 16;

/** Blade strip: `segments` quads tapering to a tip vertex. */
function bladeGeometry(segments: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, last + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Real normals are computed in the vertex shader, but three.js switches to flat shading
  // when a geometry has no normal attribute — so provide a placeholder.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

interface Chunk {
  cx: number;
  cz: number;
  x0: number;
  z0: number;
  mesh: THREE.Mesh | null;
  total: number;
  built: boolean;
}

const release = function (this: { array: unknown }) {
  this.array = null;
};

export class Grass {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3() },
    uDrawDist: { value: 80 },
    uWind: { value: 1 },
    uWindDir: { value: new THREE.Vector2(1, 0.35).normalize() },
    uBase: { value: new THREE.Color('#1f3d0f') },
    uMid: { value: new THREE.Color('#3f6b1f') },
    uTip: { value: new THREE.Color('#9cc255') },
    uTipDry: { value: new THREE.Color('#c4b865') },
    uTipCool: { value: new THREE.Color('#5a9e52') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff0d4') },
    uSunStrength: { value: 1 },
    // near-field
    uTile: { value: 40 },
    uHeightTex: { value: null as THREE.Texture | null },
    uMaskTex: { value: null as THREE.Texture | null },
    uWorldSize: { value: WORLD_SIZE },
    uHeightRes: { value: 257 },
  };
  readonly material: THREE.MeshLambertMaterial;
  readonly fieldMaterial: THREE.MeshLambertMaterial;
  private chunks: Chunk[] = [];
  private density = 1;
  // Chunk blades are mostly seen from a distance (4 segments); the near field bends more (5 segments).
  private base = bladeGeometry(4);
  private fieldBase = bladeGeometry(5);
  private field: THREE.Mesh | null = null;
  private fieldTotal = 0;

  constructor(private terrain: Terrain, _colliders: Colliders, private bladesPerM2 = 12, fieldBlades = 80000) {
    this.material = this.createMaterial(false);
    this.fieldMaterial = this.createMaterial(true);
    this.uniforms.uHeightTex.value = terrain.heightTexture;
    this.uniforms.uMaskTex.value = terrain.maskTexture;

    const limit = PLAY_RADIUS + 14;
    for (let cz = -limit; cz < limit; cz += CHUNK) {
      for (let cx = -limit; cx < limit; cx += CHUNK) {
        const mx = cx + CHUNK / 2, mz = cz + CHUNK / 2;
        if (Math.hypot(mx, mz) > limit + CHUNK) continue;
        this.chunks.push({ cx: mx, cz: mz, x0: cx, z0: cz, mesh: null, total: 0, built: false });
      }
    }
    if (fieldBlades > 0) this.buildField(fieldBlades);
  }

  /** Build all chunks within `radius` of a point right away (used for the spawn area). */
  prebuild(x: number, z: number, radius: number) {
    for (const c of this.chunks) if (!c.built && Math.hypot(c.cx - x, c.cz - z) < radius) this.buildChunk(c);
  }

  private buildChunk(c: Chunk) {
    c.built = true;
    const rand = mulberry32(Math.floor(c.x0 * 73856093) ^ Math.floor(c.z0 * 19349663));
    const clumpSpacing = 1.15;
    const perClump = Math.max(2, Math.round(this.bladesPerM2 * clumpSpacing * clumpSpacing));
    const maxBlades = Math.ceil((CHUNK / clumpSpacing + 1) ** 2) * perClump;
    const offsets = new Float32Array(maxBlades * 4);
    const shape = new Float32Array(maxBlades * 4);
    const extra = new Float32Array(maxBlades * 2);
    const terrain = this.terrain;
    let n = 0;
    let hSum = 0;
    for (let gz = 0; gz < CHUNK; gz += clumpSpacing) {
      for (let gx = 0; gx < CHUNK; gx += clumpSpacing) {
        const kx = c.x0 + gx + rand() * clumpSpacing;
        const kz = c.z0 + gz + rand() * clumpSpacing;
        if (!terrain.grassAllowed(kx, kz)) continue;
        const meadow = fbm(kx * 0.035, kz * 0.035, 2);
        const tall = 0.4 + Math.max(0, meadow) * 0.45 + rand() * 0.16;
        const tint = Math.max(-1, Math.min(1, fbm(kx * 0.02 + 9, kz * 0.02, 2) * 1.6 + (rand() - 0.5) * 0.6));
        for (let b = 0; b < perClump; b++) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * clumpSpacing * 0.62;
          const x = kx + Math.cos(a) * r;
          const z = kz + Math.sin(a) * r;
          const path = terrain.mask(x, z, 0);
          if (path > 0.3 || terrain.mask(x, z, 3) < 0.5) continue;
          const y = terrain.heightAt(x, z);
          const lean = Math.atan2(x - kx, z - kz);
          offsets.set([x, y - 0.04, z, lean + (rand() - 0.5) * 0.9], n * 4);
          const height = tall * (0.6 + rand() * 0.55) * (1 - path * 2.2);
          shape.set([Math.max(0.05, height), 0.042 + rand() * 0.036, 0.15 + (r / clumpSpacing) * 0.9 + rand() * 0.2, rand()], n * 4);
          extra.set([tint, lean], n * 2);
          hSum += y;
          n++;
        }
      }
    }
    if (n === 0) return;
    // Shuffle so drawing the first N blades gives an even, lower density (LOD).
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      for (let k = 0; k < 4; k++) {
        [offsets[i * 4 + k], offsets[j * 4 + k]] = [offsets[j * 4 + k], offsets[i * 4 + k]];
        [shape[i * 4 + k], shape[j * 4 + k]] = [shape[j * 4 + k], shape[i * 4 + k]];
      }
      for (let k = 0; k < 2; k++) [extra[i * 2 + k], extra[j * 2 + k]] = [extra[j * 2 + k], extra[i * 2 + k]];
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = this.base.index;
    geo.attributes.position = this.base.attributes.position;
    geo.attributes.normal = this.base.attributes.normal;
    const aOffset = new THREE.InstancedBufferAttribute(offsets.slice(0, n * 4), 4);
    const aShape = new THREE.InstancedBufferAttribute(shape.slice(0, n * 4), 4);
    const aExtra = new THREE.InstancedBufferAttribute(extra.slice(0, n * 2), 2);
    for (const attr of [aOffset, aShape, aExtra]) attr.onUpload(release as () => void);
    geo.setAttribute('aOffset', aOffset);
    geo.setAttribute('aShape', aShape);
    geo.setAttribute('aExtra', aExtra);
    geo.instanceCount = n;
    const avgY = hSum / n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.cx, avgY, c.cz), CHUNK * 0.75 + 3);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(c.x0, avgY - 5, c.z0), new THREE.Vector3(c.x0 + CHUNK, avgY + 5, c.z0 + CHUNK));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    c.mesh = mesh;
    c.total = n;
  }

  /** Dense blades that wrap around the player inside a tile; positions resolved in the shader. */
  private buildField(count: number) {
    const rand = mulberry32(99173);
    const tile = this.uniforms.uTile.value;
    const offsets = new Float32Array(count * 4);
    const shape = new Float32Array(count * 4);
    const extra = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      offsets.set([rand() * tile, 0, rand() * tile, rand() * Math.PI * 2], i * 4);
      shape.set([0.34 + rand() * 0.4, 0.036 + rand() * 0.034, 0.2 + rand() * 0.9, rand()], i * 4);
      extra.set([(rand() - 0.5) * 0.8, 0], i * 2);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = this.fieldBase.index;
    geo.attributes.position = this.fieldBase.attributes.position;
    geo.attributes.normal = this.fieldBase.attributes.normal;
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
    geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 2));
    geo.instanceCount = count;
    this.field = new THREE.Mesh(geo, this.fieldMaterial);
    this.field.frustumCulled = false;
    this.field.receiveShadow = true;
    this.fieldTotal = count;
    this.group.add(this.field);
  }

  get bladeCount() {
    return this.chunks.reduce((s, c) => s + c.total, 0) + this.fieldTotal;
  }

  setQuality(density: number, drawDistance: number, fieldDensity = 1) {
    this.density = density;
    this.uniforms.uDrawDist.value = drawDistance;
    if (this.field) {
      this.field.visible = fieldDensity > 0;
      (this.field.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(this.fieldTotal * fieldDensity);
    }
  }

  update(time: number, player: THREE.Vector3) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uPlayer.value.copy(player);
    const dd = u.uDrawDist.value;
    let budget = 2; // lazily build a couple of chunks per frame
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - player.x, c.cz - player.z) - CHUNK * 0.6);
      if (!c.built) {
        if (d < dd + CHUNK && budget > 0) {
          this.buildChunk(c);
          budget--;
        } else continue;
      }
      if (!c.mesh) continue;
      const visible = this.density > 0 && d < dd;
      c.mesh.visible = visible;
      if (!visible) continue;
      const lod = d < dd * 0.3 ? 1 : d < dd * 0.6 ? 0.6 : 0.32;
      (c.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(1, Math.floor(c.total * lod * this.density));
    }
  }

  private createMaterial(field: boolean) {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = this.uniforms;
    const placement = field
      ? /* glsl */ `
          vec2 fp = aOffset.xz;
          vec2 fc = uPlayer.xz;
          fp += floor((fc - fp) / uTile + 0.5) * uTile;
          vec2 wuv = fp / uWorldSize + 0.5;
          vec2 huv = (wuv * (uHeightRes - 1.0) + 0.5) / uHeightRes;
          float fy = texture2D(uHeightTex, huv).r;
          vec4 fm = texture2D(uMaskTex, wuv);
          float waterDepth = fm.g * 8.0 - 1.0;
          float allowed = (1.0 - smoothstep(0.18, 0.32, fm.r)) * (1.0 - step(0.04, fm.b)) * (1.0 - smoothstep(-0.7, -0.45, waterDepth)) * smoothstep(0.3, 0.7, fm.a);
          float edgeFade = 1.0 - smoothstep(uTile * 0.28, uTile * 0.48, distance(fp, fc));
          float meadowN = vnoise(fp * 0.035);
          vec3 base = vec3(fp.x, fy - 0.03, fp.y);
          float distP = distance(base.xz, uPlayer.xz);
          float lod = 0.0;
          float h = aShape.x * allowed * edgeFade * (0.75 + meadowN * 0.55);
          float w = aShape.y;
          float tintV = aExtra.x + (vnoise(fp * 0.02 + 9.0) - 0.5) * 1.6;
          float fa = aOffset.w;
          float leanAmt = aShape.z;
        `
      : /* glsl */ `
          vec3 base = aOffset.xyz;
          float distP = distance(base.xz, uPlayer.xz);
          float lod = smoothstep(uDrawDist * 0.25, uDrawDist * 0.85, distP);
          float fade = 1.0 - smoothstep(uDrawDist * 0.8, uDrawDist, distP);
          float h = aShape.x * fade;
          float w = aShape.y * mix(1.0, 2.8, lod);
          float tintV = aExtra.x;
          float fa = aOffset.w;
          float leanAmt = aShape.z;
        `;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOffset;
          attribute vec4 aShape;
          attribute vec2 aExtra;
          uniform float uTime, uDrawDist, uWind, uTile, uWorldSize, uHeightRes;
          uniform vec2 uWindDir;
          uniform vec3 uPlayer;
          uniform sampler2D uHeightTex;
          uniform sampler2D uMaskTex;
          varying float vT;
          varying float vSide;
          varying float vTint;
          varying float vRnd;
          varying float vLod;
          varying vec3 vWPos;
          ${noiseGLSL}`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `
          float t = position.y;
          float side = position.x;
          ${placement}
          float taper = pow(1.0 - t, 0.9);
          vec3 bladeRight = vec3(cos(fa), 0.0, -sin(fa));
          vec3 bladeFwd = vec3(sin(fa), 0.0, cos(fa));

          vec2 wd = normalize(uWindDir);
          float gust = smoothstep(0.25, 0.9, vnoise(base.xz * 0.028 - wd * uTime * 0.45));
          float wave = sin(dot(base.xz, wd) * 0.22 - uTime * 1.7) * 0.5 + 0.5;
          float flutter = sin(uTime * (5.0 + aShape.w * 4.0) + aShape.w * 40.0) * 0.06;
          float windAmt = (gust * 0.75 + wave * 0.3) * uWind;

          vec3 windVec = vec3(wd.x, 0.0, wd.y);
          vec3 bendDir = normalize(bladeFwd * leanAmt + windVec * windAmt * 1.6 + vec3(1e-4, 0.0, 0.0));
          float bend = leanAmt * 0.45 + windAmt * 0.75 + flutter;

          vec2 away = base.xz - uPlayer.xz;
          float push = (1.0 - smoothstep(0.2, 1.5, distP)) * (1.0 - smoothstep(1.0, 2.2, abs(uPlayer.y - base.y)));
          bendDir = normalize(mix(bendDir, vec3(away.x, 0.0, away.y) / max(distP, 0.001), push));
          bend = clamp(mix(bend, 1.35, push), 0.0, 1.4);

          vec3 p1 = vec3(0.0, h * 0.62, 0.0);
          vec3 p2 = vec3(0.0, h * (1.0 - 0.28 * bend * bend), 0.0) + bendDir * h * bend * 0.7;
          vec3 curve = 2.0 * (1.0 - t) * t * p1 + t * t * p2;
          vec3 tangent = normalize(2.0 * (1.0 - t) * p1 + 2.0 * t * (p2 - p1) + vec3(0.0, 1e-4, 0.0));
          vec3 grassPos = base + curve + bladeRight * side * w * taper;

          vec3 n = normalize(cross(bladeRight, tangent));
          if (dot(n, cameraPosition - grassPos) < 0.0) n = -n;
          n = normalize(n + bladeRight * side * 1.4);
          n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.3 + lod * 0.45));
          vec3 objectNormal = n;

          vT = t;
          vSide = side;
          vTint = tintV;
          vRnd = aShape.w;
          vLod = lod;
          vWPos = grassPos;
          `,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uBase, uMid, uTip, uTipDry, uTipCool, uSunDir, uSunColor;
          uniform float uSunStrength;
          varying float vT;
          varying float vSide;
          varying float vTint;
          varying float vRnd;
          varying float vLod;
          varying vec3 vWPos;`,
        )
        .replace(
          '#include <color_fragment>',
          `
          vec3 tipC = mix(uTip, uTipDry, smoothstep(0.3, 1.0, vTint) * 0.65);
          tipC = mix(tipC, uTipCool, smoothstep(-0.3, -1.0, vTint) * 0.55);
          vec3 col = mix(uBase, uMid, smoothstep(0.0, 0.5, vT));
          col = mix(col, tipC, smoothstep(0.35, 1.0, vT));
          col *= 0.86 + vRnd * 0.28;
          col *= 1.0 - (1.0 - smoothstep(0.0, 0.14, abs(vSide))) * 0.1 * (1.0 - vLod);
          diffuseColor.rgb = col;
          `,
        )
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace(
          '#include <opaque_fragment>',
          `
          vec3 viewW = normalize(cameraPosition - vWPos);
          float backLit = pow(max(dot(-viewW, uSunDir), 0.0), 3.0);
          float translucency = backLit * smoothstep(0.25, 1.0, vT) * uSunStrength;
          outgoingLight += diffuseColor.rgb * uSunColor * translucency * 1.6;
          outgoingLight += uSunColor * pow(vT, 6.0) * 0.03 * uSunStrength;
          #include <opaque_fragment>
          `,
        );
    };
    mat.customProgramCacheKey = () => (field ? 'grass-field' : 'grass-chunk');
    return mat;
  }
}
