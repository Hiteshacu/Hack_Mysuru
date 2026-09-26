import * as THREE from 'three';
import gsap from 'gsap';
import { Sky } from 'three/addons/objects/Sky.js';
import { noiseGLSL } from '../shaders/noise.glsl';

import { TIMES, type TimeOfDay } from './layout';
export { TIMES, type TimeOfDay };

/*
 * Realistic sky: three.js' physically based Preetham atmospheric-scattering sky (with its built-in
 * animated cloud layer), plus a star field and moon for night. The same sky is rendered into a
 * PMREM environment map so every PBR model is lit by the actual sky colour.
 */

interface Preset {
  sunElev: number; // light direction (at night this is the moon)
  skyElev: number; // sun elevation used by the scattering model
  sunAzim: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogDensity: number;
  skyHorizon: string;
  waterShallow: string;
  waterDeep: string;
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  clouds: number;
  exposure: number;
  envIntensity: number;
  night: number;
  bloom: number;
}

const PRESETS: Record<TimeOfDay, Preset> = {
  // Golden morning: warm and directional, but high enough that the valley is not all long shadow.
  morning: {
    sunElev: 31, skyElev: 17, sunAzim: 110, sunColor: '#ffdcb4', sunIntensity: 3.4,
    hemiSky: '#c8dcf2', hemiGround: '#7a6746', hemiIntensity: 1.1,
    fog: '#dcd6c8', fogDensity: 0.0029, skyHorizon: '#edd9bd',
    waterShallow: '#6fc6b6', waterDeep: '#276a78',
    turbidity: 5, rayleigh: 2, mie: 0.005, mieG: 0.82, clouds: 0.42, exposure: 0.52, envIntensity: 0.95, night: 0, bloom: 0.26,
  },
  day: {
    sunElev: 46, skyElev: 46, sunAzim: 135, sunColor: '#fff4e2', sunIntensity: 3.6,
    hemiSky: '#cfe2fb', hemiGround: '#7d6b46', hemiIntensity: 0.95,
    fog: '#c3d6e6', fogDensity: 0.0025, skyHorizon: '#bcd4ea',
    waterShallow: '#5fc9bd', waterDeep: '#1d6477',
    turbidity: 3.2, rayleigh: 1.25, mie: 0.004, mieG: 0.8, clouds: 0.4, exposure: 0.42, envIntensity: 1, night: 0, bloom: 0.2,
  },
  sunset: {
    sunElev: 9, skyElev: 4, sunAzim: 250, sunColor: '#ffab66', sunIntensity: 3,
    hemiSky: '#e9b8a4', hemiGround: '#5d4838', hemiIntensity: 1.15,
    fog: '#dba27e', fogDensity: 0.0042, skyHorizon: '#f0a674',
    waterShallow: '#d49a7a', waterDeep: '#40496e',
    turbidity: 8, rayleigh: 2.4, mie: 0.007, mieG: 0.88, clouds: 0.5, exposure: 0.85, envIntensity: 0.7, night: 0.1, bloom: 0.55,
  },
  // Bright moonlight rather than pitch black: the valley should still read as a landscape at night.
  night: {
    sunElev: 38, skyElev: -6, sunAzim: 300, sunColor: '#bcc8ff', sunIntensity: 1.5,
    hemiSky: '#6b81c4', hemiGround: '#39405a', hemiIntensity: 1.5,
    fog: '#1d2a48', fogDensity: 0.0042, skyHorizon: '#2b3c6b',
    waterShallow: '#3b7a94', waterDeep: '#12294d',
    turbidity: 2.2, rayleigh: 0.9, mie: 0.003, mieG: 0.72, clouds: 0.3, exposure: 0.5, envIntensity: 0.6, night: 1, bloom: 0.9,
  },
};

type NumKey = { [K in keyof Preset]: Preset[K] extends number ? K : never }[keyof Preset];
type ColKey = { [K in keyof Preset]: Preset[K] extends string ? K : never }[keyof Preset];
const NUM_KEYS: NumKey[] = [
  'sunElev', 'skyElev', 'sunAzim', 'sunIntensity', 'hemiIntensity', 'fogDensity', 'turbidity', 'rayleigh', 'mie', 'mieG', 'clouds', 'exposure', 'envIntensity', 'night', 'bloom',
];
const COL_KEYS: ColKey[] = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'skyHorizon', 'waterShallow', 'waterDeep'];

type LiveState = Record<NumKey, number> & Record<ColKey, THREE.Color>;

function toLive(p: Preset): LiveState {
  const s = {} as LiveState;
  for (const k of NUM_KEYS) s[k] = p[k];
  for (const k of COL_KEYS) s[k] = new THREE.Color(p[k]);
  return s;
}

function makeSky(exposure: { value: number }) {
  const sky = new Sky();
  sky.material.onBeforeCompile = (shader) => {
    shader.uniforms.skyExposure = exposure;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main()', 'uniform float skyExposure;\nvoid main()')
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb *= skyExposure;\n#include <tonemapping_fragment>');
  };
  return sky;
}

export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  readonly sky: Sky;
  readonly sunDir = new THREE.Vector3();
  readonly skySunDir = new THREE.Vector3();
  state: LiveState;
  time: TimeOfDay = 'morning';
  /** Called when a time-of-day transition finishes (used to refresh the environment map). */
  onSettled?: () => void;
  private skyExposure = { value: 0.42 };
  private stars: THREE.Mesh;
  get starsMesh() {
    return this.stars;
  }
  private starUniforms = { uNight: { value: 0 }, uTime: { value: 0 } };
  private tween?: gsap.core.Tween;
  private lightSpace = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private envScene = new THREE.Scene();
  private envSky: Sky;
  private envExposure = { value: 0.42 };
  envTexture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene) {
    this.state = toLive(PRESETS.morning);

    this.sun = new THREE.DirectionalLight('#fff', 3);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -36;
    cam.right = 36;
    cam.top = 36;
    cam.bottom = -36;
    cam.near = 1;
    cam.far = 220;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 1.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#fff', '#553', 0.7);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2('#c3d6e6', 0.0025);
    scene.fog = this.fog;

    this.sky = makeSky(this.skyExposure);
    this.sky.scale.setScalar(1000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -2;
    scene.add(this.sky);

    this.envSky = makeSky(this.envExposure);
    this.envSky.scale.setScalar(50);
    this.envSky.material.uniforms.showSunDisc.value = 0;
    this.envScene.add(this.envSky);

    this.stars = new THREE.Mesh(
      new THREE.SphereGeometry(850, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.starUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uNight, uTime;
          varying vec3 vDir;
          ${noiseGLSL}
          void main() {
            if (uNight < 0.01) discard;
            vec3 dir = normalize(vDir);
            float y = dir.y;
            vec2 st = vec2(atan(dir.z, dir.x) * 90.0, asin(clamp(y, -1.0, 1.0)) * 90.0);
            float h = hash12(floor(st));
            float star = step(0.986, h) * smoothstep(0.35, 0.0, length(fract(st) - 0.5));
            star *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
            float milky = smoothstep(0.55, 0.9, fbm2(vec2(atan(dir.z, dir.x) * 3.0, y * 6.0))) * smoothstep(0.0, 0.4, y) * 0.12;
            vec3 col = vec3(star * 1.8) + vec3(0.55, 0.6, 0.9) * milky;
            vec3 moonDir = normalize(vec3(-0.45, 0.55, -0.7));
            float md = max(dot(dir, moonDir), 0.0);
            col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9975, 0.9982, md) * 2.4;
            col += vec3(0.35, 0.45, 0.8) * pow(md, 40.0) * 0.35;
            col *= uNight * smoothstep(-0.02, 0.2, y);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    this.apply();
  }

  setTime(time: TimeOfDay, duration = 2.4) {
    this.time = time;
    const from = {} as LiveState;
    for (const k of NUM_KEYS) from[k] = this.state[k];
    for (const k of COL_KEYS) from[k] = this.state[k].clone();
    const to = toLive(PRESETS[time]);
    let dAz = to.sunAzim - from.sunAzim;
    if (dAz > 180) dAz -= 360;
    if (dAz < -180) dAz += 360;
    const proxy = { t: 0 };
    this.tween?.kill();
    this.tween = gsap.to(proxy, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        for (const k of NUM_KEYS) this.state[k] = from[k] + (to[k] - from[k]) * proxy.t;
        this.state.sunAzim = from.sunAzim + dAz * proxy.t;
        for (const k of COL_KEYS) this.state[k].copy(from[k]).lerp(to[k], proxy.t);
      },
      onComplete: () => this.onSettled?.(),
    });
  }

  nextTime() {
    const i = TIMES.indexOf(this.time);
    this.setTime(TIMES[(i + 1) % TIMES.length]);
    return this.time;
  }

  private applySkyUniforms(sky: Sky, exposure: { value: number }) {
    const s = this.state;
    const u = sky.material.uniforms;
    u.turbidity.value = s.turbidity;
    u.rayleigh.value = s.rayleigh;
    u.mieCoefficient.value = s.mie;
    u.mieDirectionalG.value = s.mieG;
    u.sunPosition.value.copy(this.skySunDir);
    u.cloudCoverage.value = s.clouds;
    u.cloudDensity.value = 0.55;
    u.cloudElevation.value = 0.55;
    exposure.value = s.exposure;
  }

  private apply() {
    const s = this.state;
    const az = THREE.MathUtils.degToRad(s.sunAzim);
    const el = THREE.MathUtils.degToRad(s.sunElev);
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    const sel = THREE.MathUtils.degToRad(s.skyElev);
    this.skySunDir.set(Math.cos(sel) * Math.cos(az), Math.sin(sel), Math.cos(sel) * Math.sin(az)).normalize();
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.fog.color.copy(s.fog);
    this.fog.density = s.fogDensity;
    this.applySkyUniforms(this.sky, this.skyExposure);
    this.starUniforms.uNight.value = s.night;
  }

  /** Renders the current sky into a PMREM environment map for image-based lighting. */
  buildEnvironmentMap(renderer: THREE.WebGLRenderer) {
    this.applySkyUniforms(this.envSky, this.envExposure);
    this.envSky.material.uniforms.cloudCoverage.value = this.state.clouds * 0.6;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(this.envScene, 0, 0.1, 200, { size: 128 });
    pmrem.dispose();
    this.envTexture?.dispose();
    this.envTexture = rt.texture;
    return rt.texture;
  }

  update(time: number, _dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.apply();
    this.sky.material.uniforms.time.value = time;
    this.starUniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);

    // Shadow camera follows the player, snapped to shadow texels to avoid shimmering.
    const cam = this.sun.shadow.camera;
    const texel = (cam.right - cam.left) / this.sun.shadow.mapSize.x;
    this.lightSpace.lookAt(new THREE.Vector3(), this.sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = this.lightSpace.clone().invert();
    this.tmp.copy(focus).applyMatrix4(inv);
    this.tmp.x = Math.round(this.tmp.x / texel) * texel;
    this.tmp.y = Math.round(this.tmp.y / texel) * texel;
    this.tmp.applyMatrix4(this.lightSpace);
    this.sun.target.position.copy(this.tmp);
    this.sun.position.copy(this.tmp).addScaledVector(this.sunDir, 100);
    this.sun.target.updateMatrixWorld();
  }
}
