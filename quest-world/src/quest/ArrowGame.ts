// Arrow Range, in 3D. Each round asks a question and paints the three answers on archery targets down a
// sunset range; the player shoots the right one.
//
// Aiming is "what you see is where it lands": the + reticle is the landing point. A ray from the camera through
// the + finds the spot on a target (or the ground), and the launch velocity is solved so the 3D arrow passes
// exactly through it. The skill is steadiness and timing, like real archery:
//   - hold to draw: the reticle sway shrinks as the bow reaches full draw,
//   - hold too long at full draw and the arm tires, so the sway grows again,
//   - release under-drawn and the arrow drops short,
//   - wind pushes the reticle sideways; keep the + on the board to compensate.
// After release the camera follows the arrow, slows down near the target and shows the impact
// (the "arrow cam" used by archery games), then returns to the shooting line.
// Controls: mouse / touch / arrow keys move the reticle; hold click or Space to draw; release to shoot.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { Assets } from '../core/Assets';
import { esc } from './api';

export interface ArrowRound {
  prompt: string;
  choices: string[];
}

export interface ArrowResult {
  picks: number[];
  accuracy: number;
  hits: number;
}

interface Target {
  label: string;
  index: number;
  group: THREE.Group;
  face: THREE.Mesh;
  glow: THREE.Mesh;
  sign: THREE.Mesh;
  base: THREE.Vector3;
  /** x from SLOTS before the portrait squeeze. */
  slotX: number;
  r: number;
  hover: number;
  wobble: number;
  phase: number;
}

interface Arrow {
  mesh: THREE.Group;
  start: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  /** Planned arrival time at the aimed point. */
  T: number;
  flying: boolean;
  goal?: Target;
  /** Hit point in the goal target's local space (so moving targets are still hit where aimed). */
  local?: THREE.Vector3;
  trail: THREE.Line;
  trailPts: THREE.Vector3[];
}

interface Popup {
  pos: THREE.Vector3;
  text: string;
  color: string;
  life: number;
  big: boolean;
}

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
}

const COLORS = ['#f2b35c', '#7fd6c2', '#e39bd0'];
/** Phones and tablets: touch controls and a lighter renderer (two 3D views at once is heavy for mobile GPUs). */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const ARROWS_PER_ROUND = 2;
const STEADY_TIME = 1.6;
const FULL_DRAW = 0.85;
const G = new THREE.Vector3(0, -9.81, 0);
const HOME = new THREE.Vector3(0, 1.65, 7);
const LOOK = new THREE.Vector3(0, 1.9, -24);
/** Where the targets stand: x, z and face height. Rotated each round so the answer order changes. */
const SLOTS: [number, number, number][] = [
  [-4.3, -13, 1.45],
  [0.3, -18.5, 1.8],
  [4.7, -15, 1.55],
];

class Sfx {
  ctx: AudioContext | null = null;
  constructor() {
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private noise(dur: number) {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }
  twang() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    this.env(g, t, 0.005, 0.35, 0.3);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.4);
    const n = this.noise(0.35);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const ng = c.createGain();
    this.env(ng, t, 0.01, 0.18, 0.32);
    n.connect(f).connect(ng).connect(c.destination);
    n.start(t);
  }
  whoosh() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = this.noise(0.6);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const g = c.createGain();
    this.env(g, t, 0.05, 0.12, 0.5);
    n.connect(f).connect(g).connect(c.destination);
    n.start(t);
  }
  thunk(big = false) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 140 : 110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(g, t, 0.003, big ? 0.7 : 0.5, 0.22);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.3);
  }
  chord(good: boolean) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [220, 207.65];
    notes.forEach((fr, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = good ? 'sine' : 'sawtooth';
      o.frequency.value = fr;
      const st = t + i * (good ? 0.08 : 0.12);
      this.env(g, st, 0.01, good ? 0.18 : 0.08, good ? 0.5 : 0.25);
      o.connect(g).connect(c.destination);
      o.start(st);
      o.stop(st + 0.7);
    });
  }
  creak(power: number) {
    const c = this.ctx;
    if (!c || Math.random() > 0.25) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = 60 + power * 90;
    this.env(g, t, 0.005, 0.015, 0.05);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.08);
  }
}

const rnd = (() => {
  let s = 12345;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class ArrowGame {
  private root: HTMLDivElement;
  private overlay: HTMLCanvasElement;
  private o: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.05, 1200);
  private W = 0;
  private H = 0;
  private dpr = 1;
  private aim = { x: 0, y: 0 };
  private reticle = { x: 0, y: 0 };
  private touchLift = 0;
  private power = 0;
  private fullTime = 0;
  private drawing = false;
  private round = 0;
  private arrowsLeft = ARROWS_PER_ROUND;
  private arrows: Arrow[] = [];
  private targets: Target[] = [];
  private popups: Popup[] = [];
  private sparks: Spark[] = [];
  private sparkPoints: THREE.Points;
  private wind = 0;
  private picks: number[] = [];
  private ringScores: number[] = [];
  private shots = 0;
  private shake = 0;
  private timeScale = 1;
  private time = 0;
  private last = 0;
  private raf = 0;
  private locked = false;
  private sfx = new Sfx();
  private keys = new Set<string>();
  private ray = new THREE.Raycaster();
  private bow!: THREE.Group;
  private bowString!: THREE.Line;
  private nocked!: THREE.Group;
  private windsock!: THREE.Group;
  private flags: { mesh: THREE.Mesh; base: Float32Array; phase: number }[] = [];
  private pollen!: THREE.Points;
  private birds: { g: THREE.Group; speed: number; phase: number; y: number; z: number }[] = [];
  private cam: 'aim' | 'follow' | 'impact' | 'return' = 'aim';
  private camTimer = 0;
  private followed: Arrow | null = null;
  private camPos = HOME.clone();
  private camLook = LOOK.clone();
  private sunDir = new THREE.Vector3();
  /** World position of the last impact, for the impact camera. */
  private impactAt = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];
  /** Portrait phones: targets closer together and a wider view, so all three answers fit on screen. */
  private xScale = 1;

  constructor(
    host: HTMLElement,
    private rounds: ArrowRound[],
    private onFinish: (r: ArrowResult) => void,
    private onExit: () => void,
    private assets?: Assets,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'arrow-game three';
    this.root.innerHTML = `
      <canvas class="ag-gl"></canvas>
      <canvas class="ag-overlay"></canvas>
      <div class="ag-top">
        <div class="ag-round"><span class="ag-kicker">Round <b class="ag-rn">1</b>/${rounds.length}</span><span class="ag-prompt"></span></div>
        <button class="ag-exit" aria-label="Leave the range">✕</button>
      </div>
      <div class="ag-hud">
        <div class="ag-quiver" aria-label="Arrows left"></div>
        <div class="ag-score"><b class="ag-correct">0</b><span>answered · 3 correct wins the rifle</span></div>
      </div>
      <div class="ag-bottom">
        <div class="ag-power"><i></i><em class="ag-zone"></em></div>
        <span class="ag-status">Put the <b>+</b> on the right answer</span>
        <span class="ag-hint">${TOUCH ? 'Touch and hold on the right target · drag to adjust · lift your finger in the <b class="ok">green</b> to shoot' : 'Move to aim · hold <kbd>click</kbd> / <kbd>Space</kbd> to draw · release in the <b class="ok">green</b> to shoot · <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> also aim'}</span>
      </div>
      <div class="ag-banner" hidden></div>`;
    host.appendChild(this.root);
    const gl = this.root.querySelector<HTMLCanvasElement>('.ag-gl')!;
    this.overlay = this.root.querySelector<HTMLCanvasElement>('.ag-overlay')!;
    this.o = this.overlay.getContext('2d')!;
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: !TOUCH, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !TOUCH;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.querySelector('.ag-exit')!.addEventListener('click', () => this.close(true));

    this.buildWorld();
    this.buildBow();
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#ffe0a0', size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);

    this.bind();
    this.resize();
    this.aim = { x: this.W * 0.55, y: this.H * 0.5 };
    this.reticle = { ...this.aim };
    this.startRound(0);
    if (import.meta.env.DEV) (window as unknown as { __ag: ArrowGame }).__ag = this;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- world

  private buildWorld() {
    const s = this.scene;
    // Golden-hour sky and matching fog
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(160));
    u.sunPosition.value.copy(this.sunDir);
    s.add(sky);
    s.fog = new THREE.Fog('#d9a27a', 70, 330);

    s.add(new THREE.HemisphereLight('#ffe2c0', '#3b4a2c', 1.05));
    const sun = new THREE.DirectionalLight('#ffd3a0', 2.4);
    sun.position.copy(this.sunDir).multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -40;
    sc.far = 200;
    sun.shadow.bias = -0.0005;
    s.add(sun);

    // Mowed lawn with range lanes
    const lawn = canvasTexture(512, 512, (g) => {
      g.fillStyle = '#5b8a3c';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,220,0.06)' : 'rgba(0,30,0,0.08)';
        g.fillRect(i * 64, 0, 64, 512);
      }
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${40 + rnd() * 60},${90 + rnd() * 80},${30 + rnd() * 30},0.35)`;
        g.fillRect(rnd() * 512, rnd() * 512, 1.5, 3);
      }
    });
    lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping;
    lawn.repeat.set(40, 40);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lawn, roughness: 1 }));
    ground.receiveShadow = true;
    s.add(ground);
    this.track(ground);

    // Shooting line, lane markers and distance boards
    const white = new THREE.MeshStandardMaterial({ color: '#f3efe2', roughness: 0.9 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(18, 0.02, 0.18), white);
    line.position.set(0, 0.01, 4.4);
    s.add(line);
    for (const x of [-9, -3, 3, 9]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 40), new THREE.MeshStandardMaterial({ color: '#e8e2cc', roughness: 1, transparent: true, opacity: 0.45 }));
      m.position.set(x, 0.012, -14);
      s.add(m);
    }
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5234', roughness: 0.9 });
    const darkWood = new THREE.MeshStandardMaterial({ color: '#4d321f', roughness: 0.9 });
    // Side fences
    for (const side of [-1, 1]) {
      for (let z = 6; z > -44; z -= 3.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), darkWood);
        post.position.set(side * 12, 0.55, z);
        post.castShadow = true;
        s.add(post);
      }
      for (const y of [0.45, 0.9]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 50), wood);
        rail.position.set(side * 12, y, -19);
        rail.castShadow = true;
        s.add(rail);
      }
    }
    // Straw bales behind the targets
    const straw = new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.9), straw);
      b.position.set(-8 + i * 2 + (i % 2) * 0.2, 0.4 + (i % 3 === 0 ? 0.8 : 0), -24 - (i % 2) * 0.3);
      b.rotation.y = (rnd() - 0.5) * 0.2;
      b.castShadow = b.receiveShadow = true;
      s.add(b);
    }

    // Trees from the quest world (same models as the valley), or simple cones as a fallback
    const treeNames = ['Tree_1', 'Tree_2', 'Tree_3', 'Tree_4', 'Tree_5', 'MapleTree_1', 'MapleTree_2', 'BirchTree_1', 'BirchTree_2'];
    const place = (x: number, z: number, scale: number) => {
      const name = treeNames[Math.floor(rnd() * treeNames.length)];
      let obj: THREE.Object3D;
      try {
        if (!this.assets) throw new Error('no assets');
        obj = this.assets.instance(name);
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((src) => {
            const c = (src as THREE.MeshStandardMaterial).clone();
            if (/Leaves|Flowers/.test(src.name) || c.map) {
              c.side = THREE.DoubleSide;
              c.alphaTest = Math.max(c.alphaTest, 0.42);
              c.transparent = false;
            }
            c.roughness = 1;
            c.metalness = 0;
            return c;
          });
          m.material = Array.isArray(m.material) ? mats : mats[0];
        });
      } catch {
        obj = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.6, 6), darkWood);
        trunk.position.y = 0.8;
        const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.4, 7), new THREE.MeshStandardMaterial({ color: '#3f6b35', flatShading: true }));
        crown.position.y = 3;
        obj.add(trunk, crown);
        obj.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      }
      obj.position.set(x, 0, z);
      obj.rotation.y = rnd() * Math.PI * 2;
      obj.scale.setScalar(scale);
      s.add(obj);
    };
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      place(side * (15 + rnd() * 16), 10 - rnd() * 75, 1 + rnd() * 0.7);
    }
    for (let i = 0; i < 14; i++) place(-40 + i * 6 + rnd() * 3, -48 - rnd() * 14, 1.1 + rnd() * 0.8);

    // Distant hills and the Mysuru Palace on Chamundi hill
    const hillMat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });
    const hills: [number, number, number, number, number, string][] = [
      [-120, -230, 90, 34, 60, '#5c6b3f'],
      [60, -260, 120, 46, 70, '#55623b'],
      [190, -210, 80, 30, 55, '#627246'],
      [-230, -170, 90, 26, 60, '#657448'],
      [0, -330, 180, 70, 90, '#6d6f50'],
    ];
    for (const [x, z, r, h, d, c] of hills) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hillMat(c));
      m.scale.set(r, h, d);
      m.position.set(x, -2, z);
      s.add(m);
    }
    this.buildPalace(new THREE.Vector3(18, 0, -190));

    // Windsock showing the wind
    this.windsock = new THREE.Group();
    this.windsock.position.set(-8.5, 0, -12);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 8), new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 0.5, roughness: 0.4 }));
    pole.position.y = 2.5;
    pole.castShadow = true;
    this.windsock.add(pole);
    const sockTex = canvasTexture(256, 64, (g) => {
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#ff6b3d';
        g.fillRect(i * 51.2, 0, 51.2, 64);
      }
    });
    const sock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.14, 1.6, 16, 1, true).rotateZ(Math.PI / 2).translate(0.8, 0, 0),
      new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    sock.name = 'sock';
    sock.position.y = 4.85;
    sock.castShadow = true;
    this.windsock.add(sock);
    s.add(this.windsock);

    // ProofArena banners on the shooting line
    const flagColors = ['#4338ca', '#f2b35c', '#7fd6c2'];
    [-8, 8, 0].forEach((x, i) => {
      const z = i === 2 ? -36 : 4.8;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.6, 8), darkWood);
      p.position.set(x, 1.8, z);
      p.castShadow = true;
      s.add(p);
      const geo = new THREE.PlaneGeometry(1.4, 0.8, 12, 6).translate(0.7, 0, 0);
      const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: flagColors[i], side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(x, 3.2, z);
      flag.castShadow = true;
      s.add(flag);
      this.flags.push({ mesh: flag, base: (geo.attributes.position.array as Float32Array).slice(), phase: i * 1.7 });
    });

    // Pollen and fireflies drifting with the wind
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 60;
      pos[i * 3 + 1] = 0.3 + rnd() * 7;
      pos[i * 3 + 2] = 8 - rnd() * 60;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#fff1b8', size: 0.06, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.add(this.pollen);

    // A few birds gliding over the range
    const birdMat = new THREE.LineBasicMaterial({ color: '#2b1d24' });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.6, 0.15, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0.15, 0)]);
      g.add(new THREE.Line(wing, birdMat));
      const y = 22 + rnd() * 14;
      const z = -60 - rnd() * 60;
      g.position.set(-80 + rnd() * 160, y, z);
      g.scale.setScalar(2 + rnd());
      s.add(g);
      this.birds.push({ g, speed: 3 + rnd() * 3, phase: rnd() * 6, y, z });
    }
  }

  private buildPalace(at: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(at);
    const stone = new THREE.MeshStandardMaterial({ color: '#d9c7a8', roughness: 0.9 });
    const dome = new THREE.MeshStandardMaterial({ color: '#c98d4a', roughness: 0.6, metalness: 0.2 });
    const lit = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#56643a', flatShading: true, roughness: 1 }));
    hill.scale.set(70, 22, 40);
    hill.position.y = -8;
    g.add(hill);
    const base = new THREE.Group();
    base.position.y = 12;
    g.add(base);
    const box = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
      m.position.set(x, y + h / 2, z);
      base.add(m);
      return m;
    };
    box(44, 8, 10, 0, 0);
    box(14, 8, 10, 0, 8);
    const addDome = (x: number, y: number, r: number) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome);
      d.position.set(x, y, 0);
      base.add(d);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.9, 8), dome);
      spire.position.set(x, y + r + r * 0.4, 0);
      base.add(spire);
    };
    addDome(0, 16, 6);
    for (const x of [-19, 19]) {
      box(5, 14, 5, x, 0);
      addDome(x, 14, 2.8);
    }
    for (let i = -8; i <= 8; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), lit);
      w.position.set(i * 2.4, 3.2, 5.05);
      base.add(w);
    }
    this.scene.add(g);
  }

  private buildBow() {
    this.bow = new THREE.Group();
    // Recurve bow held at the lower right; the string is at z=0 and the limbs curve forward to the grip.
    this.bow.position.set(0.17, -0.19, -0.55);
    this.bow.rotation.set(0.02, 0.1, -0.22);
    this.bow.scale.setScalar(0.5);
    const limbMat = new THREE.MeshStandardMaterial({ color: '#7a4526', roughness: 0.45, metalness: 0.05 });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.52, 0.02),
      new THREE.Vector3(0, 0.44, -0.07),
      new THREE.Vector3(0, 0.26, -0.14),
      new THREE.Vector3(0, 0, -0.17),
      new THREE.Vector3(0, -0.26, -0.14),
      new THREE.Vector3(0, -0.44, -0.07),
      new THREE.Vector3(0, -0.52, 0.02),
    ]);
    this.bow.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.014, 8), limbMat));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 10), new THREE.MeshStandardMaterial({ color: '#2b1a10', roughness: 0.9 }));
    grip.position.set(0, 0, -0.17);
    this.bow.add(grip);
    const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.52, 0.02), new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, -0.52, 0.02)]);
    this.bowString = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#f5efe0' }));
    this.bow.add(this.bowString);
    this.nocked = this.arrowMesh();
    this.nocked.position.set(0, 0, 0.02);
    this.bow.add(this.nocked);
    this.camera.add(this.bow);
    this.scene.add(this.camera);
    const hand = new THREE.PointLight('#ffd8a8', 0.6, 3);
    hand.position.set(0.3, 0.2, 0);
    this.camera.add(hand);
  }

  /** An arrow pointing down -z with its nock at the origin. */
  private arrowMesh() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.78, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d9c09a', roughness: 0.6 }));
    shaft.position.z = -0.39;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c7ccd6', metalness: 0.8, roughness: 0.3 }));
    head.position.z = -0.81;
    g.add(shaft, head);
    const fl = new THREE.MeshStandardMaterial({ color: '#e0564a', side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.12).translate(0.02, 0, 0).rotateX(Math.PI / 2), fl);
      f.position.z = -0.08;
      f.rotation.z = (i / 3) * Math.PI * 2;
      g.add(f);
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  private track(m: THREE.Mesh) {
    {
      this.disposables.push(m.geometry);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mm) => this.disposables.push(mm));
    }
  }

  // ---------------------------------------------------------------- targets

  private faceTexture(color: string) {
    return canvasTexture(512, 512, (g) => {
      ['#f7efe0', color, '#f7efe0', color, '#ffd27a'].forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(256, 256, 250 * (1 - i * 0.19), 0, Math.PI * 2);
        g.fill();
      });
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(256, 256, 250 * (1 - i * 0.19), 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#1d1d1d';
      g.beginPath();
      g.arc(256, 256, 5, 0, Math.PI * 2);
      g.fill();
    });
  }

  /** The answer sign, drawn exactly like the 2D range: dark rounded board, coloured border, cream text. */
  private signTexture(label: string, color: string, hover: boolean) {
    const font = '800 64px Manrope Variable, system-ui, sans-serif';
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const w = Math.max(360, Math.ceil(probe.measureText(label).width + 110));
    const tex = canvasTexture(w, 150, (g) => {
      g.fillStyle = hover ? '#3d2757' : '#2a1a3c';
      g.beginPath();
      g.roundRect(8, 8, w - 16, 134, 36);
      g.fill();
      g.strokeStyle = hover ? '#ffd27a' : color;
      g.lineWidth = 10;
      g.stroke();
      g.fillStyle = '#fff4dc';
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, w / 2, 80);
    });
    return { tex, aspect: w / 150 };
  }

  private makeTarget(label: string, index: number): Target {
    const color = COLORS[index % 3];
    const r = 1.25;
    const group = new THREE.Group();
    const straw = new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: 1 });
    const faceMat = new THREE.MeshStandardMaterial({ map: this.faceTexture(color), roughness: 0.85, emissive: '#ffd27a', emissiveIntensity: 0 });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.32, 48).rotateX(Math.PI / 2), [straw, faceMat, straw]);
    face.castShadow = face.receiveShadow = true;
    group.add(face);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0 }));
    glow.position.z = 0.17;
    group.add(glow);
    // Tripod stand
    const wood = new THREE.MeshStandardMaterial({ color: '#5b3b26', roughness: 0.9 });
    const legGeo = new THREE.BoxGeometry(0.09, 3, 0.09);
    for (const [x, z, rx, rz] of [
      [-0.7, 0.15, 0.08, -0.22],
      [0.7, 0.15, 0.08, 0.22],
      [0, -0.55, -0.32, 0],
    ]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(x * 0.6, -0.5, z);
      leg.rotation.set(rx, 0, rz);
      leg.castShadow = true;
      group.add(leg);
    }
    // Answer sign on two posts above the face
    const { tex, aspect } = this.signTexture(label, color, false);
    const h = 0.78;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    sign.position.set(0, r + 0.8, 0.05);
    group.add(sign);
    for (const x of [-0.35, 0.35]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), wood);
      post.position.set(x, r + 0.22, 0);
      group.add(post);
    }
    this.scene.add(group);
    return { label, index, group, face, glow, sign, base: new THREE.Vector3(), slotX: 0, r, hover: 0, wobble: 0, phase: rnd() * 6 };
  }

  private clearRound() {
    for (const t of this.targets) {
      this.scene.remove(t.group);
      t.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => {
          (mm as THREE.MeshStandardMaterial).map?.dispose();
          mm.dispose();
        });
      });
    }
    for (const a of this.arrows) {
      this.scene.remove(a.mesh, a.trail);
      a.trail.geometry.dispose();
    }
    this.targets = [];
    this.arrows = [];
  }

  // ---------------------------------------------------------------- input

  private resize = () => {
    this.dpr = Math.min(TOUCH ? 1.25 : 1.75, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.W, this.H);
    this.overlay.width = this.W * this.dpr;
    this.overlay.height = this.H * this.dpr;
    this.overlay.style.width = `${this.W}px`;
    this.overlay.style.height = `${this.H}px`;
    this.camera.aspect = this.W / this.H;
    const portrait = this.W < this.H;
    this.camera.fov = portrait ? 66 : 48;
    this.xScale = portrait ? 0.62 : 1;
    this.camera.updateProjectionMatrix();
    for (const t of this.targets) {
      t.base.x = t.slotX * this.xScale;
      t.group.position.x = t.base.x;
      t.group.lookAt(HOME.x, t.base.y, HOME.z);
    }
  };

  private bind() {
    window.addEventListener('resize', this.resize);
    const point = (e: PointerEvent) => {
      this.touchLift = e.pointerType === 'touch' ? 70 : 0;
      this.aimAt(e.clientX, e.clientY - this.touchLift);
    };
    this.overlay.addEventListener('pointermove', point);
    this.overlay.addEventListener('pointerdown', (e) => {
      try {
        this.overlay.setPointerCapture(e.pointerId);
      } catch {
        /* some mobile browsers refuse capture: aiming still works without it */
      }
      point(e);
      this.startDraw();
    });
    this.overlay.addEventListener('pointerup', () => this.release());
    this.overlay.addEventListener('pointercancel', () => {
      this.drawing = false;
      this.power = 0;
    });
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
  }

  private keydown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') return this.close(true);
    this.keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) this.startDraw();
  };

  private keyup = (e: KeyboardEvent) => {
    e.stopPropagation();
    this.keys.delete(e.code);
    if (e.code === 'Space') this.release();
  };

  private aimAt(x: number, y: number) {
    this.aim.x = Math.max(20, Math.min(this.W - 20, x));
    this.aim.y = Math.max(90, Math.min(this.H - 120, y));
  }

  private canShoot() {
    return !this.locked && this.cam === 'aim' && this.arrowsLeft > 0 && !this.arrows.some((a) => a.flying);
  }

  private startDraw() {
    if (!this.canShoot()) return;
    if (this.sfx.ctx?.state === 'suspended') this.sfx.ctx.resume();
    this.drawing = true;
    this.power = 0;
    this.fullTime = 0;
  }

  private swayAmp() {
    if (!this.drawing) return 14;
    const settle = 14 - Math.min(1, this.power / FULL_DRAW) * 11.5;
    const tired = Math.max(0, this.fullTime - STEADY_TIME) * 26;
    return Math.min(46, settle + tired);
  }

  private steady() {
    return this.drawing && this.power >= FULL_DRAW && this.fullTime <= STEADY_TIME;
  }

  /** What the reticle points at: the aimed target (if any) and the 3D point. */
  private pick(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.targets.map((t) => t.face), false);
    if (hits.length) {
      const t = this.targets.find((x) => x.face === hits[0].object)!;
      return { target: t, point: hits[0].point.clone() };
    }
    // Otherwise the ground, or a far backstop
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y < -0.001) {
      const k = -o.y / d.y;
      if (k < 90) return { target: undefined, point: o.clone().addScaledVector(d, k) };
    }
    return { target: undefined, point: o.clone().addScaledVector(d, 90) };
  }

  private release() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.power < 0.15) {
      this.power = 0;
      return;
    }
    let { target, point } = this.pick(this.reticle.x, this.reticle.y);
    // Under-drawn: the arrow drops short and low.
    const start = this.camera.localToWorld(new THREE.Vector3(0.1, -0.12, -0.9));
    const dist = start.distanceTo(point);
    const short = Math.max(0, FULL_DRAW - this.power);
    if (short > 0) {
      point = start.clone().lerp(point, 1 - short * 0.35);
      point.y -= short * dist * 0.18;
      if (target && target.face.worldToLocal(point.clone()).setZ(0).length() > target.r) target = undefined;
    }
    const T = 0.35 + start.distanceTo(point) / 38;
    const vel = point.clone().sub(start).addScaledVector(G, -0.5 * T * T).divideScalar(T);
    const mesh = this.arrowMesh();
    mesh.scale.setScalar(1.8); // easier to follow on the arrow cam
    mesh.position.copy(start);
    this.scene.add(mesh);
    const trailPts = [start.clone()];
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trailPts), new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    this.scene.add(trail);
    const arrow: Arrow = { mesh, start, vel, t: 0, T, flying: true, goal: target, trail, trailPts };
    if (target) arrow.local = target.face.worldToLocal(point.clone());
    this.arrows.push(arrow);
    this.nocked.visible = false;
    this.arrowsLeft--;
    this.shots++;
    this.power = 0;
    this.fullTime = 0;
    this.sfx.twang();
    window.setTimeout(() => this.sfx.whoosh(), 80);
    this.syncHud();
    // Arrow cam
    this.cam = 'follow';
    this.followed = arrow;
    this.camTimer = 0;
  }

  // ---------------------------------------------------------------- rounds

  private startRound(i: number) {
    this.clearRound();
    this.round = i;
    this.arrowsLeft = ARROWS_PER_ROUND;
    this.wind = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25) * (0.5 + i * 0.25);
    const r = this.rounds[i];
    const order = r.choices.map((label, index) => ({ label, index })).sort(() => Math.random() - 0.5);
    this.targets = order.map(({ label, index }, k) => {
      const t = this.makeTarget(label, index);
      const [x, z, y] = SLOTS[(k + i) % 3];
      t.slotX = x;
      t.base.set(x * this.xScale, y, z);
      t.group.position.copy(t.base);
      t.group.lookAt(HOME.x, y, HOME.z);
      return t;
    });
    this.nocked.visible = true;
    this.root.querySelector('.ag-rn')!.textContent = String(i + 1);
    this.root.querySelector('.ag-prompt')!.innerHTML = esc(r.prompt);
    this.syncHud();
    this.banner(`Round ${i + 1}`, r.prompt);
  }

  private banner(title: string, sub: string) {
    const b = this.root.querySelector<HTMLElement>('.ag-banner')!;
    b.innerHTML = `<small>${esc(title)}</small><strong>${esc(sub)}</strong>`;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    this.locked = true;
    window.setTimeout(() => {
      b.hidden = true;
      this.locked = false;
    }, 1500);
  }

  // The answer key never reaches the browser: the pick is recorded here and graded by the server at the end.
  private resolveRound(pick: number) {
    if (this.picks[this.round] !== undefined) return;
    this.picks[this.round] = pick;
    this.syncHud();
    this.locked = true;
    window.setTimeout(() => {
      if (this.round + 1 < this.rounds.length) this.startRound(this.round + 1);
      else this.finish();
    }, 1900);
  }

  private finish() {
    this.locked = true;
    const hits = this.ringScores.length;
    const accuracy = this.shots ? Math.round((this.ringScores.reduce((a, b) => a + b, 0) / (this.shots * 10)) * 100) : 0;
    this.onFinish({ picks: this.rounds.map((_, i) => this.picks[i] ?? -1), accuracy, hits });
  }

  /**
   * Shows the server's verdict on the end screen. On a pass the correct answers are revealed;
   * on a fail only the score is shown, so the next try can't just copy the answers.
   */
  showResult(correct: number, passed: boolean, rounds: { correct: boolean; answer: number }[] | null) {
    const b = this.root.querySelector<HTMLElement>('.ag-banner')!;
    b.hidden = false;
    b.classList.remove('show');
    b.classList.add('final');
    const list = rounds
      ? `<ul>${this.rounds
          .map((r, i) => `<li class="${rounds[i]?.correct ? 'ok' : 'bad'}">${rounds[i]?.correct ? '✔' : '✖'} ${esc(r.prompt)} → <b>${esc(r.choices[rounds[i]?.answer ?? 0])}</b></li>`)
          .join('')}</ul>`
      : `<p class="ag-note">You need 3 correct targets. The answers stay hidden so the next try is fair: think again, then aim.</p>`;
    b.innerHTML = `
      <small>${passed ? 'Range cleared' : 'Not this time'}</small>
      <strong>${correct}/${this.rounds.length} correct targets</strong>
      ${list}
      <div class="ag-actions">${passed ? '<button class="btn btn-primary" data-ag="done">Collect your rifle</button>' : '<button class="btn btn-primary" data-ag="retry">Try the range again</button><button class="btn btn-ghost" data-ag="leave">Leave</button>'}</div>`;
    void b.offsetWidth;
    b.classList.add('show');
    this.sfx.chord(passed);
    b.querySelector('[data-ag="done"]')?.addEventListener('click', () => this.close(true));
    b.querySelector('[data-ag="leave"]')?.addEventListener('click', () => this.close(true));
    b.querySelector('[data-ag="retry"]')?.addEventListener('click', () => {
      b.classList.remove('final');
      b.hidden = true;
      this.picks = [];
      this.ringScores = [];
      this.shots = 0;
      this.startRound(0);
    });
  }

  private syncHud() {
    const q = this.root.querySelector('.ag-quiver')!;
    q.innerHTML = Array.from({ length: ARROWS_PER_ROUND }, (_, i) => `<i class="${i < this.arrowsLeft ? 'on' : ''}"></i>`).join('');
    this.root.querySelector('.ag-correct')!.textContent = String(this.picks.filter((p) => p >= 0).length);
  }

  close(exit: boolean) {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    this.sfx.ctx?.close().catch(() => {});
    this.clearRound();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 350);
    if (exit) this.onExit();
  }

  // ---------------------------------------------------------------- simulation

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(raw);
  };

  /** One frame of game time (exposed in dev builds for automated tests). */
  step(raw: number) {
    this.timeScale += ((this.wantSlowmo() ? 0.28 : 1) - this.timeScale) * Math.min(1, raw * 8);
    const dt = raw * this.timeScale;
    this.time += dt;
    this.update(dt, raw);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
  }

  private wantSlowmo() {
    const a = this.followed;
    return !!a && a.flying && a.T - a.t < 0.32 && this.cam === 'follow';
  }

  private update(dt: number, raw: number) {
    const k = 420 * raw;
    if (this.keys.has('ArrowUp')) this.aimAt(this.aim.x, this.aim.y - k);
    if (this.keys.has('ArrowDown')) this.aimAt(this.aim.x, this.aim.y + k);
    if (this.keys.has('ArrowLeft')) this.aimAt(this.aim.x - k, this.aim.y);
    if (this.keys.has('ArrowRight')) this.aimAt(this.aim.x + k, this.aim.y);

    if (this.drawing) {
      this.power = Math.min(1, this.power + raw * 1.5);
      if (this.power >= FULL_DRAW) this.fullTime += raw;
      this.sfx.creak(this.power);
    }
    this.syncPower();

    const amp = this.swayAmp();
    const t = this.time;
    const windPush = this.wind * (this.drawing ? 26 + this.fullTime * 18 : 18);
    this.reticle.x = this.aim.x + (Math.sin(t * 1.9) * 0.7 + Math.sin(t * 3.7 + 1.3) * 0.3) * amp + windPush;
    this.reticle.y = this.aim.y + (Math.cos(t * 1.4 + 0.5) * 0.7 + Math.sin(t * 2.9) * 0.3) * amp + Math.abs(this.wind) * 4;

    // Bow: string pull and a gentle breathing bob
    const pull = this.drawing ? this.power * 0.26 : 0;
    const pos = this.bowString.geometry.attributes.position as THREE.BufferAttribute;
    pos.setZ(1, 0.02 + pull);
    pos.needsUpdate = true;
    this.nocked.position.z = 0.02 + pull;
    this.bow.position.y = -0.3 + Math.sin(this.time * 1.6) * 0.006 - pull * 0.05;
    this.bow.visible = this.cam === 'aim' || this.cam === 'return';

    // Targets: hover glow, hit wobble, and drifting targets in later rounds
    const hover = this.cam === 'aim' && !this.locked ? this.pick(this.reticle.x, this.reticle.y).target : undefined;
    for (const tg of this.targets) {
      const drift = this.round >= 3 ? Math.sin(this.time * 0.7 + tg.phase) * 1.3 : 0;
      tg.group.position.set(tg.base.x + drift, tg.base.y + (this.round >= 3 ? Math.sin(this.time * 1.3 + tg.phase) * 0.15 : 0), tg.base.z);
      const on = tg === hover ? 1 : 0;
      const before = tg.hover > 0.5;
      tg.hover += (on - tg.hover) * Math.min(1, raw * 12);
      if (before !== tg.hover > 0.5) {
        const { tex } = this.signTexture(tg.label, COLORS[tg.index % 3], tg.hover > 0.5);
        const mat = tg.sign.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
      }
      (tg.glow.material as THREE.MeshBasicMaterial).opacity = tg.hover * 0.9;
      ((tg.face.material as THREE.Material[])[1] as THREE.MeshStandardMaterial).emissiveIntensity = tg.hover * 0.18;
      tg.sign.scale.setScalar(1 + tg.hover * 0.1);
      tg.wobble *= Math.exp(-raw * 5);
      tg.face.rotation.x = Math.sin(this.time * 30) * tg.wobble * 0.08;
    }

    // Arrows
    for (const a of this.arrows) {
      if (!a.flying) continue;
      a.t += dt;
      const tt = Math.min(a.t, a.goal ? a.T : a.t);
      const p = a.start.clone().addScaledVector(a.vel, tt).addScaledVector(G, 0.5 * tt * tt);
      const v = a.vel.clone().addScaledVector(G, tt);
      // A drifting target: steer the last stretch onto the aimed spot so the + stays truthful.
      if (a.goal && a.local && a.t > a.T * 0.7) {
        const aimNow = a.goal.face.localToWorld(a.local.clone());
        const aimThen = a.start.clone().addScaledVector(a.vel, a.T).addScaledVector(G, 0.5 * a.T * a.T);
        p.add(aimNow.sub(aimThen).multiplyScalar((a.t - a.T * 0.7) / (a.T * 0.3)));
      }
      a.mesh.position.copy(p);
      a.mesh.lookAt(p.clone().sub(v));
      a.trailPts.push(p.clone());
      if (a.trailPts.length > 24) a.trailPts.shift();
      a.trail.geometry.setFromPoints(a.trailPts);
      if (a.goal && a.t >= a.T) this.hit(a);
      else if (!a.goal && p.y <= 0.02) this.miss(a, p);
      else if (a.t > 6) this.miss(a, p);
    }

    // Camera: shooting line → follow the arrow → impact view → back
    this.updateCamera(raw);

    // Wind: windsock, flags, pollen, birds
    // The sock points downwind (+x for a positive wind) and droops when the wind is light.
    const sock = this.windsock.getObjectByName('sock')!;
    const w = this.wind;
    sock.rotation.y = (w >= 0 ? 0 : Math.PI) + Math.sin(this.time * 3) * 0.06;
    sock.rotation.z = -(1 - Math.min(1, Math.abs(w) * 1.6)) * 0.9 + Math.sin(this.time * 7) * 0.03;
    for (const f of this.flags) {
      const arr = (f.mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = f.base[i];
        arr[i + 2] = f.base[i + 2] + Math.sin(this.time * 6 + x * 4 + f.phase) * 0.08 * x;
      }
      f.mesh.geometry.attributes.position.needsUpdate = true;
      f.mesh.rotation.y = w >= 0 ? 0 : Math.PI;
    }
    const pp = this.pollen.geometry.attributes.position as THREE.BufferAttribute;
    const pa = pp.array as Float32Array;
    for (let i = 0; i < pa.length; i += 3) {
      pa[i] += (w * 2.2 + Math.sin(this.time + i) * 0.2) * dt;
      pa[i + 1] += Math.sin(this.time * 0.8 + i * 0.37) * 0.12 * dt;
      if (pa[i] > 30) pa[i] = -30;
      if (pa[i] < -30) pa[i] = 30;
    }
    pp.needsUpdate = true;
    for (const b of this.birds) {
      b.g.position.x += b.speed * dt;
      if (b.g.position.x > 90) b.g.position.x = -90;
      b.g.position.y = b.y + Math.sin(this.time * 0.5 + b.phase) * 1.5;
      b.g.children[0].scale.y = 0.4 + Math.abs(Math.sin(this.time * 4 + b.phase)) * 1.2;
    }

    // Sparks and popups
    const sp = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const sa = sp.array as Float32Array;
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    this.sparks.forEach((s, i) => {
      s.v.y -= 6 * dt;
      s.p.addScaledVector(s.v, dt);
      if (i < 300) sa.set([s.p.x, s.p.y, s.p.z], i * 3);
    });
    for (let i = this.sparks.length; i < 300; i++) sa.set([0, -100, 0], i * 3);
    sp.needsUpdate = true;
    for (const p of this.popups) p.life -= raw * 0.7;
    this.popups = this.popups.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - raw * 3);
  }

  private updateCamera(raw: number) {
    const a = this.followed;
    let pos: THREE.Vector3, look: THREE.Vector3, ease: number;
    if (this.cam === 'follow' && a) {
      const dir = a.vel.clone().addScaledVector(G, a.t).normalize();
      pos = a.mesh.position.clone().addScaledVector(dir, -2.2).add(new THREE.Vector3(0.35, 0.35, 0));
      look = a.mesh.position.clone().addScaledVector(dir, 4);
      ease = this.camTimer < 0.25 ? 6 : 14;
      this.camTimer += raw;
    } else if (this.cam === 'impact' && a) {
      const at = this.impactAt;
      pos = at.clone().add(new THREE.Vector3(2.6 + Math.sin(this.camTimer * 0.6) * 0.4, 0.7, 3.2));
      look = at.clone();
      ease = 5;
      this.camTimer += raw;
      if (this.camTimer > 1.5) {
        this.cam = 'return';
        this.camTimer = 0;
      }
    } else {
      // Aim view: the camera leans slightly towards the reticle.
      const nx = this.reticle.x / Math.max(1, this.W) - 0.5;
      const ny = this.reticle.y / Math.max(1, this.H) - 0.5;
      pos = HOME.clone();
      look = LOOK.clone().add(new THREE.Vector3(nx * 3, -ny * 1.5, 0));
      ease = this.cam === 'return' ? 4 : 10;
      if (this.cam === 'return') {
        this.camTimer += raw;
        if (this.camTimer > 0.8) {
          this.cam = 'aim';
          this.followed = null;
          if (this.arrowsLeft > 0 && this.picks[this.round] === undefined) this.nocked.visible = true;
        }
      }
    }
    const k = 1 - Math.exp(-raw * ease);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.05, (Math.random() - 0.5) * this.shake * 0.05, 0));
    this.camera.lookAt(this.camLook);
  }

  private hit(a: Arrow) {
    const t = a.goal!;
    a.flying = false;
    // Stick the arrow into the face at the aimed spot, sunk a little into the straw.
    const local = a.local!.clone();
    local.z = 0.12;
    const at = t.face.localToWorld(local.clone());
    const dir = a.vel.clone().addScaledVector(G, a.T).normalize();
    a.mesh.position.copy(at).addScaledVector(dir, 0.18);
    a.mesh.lookAt(a.mesh.position.clone().sub(dir));
    this.impactAt.copy(at);
    t.face.attach(a.mesh);
    const rel = Math.hypot(local.x, local.y) / t.r;
    const ring = rel < 0.25 ? 10 : rel < 0.6 ? 7 : 5;
    this.ringScores.push(ring);
    t.wobble = 1;
    this.shake = ring === 10 ? 1.4 : 0.8;
    for (let i = 0; i < (ring === 10 ? 70 : 40); i++) {
      this.sparks.push({ p: at.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.2) * 4), life: 0.5 + Math.random() * 0.7 });
    }
    this.sfx.thunk(ring === 10);
    this.popups.push({ pos: at.clone().add(new THREE.Vector3(0, 0.6, 0)), text: ring === 10 ? 'BULLSEYE +10' : `+${ring}`, color: ring === 10 ? '#ffd27a' : '#ffffff', life: 1.6, big: ring === 10 });
    this.popups.push({ pos: at.clone().add(new THREE.Vector3(0, -1.2, 0)), text: `You chose "${t.label}"`, color: '#e8e0ff', life: 1.8, big: false });
    this.cam = 'impact';
    this.camTimer = 0;
    this.resolveRound(t.index);
  }

  private miss(a: Arrow, p: THREE.Vector3) {
    a.flying = false;
    a.mesh.position.set(p.x, Math.max(0.05, p.y), p.z);
    this.impactAt.copy(a.mesh.position);
    for (let i = 0; i < 18; i++) this.sparks.push({ p: a.mesh.position.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), life: 0.5 });
    this.sfx.thunk();
    this.popups.push({ pos: a.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), text: 'Miss', color: '#ffb4a3', life: 1.2, big: false });
    this.cam = 'impact';
    this.camTimer = 0.6;
    if (this.arrowsLeft <= 0) this.resolveRound(-1);
  }

  private syncPower() {
    const bar = this.root.querySelector<HTMLElement>('.ag-power i')!;
    bar.style.transform = `scaleX(${this.drawing ? this.power : 0})`;
    const status = this.root.querySelector<HTMLElement>('.ag-status')!;
    let text: string;
    let cls: string;
    if (this.locked || !this.canShoot()) {
      text = this.cam === 'follow' ? '🏹 Arrow cam…' : '…';
      cls = '';
    } else if (!this.drawing) {
      const over = this.targets.find((t) => t.hover > 0.5);
      text = over ? `Aiming at <b>${esc(over.label)}</b> · hold to draw` : 'Put the <b>+</b> on the right answer';
      cls = over ? 'aim' : '';
    } else if (this.power < FULL_DRAW) {
      text = 'Drawing… keep holding';
      cls = 'draw';
    } else if (this.fullTime <= STEADY_TIME) {
      text = 'Steady! Release now';
      cls = 'ok';
    } else {
      text = 'Arm is shaking! Release or it gets worse';
      cls = 'bad';
    }
    if (status.dataset.text !== text) {
      status.dataset.text = text;
      status.innerHTML = text;
      status.className = `ag-status ${cls}`;
    }
  }

  // ---------------------------------------------------------------- 2D overlay: reticle, popups, slow-mo

  private drawOverlay() {
    const g = this.o;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.timeScale < 0.8) {
      const v = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(20,10,40,${(0.8 - this.timeScale) * 0.9})`);
      g.fillStyle = v;
      g.fillRect(0, 0, this.W, this.H);
    }
    g.textAlign = 'center';
    for (const p of this.popups) {
      const s = p.pos.clone().project(this.camera);
      if (s.z > 1) continue;
      const x = (s.x * 0.5 + 0.5) * this.W, y = (-s.y * 0.5 + 0.5) * this.H - (1.6 - p.life) * 30;
      g.globalAlpha = Math.min(1, p.life);
      g.font = `800 ${p.big ? 32 : 20}px Manrope Variable, system-ui, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillText(p.text, x + 2, y + 2);
      g.fillStyle = p.color;
      g.fillText(p.text, x, y);
    }
    g.globalAlpha = 1;
    if (this.canShoot()) this.drawReticle();
  }

  private drawReticle() {
    const g = this.o;
    const { x, y } = this.reticle;
    const amp = this.swayAmp();
    const steady = this.steady();
    const tired = this.drawing && this.fullTime > STEADY_TIME;
    const col = steady ? '#5fd68a' : tired ? '#ff6b5a' : this.drawing ? '#ffd27a' : '#ffffff';
    g.save();
    g.strokeStyle = col;
    g.globalAlpha = 0.35;
    g.lineWidth = 1.5;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(this.aim.x + this.wind * (this.drawing ? 26 + this.fullTime * 18 : 18), this.aim.y, amp + 6, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    if (this.drawing) {
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.power / FULL_DRAW));
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x - 13, y);
    g.lineTo(x + 13, y);
    g.moveTo(x, y - 13);
    g.lineTo(x, y + 13);
    g.stroke();
    g.strokeStyle = col;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x - 12, y);
    g.lineTo(x - 4, y);
    g.moveTo(x + 4, y);
    g.lineTo(x + 12, y);
    g.moveTo(x, y - 12);
    g.lineTo(x, y - 4);
    g.moveTo(x, y + 4);
    g.lineTo(x, y + 12);
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
    if (this.drawing && this.power < FULL_DRAW) {
      const drop = (FULL_DRAW - this.power) * 120;
      g.globalAlpha = 0.6;
      g.strokeStyle = '#ffb4a3';
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + drop);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(x, y + drop, 5, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
}
