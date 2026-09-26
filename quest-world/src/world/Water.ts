import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { lakes, WATER_LEVEL, WORLD_SIZE } from './layout';
import { noiseGLSL } from '../shaders/noise.glsl';

/*
 * Stylised lake water. The cell highlight idea is inspired by Ebenezer's AnimeWaterShader
 * (https://github.com/thebenezer/AnimeWaterShader); depth-aware colour, shoreline foam,
 * fresnel sky tint and sun glints are driven by a baked terrain depth texture.
 */
export class Water {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(terrain: Terrain) {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uMask: { value: null },
        uWorldSize: { value: WORLD_SIZE },
        uShallow: { value: new THREE.Color('#5fc4b8') },
        uDeep: { value: new THREE.Color('#1d5f73') },
        uHighlight: { value: new THREE.Color('#e9fbff') },
        uFoam: { value: new THREE.Color('#f7fbf5') },
        uSky: { value: new THREE.Color('#bcd7ee') },
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
        uSunColor: { value: new THREE.Color('#fff1d6') },
        uSunStrength: { value: 1 },
        uNight: { value: 0 },
      },
    ]);
    this.uniforms.uMask.value = terrain.maskTexture;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vWPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uWorldSize, uSunStrength, uNight;
        uniform sampler2D uMask;
        uniform vec3 uShallow, uDeep, uHighlight, uFoam, uSky, uSunDir, uSunColor;
        varying vec3 vWPos;
        ${noiseGLSL}
        void main() {
          vec2 muv = vWPos.xz / uWorldSize + 0.5;
          float depth = texture2D(uMask, muv).g * 8.0 - 1.0;
          if (depth < -0.05) discard;
          float d01 = smoothstep(0.0, 3.2, depth);
          vec3 col = mix(uShallow, uDeep, d01);

          vec2 p = vWPos.xz * 0.32;
          p += vec2(vnoise(p * 1.4 + uTime * 0.25), vnoise(p * 1.4 - uTime * 0.2)) * 0.7;
          vec2 v = voronoi(p, uTime * 0.55);
          float cells = smoothstep(0.6, 0.98, v.x);
          col = mix(col, uHighlight, cells * mix(0.45, 0.18, d01) * (1.0 - uNight * 0.6));

          vec2 flow = uTime * vec2(0.12, 0.08);
          float e = 0.2;
          float hC = fbm2(vWPos.xz * 0.3 + flow);
          float hX = fbm2((vWPos.xz + vec2(e, 0.0)) * 0.3 + flow);
          float hZ = fbm2((vWPos.xz + vec2(0.0, e)) * 0.3 + flow);
          vec3 n = normalize(vec3((hC - hX) * 1.6, e, (hC - hZ) * 1.6));
          vec3 V = normalize(cameraPosition - vWPos);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          col = mix(col, uSky, fres * 0.6);
          vec3 R = reflect(-uSunDir, n);
          float spec = pow(max(dot(R, V), 0.0), 220.0) * uSunStrength;
          col += uSunColor * spec * 3.0;

          float glint = step(0.993, hash12(floor(vWPos.xz * 2.5) + floor(uTime * 3.0)));
          col += glint * cells * uSunColor * (0.6 + uNight);

          float wave = sin(depth * 12.0 - uTime * 2.0 + vnoise(vWPos.xz * 0.7) * 5.0) * 0.5 + 0.5;
          float foam = max(1.0 - smoothstep(0.0, 0.32, depth), smoothstep(0.55, 0.95, wave) * (1.0 - smoothstep(0.0, 0.9, depth)) * 0.8);
          foam *= 0.65 + 0.35 * vnoise(vWPos.xz * 2.2 + uTime * 0.5);
          col = mix(col, uFoam * (1.0 - uNight * 0.55), clamp(foam, 0.0, 1.0));

          float alpha = mix(0.62, 0.94, d01);
          alpha = max(alpha, foam);
          alpha *= smoothstep(-0.05, 0.06, depth);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });

    for (const lake of lakes) {
      const geo = new THREE.CircleGeometry(lake.r * 1.5, 72).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lake.x, WATER_LEVEL, lake.z);
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
  }
}
