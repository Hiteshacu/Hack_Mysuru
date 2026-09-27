// Snake Debug: the opening game of the Debug Den, played inside the real 3D valley (Snake Meadow, a flat clearing
// by the path to the cabin), so it has the world's own terrain, swaying grass, trees, sky, light and post-effects.
// A bug report and the buggy code are shown; nine apples on tree stumps, bundled in the middle of the meadow,
// each name a kind of bug. The snake follows the cursor (slither.io style: the head chases the pointer with a
// turn-rate limit and the body follows its trail) and eats the apple that names the planted bug.
//   - wrong apple: it rots, the snake flashes and loses one of its 3 lives; three wrong apples and the snake is out,
//   - right apple: the snake slithers into the debug console, where it circles the lines that hold the bug.
// The answer is checked on the server (it never reaches the browser).

import * as THREE from 'three';
import gsap from 'gsap';
import type { Experience } from '../core/Experience';
import { SNAKE_MEADOW } from '../world/layout';
import { esc, play, type QuestPublic } from './api';

interface Apple {
  label: string;
  group: THREE.Group;
  body: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  sign: THREE.Sprite;
  pos: THREE.Vector3;
  eaten: boolean;
  phase: number;
}

const LIVES = 3;
const R = SNAKE_MEADOW.r - 1.2; // how far from the centre the snake may roam
const MAX_SPEED = 7;
const TURN = 7.5; // rad/s: tight enough to follow the cursor closely
const SPACING = 0.36;
const EAT = 0.95;

class Beeps {
  ctx: AudioContext | null = null;
  constructor() {
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }
  tone(freq: number, dur = 0.12, type: OscillatorType = 'triangle', vol = 0.08, slide = 0) {
    const c = this.ctx;
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  chomp() {
    this.tone(320, 0.08, 'square', 0.06, -150);
  }
  good() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2), i * 90));
  }
  bad() {
    this.tone(180, 0.35, 'sawtooth', 0.07, -110);
  }
  close() {
    this.ctx?.close().catch(() => {});
  }
}

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

export class SnakeGame {
  private root: HTMLDivElement;
  private group = new THREE.Group();
  private center: THREE.Vector3;
  private apples: Apple[] = [];
  private head!: THREE.Group;
  private segments: THREE.Mesh[] = [];
  private segMats: THREE.MeshStandardMaterial[] = [];
  private tongue!: THREE.Group;
  private marker!: THREE.Mesh;
  private pos = new THREE.Vector3();
  private heading = Math.PI;
  private trail: THREE.Vector3[] = [];
  private length = 16;
  private lives = LIVES;
  private moving = false;
  private busy = false;
  private solved = false;
  private flash = 0;
  private time = 0;
  private keys = new Set<string>();
  private target: THREE.Vector3 | null = null;
  private ray = new THREE.Raycaster();
  private beeps = new Beeps();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private diving = 0;
  private saved: { x: number; z: number; facing: number };

  constructor(
    host: HTMLElement,
    q: QuestPublic,
    private options: string[],
    private onSolved: (bugLines: number[]) => void,
    private onExit: () => void,
    private exp: Experience,
  ) {
    const d = q.debug;
    const code = d.buggyCode
      .split('\n')
      .map((l, i) => `<span class="sg-ln">${i + 1}</span>${esc(l) || ' '}`)
      .join('\n');
    this.root = document.createElement('div');
    this.root.className = 'snake-game in-world';
    this.root.innerHTML = `
      <div class="sg-hit"></div>
      <div class="sg-top">
        <div class="sg-q"><span class="sg-kicker">Stage 3 · Snake Debug · Snake Meadow</span><strong>What kind of bug is this? Eat the right apple.</strong></div>
        <div class="sg-lives" aria-label="Lives">${'<b>❤</b>'.repeat(LIVES)}</div>
        <button class="sg-exit" aria-label="Leave">✕</button>
      </div>
      <aside class="sg-brief">
        <p class="sg-kicker">🚨 Bug report · ${esc(d.title)}</p>
        <p>${esc(d.story)}</p>
        <p class="sg-kicker">The buggy code</p>
        <pre class="sg-code">${code}</pre>
        <p class="sg-kicker">How to play</p>
        <p class="sg-help">🖱 <b>Point</b> with the cursor: the snake slithers to where you point and waits there. Go around the other apples and touch the one that names the bug. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> also move it. A wrong apple costs a life ❤.</p>
      </aside>
      <div class="sg-status">Point at the apple that names the bug</div>
      <div class="sg-banner" hidden></div>`;
    host.appendChild(this.root);
    this.root.querySelector('.sg-exit')!.addEventListener('click', () => this.close(true));

    // Borrow the world: park the (hidden) player in the meadow so grass and trees stream around it.
    const p = exp.player.position;
    this.saved = { x: p.x, z: p.z, facing: exp.player.facing };
    this.center = new THREE.Vector3(SNAKE_MEADOW.x, exp.terrain.heightAt(SNAKE_MEADOW.x, SNAKE_MEADOW.z), SNAKE_MEADOW.z);
    exp.player.teleport(SNAKE_MEADOW.x, SNAKE_MEADOW.z + R + 3, Math.PI);
    exp.character.root.visible = false;
    this.group.position.copy(this.center);
    exp.scene.add(this.group);

    this.buildProps();
    this.buildSnake();
    this.placeApples();
    this.bind();
    this.camPos.copy(this.center).add(new THREE.Vector3(0, 14, 18));
    this.camLook.copy(this.center);
    exp.minigame = { update: (dt) => this.step(dt) };
    this.banner('Snake Debug', 'Point with the cursor · find the kind of bug · 3 lives', 1700);
    window.setTimeout(() => (this.moving = true), 1200);
    if (import.meta.env.DEV) (window as unknown as { __sg: SnakeGame }).__sg = this;
  }

  // ---------------------------------------------------------------- props in the meadow

  private buildProps() {
    // A ring of mossy stones marks the edge of the meadow
    const stone = new THREE.MeshStandardMaterial({ color: '#8d9187', roughness: 1, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + ((i * 37) % 10) / 30, 0), stone);
      m.position.set(Math.cos(a) * (R + 0.9), 0.12, Math.sin(a) * (R + 0.9));
      m.rotation.set(i, i * 2, 0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // Cursor marker: where the snake is heading
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  // ---------------------------------------------------------------- snake

  private buildSnake() {
    this.head = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: '#3fae4a', roughness: 0.4, metalness: 0.05, emissive: '#ff2a2a', emissiveIntensity: 0 });
    this.segMats.push(skin);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 16), skin);
    skull.scale.set(1, 0.72, 1.35);
    skull.castShadow = true;
    this.head.add(skull);
    const eyeW = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.3 });
    const eyeB = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), eyeW);
      eye.position.set(sx * 0.21, 0.18, 0.22);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeB);
      pupil.position.set(sx * 0.23, 0.2, 0.32);
      this.head.add(eye, pupil);
    }
    this.tongue = new THREE.Group();
    const tMat = new THREE.MeshStandardMaterial({ color: '#e0405a', roughness: 0.5 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.3), tMat);
    stem.position.z = 0.15;
    this.tongue.add(stem);
    for (const sx of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.11), tMat);
      fork.position.set(sx * 0.035, 0, 0.33);
      fork.rotation.y = sx * 0.5;
      this.tongue.add(fork);
    }
    this.tongue.position.set(0, -0.05, 0.47);
    this.head.add(this.tongue);
    this.group.add(this.head);
    for (let i = 0; i < 70; i++) {
      const stripe = i % 3 === 1;
      const m = new THREE.MeshStandardMaterial({ color: stripe ? '#f2c230' : '#3fae4a', roughness: 0.4, emissive: '#ff2a2a', emissiveIntensity: 0 });
      this.segMats.push(m);
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), m);
      seg.castShadow = true;
      seg.visible = false;
      this.group.add(seg);
      this.segments.push(seg);
    }
    this.resetTrail();
  }

  private resetTrail() {
    this.pos.set(0, 0.5, R - 1);
    this.heading = Math.PI;
    this.target = null;
    this.trail = [];
    for (let i = 0; i < 90; i++) this.trail.push(new THREE.Vector3(0, 0.5, R - 1 + i * 0.1));
  }

  // ---------------------------------------------------------------- apples on stumps

  private labelTexture(text: string, state: 'idle' | 'bad' | 'good' | 'aim') {
    return canvasTexture(512, 128, (g) => {
      g.fillStyle = state === 'bad' ? '#4a2020' : state === 'good' ? '#1f4a2a' : state === 'aim' ? '#3d2757' : '#2a1a3c';
      g.beginPath();
      g.roundRect(6, 6, 500, 116, 40);
      g.fill();
      g.strokeStyle = state === 'bad' ? '#ff6b5a' : state === 'good' ? '#5fd68a' : state === 'aim' ? '#ffffff' : '#ffd27a';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = '#fff4dc';
      g.font = '800 50px Manrope Variable, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    });
  }

  private placeApples() {
    for (const a of this.apples) {
      this.group.remove(a.group);
      a.sign.material.map?.dispose();
    }
    this.apples = [];
    const bark = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 1 });
    const rings = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      map: canvasTexture(256, 256, (g) => {
        g.fillStyle = '#c99d62';
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(110,70,30,0.45)';
        g.lineWidth = 3;
        for (let r = 12; r < 128; r += 14) {
          g.beginPath();
          g.arc(128, 128, r, 0, Math.PI * 2);
          g.stroke();
        }
      }),
    });
    const labels = [...this.options].sort(() => Math.random() - 0.5);
    labels.forEach((label, i) => {
      const gx = (i % 3) - 1, gz = Math.floor(i / 3) - 1;
      const pos = new THREE.Vector3(gx * 3.6, 0, gz * 3.6 - 1);
      const group = new THREE.Group();
      group.position.copy(pos);
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.55, 18), [bark, rings, bark]);
      stump.position.y = 0.27;
      stump.castShadow = stump.receiveShadow = true;
      group.add(stump);
      const mat = new THREE.MeshStandardMaterial({ color: '#d8342c', roughness: 0.25, metalness: 0.05, emissive: '#000000' });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), mat);
      body.scale.set(1, 0.92, 1);
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.24, 6), new THREE.MeshStandardMaterial({ color: '#5b3b26' }));
      stem.position.set(0.02, 1.5, 0);
      stem.rotation.z = -0.25;
      group.add(stem);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6), new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: 0.6 }));
      leaf.scale.set(1.3, 0.25, 0.6);
      leaf.position.set(0.15, 1.55, 0);
      leaf.rotation.z = 0.5;
      group.add(leaf);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTexture(label, 'idle'), depthTest: false }));
      sign.scale.set(2.3, 0.575, 1);
      sign.position.y = 2.2;
      sign.renderOrder = 10;
      group.add(sign);
      this.group.add(group);
      this.apples.push({ label, group, body, mat, sign, pos, eaten: false, phase: i * 0.9 });
    });
  }

  // ---------------------------------------------------------------- input

  private bind() {
    const hit = this.root.querySelector<HTMLElement>('.sg-hit')!;
    const aim = (e: PointerEvent) => {
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.ray.setFromCamera(ndc, this.exp.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.center.y + 0.3));
      const at = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(plane, at)) return;
      at.sub(this.center);
      at.y = 0;
      if (at.length() > R) at.setLength(R);
      this.target = at;
    };
    hit.addEventListener('pointermove', aim);
    hit.addEventListener('pointerdown', aim);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
  }

  private keydown = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') return this.close(true);
    this.keys.add(e.code);
  };

  private keyup = (e: KeyboardEvent) => {
    e.stopPropagation();
    this.keys.delete(e.code);
  };

  // ---------------------------------------------------------------- game

  private banner(title: string, sub: string, ms = 0, actions = '') {
    const b = this.root.querySelector<HTMLElement>('.sg-banner')!;
    b.innerHTML = `<small>${esc(title)}</small><strong>${sub}</strong>${actions}`;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    if (ms) window.setTimeout(() => (b.hidden = true), ms);
    return b;
  }

  private status(text: string, cls = '') {
    const s = this.root.querySelector<HTMLElement>('.sg-status')!;
    if (s.dataset.text === text + cls) return;
    s.dataset.text = text + cls;
    s.innerHTML = text;
    s.className = `sg-status ${cls}`;
  }

  private syncLives() {
    this.root.querySelectorAll<HTMLElement>('.sg-lives b').forEach((h, i) => h.classList.toggle('lost', i >= this.lives));
  }

  private async eat(apple: Apple) {
    this.busy = true;
    apple.eaten = true;
    this.beeps.chomp();
    gsap.to(apple.body.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 0.25 });
    let r: { correct: boolean; bugType?: string; bugLines?: number[] };
    try {
      r = await play('snake', { pick: apple.label });
    } catch (err) {
      apple.eaten = false;
      gsap.to(apple.body.scale, { x: 1, y: 0.92, z: 1, duration: 0.3 });
      this.status(esc((err as Error).message), 'bad');
      this.busy = false;
      return;
    }
    if (r.correct) {
      this.solved = true;
      this.moving = false;
      this.target = null;
      apple.sign.material.map = this.labelTexture(apple.label, 'good');
      apple.mat.color.set('#ffd27a');
      apple.mat.emissive.set('#ffb000');
      gsap.to(apple.body.scale, { x: 1.4, y: 1.3, z: 1.4, duration: 0.4, ease: 'back.out(3)' });
      this.length += 8;
      this.beeps.good();
      this.status(`✔ Right apple: it's <b>${esc(apple.label)}</b>. Into the debug console!`, 'ok');
      this.banner('Correct!', `It's a${/^[aeiou]/i.test(apple.label) ? 'n' : ''} ${esc(apple.label)} bug`);
      this.diving = 0.0001;
      window.setTimeout(() => {
        this.close(false);
        this.onSolved(r.bugLines || []);
      }, 2300);
      return;
    }
    this.lives--;
    this.syncLives();
    this.flash = 1;
    this.beeps.bad();
    apple.sign.material.map = this.labelTexture(apple.label, 'bad');
    apple.mat.color.set('#5b4630');
    gsap.to(apple.body.scale, { x: 0.7, y: 0.4, z: 0.7, duration: 0.4 });
    gsap.fromTo(this.root.querySelector('.sg-lives'), { scale: 1.5 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    this.length = Math.max(10, this.length - 4);
    if (this.lives <= 0) {
      this.moving = false;
      this.status('The snake is out of lives', 'bad');
      const b = this.banner('The snake is out!', 'Three wrong apples. Read the bug report again, then retry.', 0, '<div class="sg-actions"><button class="btn btn-primary" data-sg="retry">Play again</button><button class="btn btn-ghost" data-sg="leave">Leave</button></div>');
      b.querySelector('[data-sg="retry"]')!.addEventListener('click', () => this.restart());
      b.querySelector('[data-sg="leave"]')!.addEventListener('click', () => this.close(true));
    } else {
      this.status(`✖ Not <b>${esc(apple.label)}</b>. ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`, 'bad');
      // Back off from the rotten apple so the next move is a fresh choice.
      const away = this.pos.clone().sub(apple.pos).setY(0).normalize().multiplyScalar(1.6);
      this.target = this.pos.clone().add(away).setY(0);
    }
    window.setTimeout(() => (this.busy = false), 350);
  }

  private restart() {
    this.root.querySelector<HTMLElement>('.sg-banner')!.hidden = true;
    this.lives = LIVES;
    this.length = 16;
    this.syncLives();
    this.placeApples();
    this.resetTrail();
    this.status('New round: the apples were reshuffled');
    this.banner('Round again', 'Find the kind of bug', 1400);
    window.setTimeout(() => (this.moving = true), 1000);
  }

  close(exit: boolean) {
    this.exp.minigame = null;
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    this.beeps.close();
    this.exp.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    // Put the player back where they were.
    this.exp.player.teleport(this.saved.x, this.saved.z, this.saved.facing);
    this.exp.character.root.visible = true;
    this.exp.rig.snap(this.exp.player.position, this.saved.facing + Math.PI);
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 350);
    if (exit) this.onExit();
  }

  /** One frame, called by the world's own loop while the game runs. */
  step(dt: number) {
    this.time += dt;
    if (this.moving && !this.busy && !this.solved) this.move(dt);
    this.updateBody();
    this.updateApples(dt);
    this.updateCamera(dt);
  }

  private move(dt: number) {
    // Keyboard: move in camera space (W = away from the camera).
    const kx = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const kz = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    if (kx || kz) this.target = this.pos.clone().add(new THREE.Vector3(kx, 0, kz).normalize().multiplyScalar(2.5)).setY(0);
    const t = this.target;
    let speed = 0;
    if (t) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        const want = Math.atan2(dx, dz);
        let diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
        const maxTurn = TURN * dt;
        diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
        this.heading += diff;
        // Slow down for sharp turns and when arriving, so the snake stops right at the cursor.
        const facing = Math.cos(Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)));
        speed = Math.min(MAX_SPEED, 0.8 + dist * 2.4) * (0.35 + 0.65 * Math.max(0, facing));
      }
    }
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > R) {
      this.pos.x *= R / r;
      this.pos.z *= R / r;
    }
    this.pos.y = 0.5;
    if (this.trail[0].distanceTo(this.pos) > 0.07) {
      this.trail.unshift(this.pos.clone());
      if (this.trail.length > 700) this.trail.pop();
    }
    // Cursor marker
    this.marker.visible = !!t && !this.solved;
    if (t) {
      this.marker.position.set(t.x, 0.06, t.z);
      this.marker.scale.setScalar(1 + Math.sin(this.time * 5) * 0.12);
    }
    // Eat?
    for (const a of this.apples) {
      if (a.eaten) continue;
      if (Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < EAT) {
        this.eat(a);
        return;
      }
    }
    // Which apple is the cursor on?
    let aimed: Apple | undefined;
    if (t) aimed = this.apples.find((a) => !a.eaten && Math.hypot(a.pos.x - t.x, a.pos.z - t.z) < 1.1);
    for (const a of this.apples) {
      if (a.eaten) continue;
      const want = a === aimed ? 'aim' : 'idle';
      if (a.sign.userData.state !== want) {
        a.sign.userData.state = want;
        a.sign.material.map?.dispose();
        a.sign.material.map = this.labelTexture(a.label, want);
      }
    }
    if (aimed) this.status(`Going for <b>${esc(aimed.label)}</b>…`);
    else if (!this.busy) this.status(speed > 0.5 ? 'Slithering…' : 'Point at the apple that names the bug');
  }

  private updateBody() {
    this.head.position.copy(this.pos);
    this.head.position.y = 0.5 + Math.sin(this.time * 8) * 0.03;
    this.head.rotation.y = this.heading;
    this.tongue.scale.z = 0.4 + Math.max(0, Math.sin(this.time * 9)) * 0.9;
    let idx = 0;
    let acc = 0;
    let prev = this.pos.clone();
    const count = Math.min(this.segments.length, this.length);
    for (let s = 0; s < this.segments.length; s++) {
      const seg = this.segments[s];
      if (s >= count) {
        seg.visible = false;
        continue;
      }
      const target = SPACING * (s + 1);
      while (idx < this.trail.length - 1 && acc + prev.distanceTo(this.trail[idx]) < target) {
        acc += prev.distanceTo(this.trail[idx]);
        prev = this.trail[idx];
        idx++;
      }
      const p = this.trail[Math.min(idx, this.trail.length - 1)];
      seg.visible = true;
      const scale = 1.05 - (s / count) * 0.65;
      seg.scale.setScalar(scale);
      seg.position.set(p.x, 0.36 * scale + 0.08 + Math.sin(this.time * 8 - s * 0.6) * 0.02, p.z);
    }
    this.flash = Math.max(0, this.flash - 0.02);
    const pulse = this.flash > 0 ? Math.abs(Math.sin(this.time * 30)) * this.flash : 0;
    for (const m of this.segMats) m.emissiveIntensity = pulse * 1.4;
  }

  private updateApples(dt: number) {
    for (const a of this.apples) {
      if (a.eaten) continue;
      a.body.position.y = 1.0 + Math.sin(this.time * 2 + a.phase) * 0.06;
      a.body.rotation.y += dt * 0.6;
      const near = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 2.2;
      a.mat.emissive.set(near ? '#552200' : '#000000');
    }
  }

  private updateCamera(dt: number) {
    const cam = this.exp.camera;
    let pos: THREE.Vector3, look: THREE.Vector3, ease = 3;
    const head = this.center.clone().add(this.pos);
    if (this.diving > 0) {
      this.diving += dt;
      const a = this.diving * 2.4;
      const r = Math.max(0.9, 6 - this.diving * 3);
      pos = head.clone().add(new THREE.Vector3(Math.sin(a) * r, Math.max(1, 6 - this.diving * 3), Math.cos(a) * r));
      look = head.clone();
      ease = 5;
    } else {
      // A steady high view of the whole meadow that drifts gently towards the snake, with the forest behind.
      pos = this.center.clone().add(new THREE.Vector3(this.pos.x * 0.35, 10.5, 15 + this.pos.z * 0.3));
      look = this.center.clone().add(new THREE.Vector3(this.pos.x * 0.4, 0.5, this.pos.z * 0.35 - 1.5));
    }
    const k = 1 - Math.exp(-dt * ease);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }
}
