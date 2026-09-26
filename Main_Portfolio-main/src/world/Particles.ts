import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { PLAY_RADIUS, zones } from './layout';
import { mulberry32 } from '../utils/math';

/*
 * Fireflies at night, drifting pollen by day — one instanced billboard system.
 * The glow/flash shading follows the approach in Ebenezer's threejs-fireflies (MIT).
 */
export class Particles {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uPixelRatio: { value: 1 },
  };

  constructor(terrain: Terrain, count = 900) {
    const r = mulberry32(555);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      let x: number, z: number;
      if (i % 5 < 3) {
        const zn = zones[i % zones.length];
        const a = r() * Math.PI * 2;
        const d = 4 + r() * (zn.flat + 10);
        x = zn.x + Math.cos(a) * d;
        z = zn.z + Math.sin(a) * d;
      } else {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * PLAY_RADIUS;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
      }
      pos.set([x, Math.max(terrain.heightAt(x, z), 0) + 0.5 + r() * 3.2, z], i * 3);
      rnd.set([r(), r()], i * 2);
    }
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.attributes.position = plane.attributes.position;
    geo.attributes.uv = plane.attributes.uv;
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 2));
    geo.instanceCount = count;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aPos;
        attribute vec2 aRnd;
        uniform float uTime, uNight;
        varying vec2 vUv;
        varying float vFlash;
        varying float vFade;
        void main() {
          float t = uTime * (0.35 + aRnd.x * 0.4);
          vec3 p = aPos + vec3(
            sin(t + aRnd.y * 40.0) * 1.4,
            sin(t * 1.3 + aRnd.x * 25.0) * 0.6,
            cos(t * 0.9 + aRnd.y * 31.0) * 1.4);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float size = mix(0.07, 0.24, uNight) * (0.7 + aRnd.x * 0.6);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float flash = sin(uTime * (2.0 + aRnd.y * 2.0) + aRnd.x * 60.0) * 0.5 + 0.5;
          vFlash = mix(0.6, pow(flash, 2.0), uNight);
          vFade = 1.0 - smoothstep(35.0, 60.0, -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying vec2 vUv;
        varying float vFlash;
        varying float vFade;
        void main() {
          float d = length(vUv - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          float core = smoothstep(0.14, 0.05, d);
          vec3 day = vec3(1.0, 0.95, 0.8);
          vec3 night = vec3(0.85, 1.0, 0.45);
          vec3 col = mix(day, night, uNight) * (core * 2.5 + glow * 0.8);
          float a = (core + glow * 0.6) * vFlash * vFade * mix(0.35, 1.0, uNight);
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(time: number, night: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uNight.value = night;
  }
}
