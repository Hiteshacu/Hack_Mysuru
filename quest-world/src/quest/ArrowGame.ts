// Arrow Range: a skill-based archery game. Each round asks a question and paints the three answers
// on targets; the player shoots the right one.
//
// Aiming is "what you see is where it lands": the + reticle is the landing point, and the launch velocity is
// solved so the arc passes exactly through it (choosing a lob that clears the other targets).
// The skill is in steadiness and timing, like real archery:
//   - hold to draw: the reticle sway shrinks as the bow reaches full draw,
//   - hold too long at full draw and the arm tires, so the sway grows again,
//   - release under-drawn and the arrow drops short,
//   - wind pushes the reticle sideways; keep the + on the board to compensate.
// Controls: mouse / touch / arrow keys move the reticle; hold click or Space to draw; release to shoot.

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
  x: number;
  baseY: number;
  y: number;
  r: number;
  label: string;
  index: number;
  bob: number;
  hitFlash: number;
  hover: number;
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  trail: { x: number; y: number }[];
  flying: boolean;
  /** The landing point the shot was solved for. */
  aimX: number;
  aimY: number;
  goal?: Target;
  stuckTo?: Target;
  offX?: number;
  offY?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Shot {
  vx: number;
  vy: number;
  time: number;
  /** The target the shot was aimed at (an aimed arrow can only stick in that target). */
  goal?: Target;
}

const COLORS = ['#f2b35c', '#7fd6c2', '#e39bd0'];
const ARROWS_PER_ROUND = 2;
/** Seconds of full draw before the arm starts to shake. */
const STEADY_TIME = 1.6;
/** Below this draw the arrow drops short. */
const FULL_DRAW = 0.85;

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

export class ArrowGame {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private groundY = 0;
  private bow = { x: 0, y: 0 };
  /** Where the player is pointing (mouse / finger / keys). */
  private aim = { x: 0, y: 0 };
  /** Where the arrow will land right now: aim + sway + wind. This is the + drawn on screen. */
  private reticle = { x: 0, y: 0 };
  private touchLift = 0;
  private angle = -0.55;
  private power = 0;
  private fullTime = 0;
  private drawing = false;
  private round = 0;
  private arrowsLeft = ARROWS_PER_ROUND;
  private arrows: Arrow[] = [];
  private targets: Target[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private wind = 0;
  private picks: number[] = [];
  private ringScores: number[] = [];
  private shots = 0;
  private shake = 0;
  private slowmo = 1;
  private time = 0;
  private last = 0;
  private raf = 0;
  private locked = false;
  private clouds: { x: number; y: number; s: number; v: number }[] = [];
  private fireflies: { x: number; y: number; p: number }[] = [];
  private sfx = new Sfx();
  private keys = new Set<string>();

  constructor(
    host: HTMLElement,
    private rounds: ArrowRound[],
    private onFinish: (r: ArrowResult) => void,
    private onExit: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'arrow-game';
    this.root.innerHTML = `
      <canvas></canvas>
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
        <span class="ag-hint">Move to aim · hold <kbd>click</kbd> / <kbd>Space</kbd> to draw · release in the <b class="ok">green</b> to shoot · <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> also aim</span>
      </div>
      <div class="ag-banner" hidden></div>`;
    host.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.root.querySelector('.ag-exit')!.addEventListener('click', () => this.close(true));
    this.bind();
    this.resize();
    this.aim = { x: this.W * 0.6, y: this.groundY - this.H * 0.25 };
    this.reticle = { ...this.aim };
    for (let i = 0; i < 6; i++) this.clouds.push({ x: Math.random() * this.W, y: 40 + Math.random() * this.H * 0.3, s: 0.6 + Math.random() * 0.9, v: 6 + Math.random() * 14 });
    for (let i = 0; i < 28; i++) this.fireflies.push({ x: Math.random() * this.W, y: this.groundY - Math.random() * this.H * 0.35, p: Math.random() * 6 });
    this.startRound(0);
    if (import.meta.env.DEV) (window as unknown as { __ag: ArrowGame }).__ag = this;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- setup

  private resize = () => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.groundY = this.H * 0.8;
    this.bow = { x: Math.max(110, this.W * 0.11), y: this.groundY - 70 };
    this.bg = null;
    if (this.targets.length) this.layoutTargets();
  };

  private bind() {
    window.addEventListener('resize', this.resize);
    const point = (e: PointerEvent) => {
      // On touch the reticle floats above the finger so the finger doesn't hide it.
      this.touchLift = e.pointerType === 'touch' ? 70 : 0;
      this.aimAt(e.clientX, e.clientY - this.touchLift);
    };
    this.canvas.addEventListener('pointermove', point);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      point(e);
      this.startDraw();
    });
    this.canvas.addEventListener('pointerup', () => this.release());
    this.canvas.addEventListener('pointercancel', () => {
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
    this.aim.x = Math.max(this.bow.x + 120, Math.min(this.W - 20, x));
    this.aim.y = Math.max(90, Math.min(this.groundY - 10, y));
  }

  private startDraw() {
    if (this.locked || this.arrowsLeft <= 0 || this.arrows.some((a) => a.flying)) return;
    if (this.sfx.ctx?.state === 'suspended') this.sfx.ctx.resume();
    this.drawing = true;
    this.power = 0;
    this.fullTime = 0;
  }

  /** How far the reticle wanders right now, in pixels. */
  private swayAmp() {
    if (!this.drawing) return 14;
    const settle = 14 - Math.min(1, this.power / FULL_DRAW) * 11.5;
    const tired = Math.max(0, this.fullTime - STEADY_TIME) * 26;
    return Math.min(46, settle + tired);
  }

  /** Steady = full draw and not yet tired: the moment to release. */
  private steady() {
    return this.drawing && this.power >= FULL_DRAW && this.fullTime <= STEADY_TIME;
  }

  /** Where the arrow lands if released now: the reticle, dropped short when under-drawn. */
  private landingPoint() {
    const drop = Math.max(0, FULL_DRAW - this.power) * this.H * 0.55;
    return { x: this.reticle.x - drop * 0.35, y: Math.min(this.groundY + 20, this.reticle.y + drop) };
  }

  private release() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.power < 0.15) {
      this.power = 0;
      return;
    }
    const p = this.landingPoint();
    const shot = this.solve(p.x, p.y);
    this.arrows.push({
      x: this.bow.x,
      y: this.bow.y,
      vx: shot.vx,
      vy: shot.vy,
      angle: Math.atan2(shot.vy, shot.vx),
      trail: [],
      flying: true,
      aimX: p.x,
      aimY: p.y,
      goal: shot.goal,
    });
    this.arrowsLeft--;
    this.shots++;
    this.power = 0;
    this.fullTime = 0;
    this.sfx.twang();
    this.syncHud();
  }

  private gravity() {
    return this.H * 1.25;
  }

  /** The target whose face contains the point, if any. */
  private targetAt(x: number, y: number) {
    return this.targets.find((t) => Math.hypot(x - t.x, y - t.y) < t.r);
  }

  /**
   * Launch velocity that makes the arrow pass exactly through (px, py). Flight time is chosen close to a natural
   * value for the distance, but the arc must not clip any other target on the way (it lobs over them instead).
   */
  private solve(px: number, py: number): Shot {
    const g = this.gravity();
    const dx = px - this.bow.x, dy = py - this.bow.y;
    const preferred = 0.5 + (Math.abs(dx) / this.W) * 0.75;
    const goal = this.targetAt(px, py);
    const make = (T: number): Shot => ({ vx: dx / T, vy: dy / T - 0.5 * g * T, time: T });
    const clear = (s: Shot, signs: boolean) => {
      for (let i = 1; i < 60; i++) {
        const t = (s.time * i) / 60;
        const x = this.bow.x + s.vx * t, y = this.bow.y + s.vy * t + 0.5 * g * t * t;
        if (y > this.groundY) return false;
        for (const tg of this.targets) {
          if (tg === goal) continue;
          if (Math.hypot(x - tg.x, y - tg.y) < tg.r + 8) return false;
          // the answer sign above each target, when we can avoid it
          if (signs && Math.abs(x - tg.x) < tg.r && y > tg.y - tg.r - 50 && y < tg.y - tg.r) return false;
        }
      }
      return true;
    };
    // Best arc: clears every other target and sign; then one that only clears the other target faces.
    for (const signs of [true, false]) {
      let best: Shot | null = null;
      for (let T = 0.4; T <= 2.4; T += 0.05) {
        const s = make(T);
        if (clear(s, signs) && (!best || Math.abs(T - preferred) < Math.abs(best.time - preferred))) best = s;
      }
      if (best) return { ...best, goal };
    }
    // Packed layout on a small screen: the aimed target is further down the range, so fly past the others.
    return { ...make(preferred), goal };
  }

  // ---------------------------------------------------------------- rounds

  private startRound(i: number) {
    this.round = i;
    this.arrowsLeft = ARROWS_PER_ROUND;
    this.arrows = [];
    // Wind grows each round: -1..1, pushes the reticle sideways (and a little down).
    this.wind = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25) * (0.5 + i * 0.25);
    const r = this.rounds[i];
    this.targets = r.choices.map((label, index) => ({ x: 0, baseY: 0, y: 0, r: 0, label, index, bob: Math.random() * 6, hitFlash: 0, hover: 0 }));
    // Shuffle target positions so the answer order on screen isn't always the same.
    this.targets.sort(() => Math.random() - 0.5);
    this.layoutTargets();
    this.root.querySelector('.ag-rn')!.textContent = String(i + 1);
    this.root.querySelector('.ag-prompt')!.innerHTML = esc(r.prompt);
    this.syncHud();
    this.banner(`Round ${i + 1}`, r.prompt);
  }

  private layoutTargets() {
    const xs = [0.5, 0.68, 0.86];
    const hs = [0.2, 0.36, 0.27];
    const r = Math.max(40, Math.min(this.W, this.H) * 0.068);
    this.targets.forEach((t, i) => {
      t.x = this.W * xs[i];
      t.baseY = this.groundY - this.H * hs[(i + this.round) % 3];
      t.y = t.baseY;
      t.r = r;
    });
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
    // A second arrow landing after the round is decided must not skip the next round.
    if (this.picks[this.round] !== undefined) return;
    this.picks[this.round] = pick;
    this.syncHud();
    this.locked = true;
    window.setTimeout(() => {
      if (this.round + 1 < this.rounds.length) this.startRound(this.round + 1);
      else this.finish();
    }, 1400);
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
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 350);
    if (exit) this.onExit();
  }

  // ---------------------------------------------------------------- simulation

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // Slow motion when an arrow is about to reach a target.
    const near = this.arrows.some((a) => a.flying && this.targets.some((t) => Math.hypot(a.x - t.x, a.y - t.y) < t.r * 3));
    this.slowmo += ((near ? 0.3 : 1) - this.slowmo) * Math.min(1, raw * 10);
    const dt = raw * this.slowmo;
    this.time += dt;
    this.update(dt, raw);
    this.render();
  };

  private update(dt: number, raw: number) {
    // Keyboard aiming
    const k = 420 * raw;
    if (this.keys.has('ArrowUp')) this.aimAt(this.aim.x, this.aim.y - k);
    if (this.keys.has('ArrowDown')) this.aimAt(this.aim.x, this.aim.y + k);
    if (this.keys.has('ArrowLeft')) this.aimAt(this.aim.x - k, this.aim.y);
    if (this.keys.has('ArrowRight')) this.aimAt(this.aim.x + k, this.aim.y);

    // Drawing the bow
    if (this.drawing) {
      this.power = Math.min(1, this.power + raw * 1.5);
      if (this.power >= FULL_DRAW) this.fullTime += raw;
      this.sfx.creak(this.power);
    }
    this.syncPower();

    // Reticle = aim + breathing sway + wind push (what you see is where the arrow goes)
    const amp = this.swayAmp();
    const t = this.time;
    const windPush = this.wind * (this.drawing ? 26 + this.fullTime * 18 : 18);
    this.reticle.x = this.aim.x + (Math.sin(t * 1.9) * 0.7 + Math.sin(t * 3.7 + 1.3) * 0.3) * amp + windPush;
    this.reticle.y = this.aim.y + (Math.cos(t * 1.4 + 0.5) * 0.7 + Math.sin(t * 2.9) * 0.3) * amp + Math.abs(this.wind) * 4;

    // Bow points along the launch direction for the current landing point.
    if (!this.locked) {
      const p = this.landingPoint();
      const s = this.solve(p.x, p.y);
      this.angle = Math.atan2(s.vy, s.vx);
    }

    // Later rounds: targets drift up and down.
    for (const tg of this.targets) {
      tg.y = tg.baseY + (this.round >= 3 ? Math.sin(this.time * 1.2 + tg.bob) * this.H * 0.04 : 0);
      tg.hitFlash = Math.max(0, tg.hitFlash - dt * 2);
      const on = Math.hypot(this.reticle.x - tg.x, this.reticle.y - tg.y) < tg.r;
      tg.hover += ((on ? 1 : 0) - tg.hover) * Math.min(1, raw * 12);
    }

    const g = this.gravity();
    for (const a of this.arrows) {
      if (a.stuckTo) {
        a.x = a.stuckTo.x + a.offX!;
        a.y = a.stuckTo.y + a.offY!;
        continue;
      }
      if (!a.flying) continue;
      // Small sub-steps so a slow frame can't carry the arrow straight through a target.
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let s = 0; s < steps && a.flying; s++) {
        a.vy += g * h;
        a.x += a.vx * h;
        a.y += a.vy * h;
        a.angle = Math.atan2(a.vy, a.vx);
        for (const tg of this.targets) {
          if (a.goal && tg !== a.goal) continue;
          const d = Math.hypot(a.x - tg.x, a.y - tg.y);
          if (d < tg.r) {
            // Aimed at this target: the arrow lands exactly on the + (it is on this same arc a moment later).
            if (Math.hypot(a.aimX - tg.x, a.aimY - tg.y) < tg.r) {
              a.x = a.aimX;
              a.y = a.aimY;
            }
            this.hit(a, tg, Math.hypot(a.x - tg.x, a.y - tg.y) / tg.r, a.x, a.y);
            break;
          }
        }
        if (a.y > this.groundY + 6) break;
      }
      a.trail.push({ x: a.x, y: a.y });
      if (a.trail.length > 26) a.trail.shift();
      if (a.flying && (a.y > this.groundY + 6 || a.x > this.W + 60 || a.x < -60)) {
        a.flying = false;
        if (a.y > this.groundY) {
          a.y = this.groundY + 4;
          this.burst(a.x, this.groundY, '#8b6b43', 14);
          this.sfx.thunk();
        }
        this.popups.push({ x: Math.min(this.W - 80, Math.max(80, a.x)), y: this.groundY - 30, text: 'Miss', color: '#ffb4a3', life: 1 });
        if (this.arrowsLeft <= 0) this.resolveRound(-1);
      }
    }

    for (const p of this.particles) {
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) {
      p.y -= 40 * dt;
      p.life -= dt * 0.8;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - raw * 30);
    for (const c of this.clouds) {
      c.x += c.v * raw;
      if (c.x > this.W + 200) c.x = -200;
    }
  }

  private syncPower() {
    const bar = this.root.querySelector<HTMLElement>('.ag-power i')!;
    bar.style.transform = `scaleX(${this.drawing ? this.power : 0})`;
    const status = this.root.querySelector<HTMLElement>('.ag-status')!;
    let text: string;
    let cls: string;
    if (this.locked || this.arrows.some((a) => a.flying)) {
      text = '…';
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

  private hit(a: Arrow, t: Target, rel: number, x: number, y: number) {
    a.flying = false;
    a.stuckTo = t;
    a.offX = a.x - t.x;
    a.offY = a.y - t.y;
    const ring = rel < 0.25 ? 10 : rel < 0.6 ? 7 : 5;
    this.ringScores.push(ring);
    t.hitFlash = 1;
    this.shake = ring === 10 ? 14 : 8;
    this.burst(x, y, COLORS[t.index % 3], ring === 10 ? 42 : 24);
    this.sfx.thunk(ring === 10);
    this.popups.push({ x: t.x, y: t.y - t.r - 60, text: ring === 10 ? 'BULLSEYE +10' : `+${ring}`, color: ring === 10 ? '#ffd27a' : '#ffffff', life: 1.4 });
    this.popups.push({ x: t.x, y: t.y + t.r + 50, text: `You chose "${t.label}"`, color: '#e8e0ff', life: 1.6 });
    this.resolveRound(t.index);
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 320;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.5 + Math.random() * 0.6, max: 1.1, color, size: 2 + Math.random() * 3 });
    }
  }

  // ---------------------------------------------------------------- rendering

  private background() {
    const c = document.createElement('canvas');
    c.width = this.W * this.dpr;
    c.height = this.H * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const sky = g.createLinearGradient(0, 0, 0, this.groundY);
    sky.addColorStop(0, '#1a1033');
    sky.addColorStop(0.45, '#4b2a6b');
    sky.addColorStop(0.8, '#d9784a');
    sky.addColorStop(1, '#f2b35c');
    g.fillStyle = sky;
    g.fillRect(0, 0, this.W, this.groundY);
    // Sun
    const sun = g.createRadialGradient(this.W * 0.72, this.groundY - this.H * 0.12, 0, this.W * 0.72, this.groundY - this.H * 0.12, this.H * 0.25);
    sun.addColorStop(0, 'rgba(255,230,160,0.95)');
    sun.addColorStop(0.25, 'rgba(255,190,110,0.55)');
    sun.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, this.W, this.groundY);
    // Stars
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 90; i++) g.fillRect((i * 97.3) % this.W, (i * 53.7) % (this.groundY * 0.4), 1.4, 1.4);
    // Far hills
    const hill = (color: string, base: number, amp: number, freq: number, phase: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, this.groundY);
      for (let x = 0; x <= this.W; x += 8) g.lineTo(x, base - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.3 + phase) * amp * 0.35);
      g.lineTo(this.W, this.groundY);
      g.fill();
    };
    hill('#3b2350', this.groundY - this.H * 0.16, this.H * 0.05, 0.004, 1);
    // Palace silhouette on the far hill
    this.palace(g, this.W * 0.34, this.groundY - this.H * 0.17, this.H * 0.0022);
    hill('#2a1a3c', this.groundY - this.H * 0.08, this.H * 0.035, 0.007, 3);
    // Ground
    const ground = g.createLinearGradient(0, this.groundY, 0, this.H);
    ground.addColorStop(0, '#2f4a2c');
    ground.addColorStop(1, '#16241a');
    g.fillStyle = ground;
    g.fillRect(0, this.groundY, this.W, this.H - this.groundY);
    g.fillStyle = 'rgba(160,210,120,0.18)';
    for (let x = 0; x < this.W; x += 6) g.fillRect(x, this.groundY - 3 - ((x * 13) % 7), 2, 5 + ((x * 7) % 6));
    return c;
  }

  /** A small Mysuru Palace silhouette with lit windows. k scales it with the screen. */
  private palace(g: CanvasRenderingContext2D, cx: number, base: number, k: number) {
    const s = k * 450;
    g.fillStyle = '#231432';
    const dome = (x: number, w: number, h: number, y: number) => {
      g.beginPath();
      g.ellipse(x, y, w * s, h * s, 0, Math.PI, 0);
      g.fill();
      g.fillRect(x - 1.5 * s, y - h * s - 14 * s, 3 * s, 14 * s);
    };
    g.fillRect(cx - 110 * s, base - 42 * s, 220 * s, 42 * s);
    g.fillRect(cx - 34 * s, base - 78 * s, 68 * s, 40 * s);
    dome(cx, 30, 34, base - 78 * s);
    dome(cx - 90 * s, 16, 18, base - 42 * s);
    dome(cx + 90 * s, 16, 18, base - 42 * s);
    g.fillStyle = 'rgba(255,210,120,0.55)';
    for (let i = -9; i <= 9; i++) g.fillRect(cx + i * 11 * s, base - 30 * s, 3 * s, 5 * s);
  }

  private render() {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.bg) this.bg = this.background();
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    g.save();
    g.translate(sx, sy);
    g.drawImage(this.bg, 0, 0, this.W, this.H);

    // Clouds
    for (const c of this.clouds) {
      g.fillStyle = 'rgba(255,220,200,0.12)';
      g.beginPath();
      g.ellipse(c.x, c.y, 90 * c.s, 22 * c.s, 0, 0, Math.PI * 2);
      g.ellipse(c.x + 50 * c.s, c.y - 10 * c.s, 60 * c.s, 20 * c.s, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Fireflies
    for (const f of this.fireflies) {
      const a = 0.4 + Math.sin(this.time * 2 + f.p) * 0.4;
      g.fillStyle = `rgba(255,236,150,${a})`;
      g.beginPath();
      g.arc(f.x + Math.sin(this.time + f.p) * 8, f.y + Math.cos(this.time * 0.7 + f.p) * 6, 1.8, 0, Math.PI * 2);
      g.fill();
    }

    this.drawWind();
    for (const t of this.targets) this.drawTarget(t);
    this.drawArcher();
    if (this.drawing) this.drawPreview();
    for (const a of this.arrows) this.drawArrow(a);

    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    for (const p of this.popups) {
      g.globalAlpha = Math.min(1, p.life);
      g.font = `800 ${p.text.startsWith('BULL') ? 26 : 18}px Manrope Variable, system-ui, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(p.text, p.x + 2, p.y + 2);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
    if (!this.locked && this.arrowsLeft > 0 && !this.arrows.some((a) => a.flying)) this.drawReticle();
    g.restore();

    if (this.slowmo < 0.8) {
      g.fillStyle = `rgba(20,10,40,${(0.8 - this.slowmo) * 0.5})`;
      g.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawWind() {
    const g = this.g;
    const x = this.W - 150, y = 150;
    const w = this.wind;
    g.save();
    g.fillStyle = 'rgba(15,10,30,0.55)';
    g.beginPath();
    g.roundRect(x - 70, y - 34, 140, 68, 14);
    g.fill();
    g.fillStyle = '#e8e0ff';
    g.font = '700 11px Manrope Variable, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('WIND', x, y - 16);
    g.strokeStyle = '#ffd27a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 40, y + 6);
    g.lineTo(x + 40, y + 6);
    g.stroke();
    const dir = Math.sign(w) || 1;
    const len = Math.min(1, Math.abs(w)) * 40;
    g.fillStyle = '#ffd27a';
    g.beginPath();
    g.moveTo(x + dir * (len + 8), y + 6);
    g.lineTo(x + dir * len, y - 2);
    g.lineTo(x + dir * len, y + 14);
    g.fill();
    // Flag rippling in the wind
    g.fillStyle = '#ff7a5c';
    g.beginPath();
    g.moveTo(x - dir * 48, y + 22);
    for (let i = 0; i <= 10; i++) g.lineTo(x - dir * 48 + dir * i * 6 * (0.3 + Math.abs(w)), y + 22 + Math.sin(this.time * 8 + i) * 2);
    g.lineTo(x - dir * 48, y + 30);
    g.fill();
    g.fillText(`${Math.abs(w * 12).toFixed(1)} km/h ${dir > 0 ? '→' : '←'}`, x, y + 28);
    g.restore();
  }

  private drawTarget(t: Target) {
    const g = this.g;
    const color = COLORS[t.index % 3];
    // Stand
    g.strokeStyle = '#5b3b26';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(t.x - t.r * 0.5, this.groundY);
    g.lineTo(t.x, t.y);
    g.lineTo(t.x + t.r * 0.5, this.groundY);
    g.stroke();
    // Glow when hit or aimed at
    const glowA = Math.max(t.hitFlash * 0.7, t.hover * 0.35);
    if (glowA > 0.01) {
      const glow = g.createRadialGradient(t.x, t.y, t.r * 0.5, t.x, t.y, t.r * 2.2);
      glow.addColorStop(0, `rgba(255,230,160,${glowA})`);
      glow.addColorStop(1, 'rgba(255,230,160,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(t.x, t.y, t.r * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // Rings
    const rings = ['#f7efe0', color, '#f7efe0', color, '#ffd27a'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(t.x, t.y, t.r * (1 - i * 0.19), 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = t.hover > 0.5 ? '#ffd27a' : 'rgba(0,0,0,0.35)';
    g.lineWidth = t.hover > 0.5 ? 4 : 2;
    g.beginPath();
    g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    g.stroke();
    // Answer sign above the target
    const scale = 1 + t.hover * 0.12;
    g.font = `800 ${Math.round(17 * scale)}px Manrope Variable, system-ui, sans-serif`;
    const w = Math.max(t.r * 2, g.measureText(t.label).width + 28);
    const h = 34 * scale;
    const sy = t.y - t.r - 12 - h;
    g.strokeStyle = '#5b3b26';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(t.x - w * 0.3, sy + h);
    g.lineTo(t.x, t.y - t.r);
    g.lineTo(t.x + w * 0.3, sy + h);
    g.stroke();
    g.fillStyle = t.hover > 0.5 ? '#3d2757' : '#2a1a3c';
    g.beginPath();
    g.roundRect(t.x - w / 2, sy, w, h, 10);
    g.fill();
    g.strokeStyle = t.hover > 0.5 ? '#ffd27a' : color;
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center';
    g.fillText(t.label, t.x, sy + h * 0.68);
  }

  private drawArcher() {
    const g = this.g;
    const { x, y } = this.bow;
    // Little hill and archer silhouette
    g.fillStyle = '#23361f';
    g.beginPath();
    g.ellipse(x - 20, this.groundY + 6, 120, 34, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#1a1033';
    g.fillRect(x - 34, y - 6, 14, 70);
    g.beginPath();
    g.arc(x - 27, y - 22, 13, 0, Math.PI * 2);
    g.fill();
    // Bow
    const pull = this.drawing ? this.power * 22 : 0;
    g.save();
    g.translate(x, y);
    g.rotate(this.angle);
    g.strokeStyle = '#8b5e3c';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 42, -1.2, 1.2);
    g.stroke();
    g.strokeStyle = '#f7efe0';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(Math.cos(-1.2) * 42, Math.sin(-1.2) * 42);
    g.lineTo(-pull, 0);
    g.lineTo(Math.cos(1.2) * 42, Math.sin(1.2) * 42);
    g.stroke();
    if (this.arrowsLeft > 0 && !this.arrows.some((a) => a.flying) && !this.locked) {
      this.arrowShape(-pull, 0, 0, 1);
    }
    g.restore();
  }

  /** Faint dotted arc to the landing point while drawing, so the player sees the lob. */
  private drawPreview() {
    const g = this.g;
    const p = this.landingPoint();
    const s = this.solve(p.x, p.y);
    const grav = this.gravity();
    g.fillStyle = 'rgba(255,236,170,0.55)';
    for (let i = 1; i < 24; i++) {
      const t = (s.time * i) / 24;
      g.globalAlpha = 0.15 + (i / 24) * 0.5;
      g.beginPath();
      g.arc(this.bow.x + s.vx * t, this.bow.y + s.vy * t + 0.5 * grav * t * t, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /** The + reticle: exactly where the arrow will land. Its ring shows how steady the shot is. */
  private drawReticle() {
    const g = this.g;
    const { x, y } = this.reticle;
    const amp = this.swayAmp();
    const steady = this.steady();
    const tired = this.drawing && this.fullTime > STEADY_TIME;
    const col = steady ? '#5fd68a' : tired ? '#ff6b5a' : this.drawing ? '#ffd27a' : '#ffffff';
    g.save();
    // Sway zone
    g.strokeStyle = col;
    g.globalAlpha = 0.35;
    g.lineWidth = 1.5;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(this.aim.x + this.wind * (this.drawing ? 26 + this.fullTime * 18 : 18), this.aim.y, amp + 6, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    // Draw progress ring
    if (this.drawing) {
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.power / FULL_DRAW));
      g.stroke();
    }
    // The +
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
    // Under-drawn: show where it would drop
    if (this.drawing && this.power < FULL_DRAW) {
      const p = this.landingPoint();
      g.globalAlpha = 0.6;
      g.strokeStyle = '#ffb4a3';
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(p.x, p.y);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(p.x, p.y, 5, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  private drawArrow(a: Arrow) {
    const g = this.g;
    if (a.flying && a.trail.length > 1) {
      g.strokeStyle = 'rgba(255,236,170,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      a.trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    g.save();
    g.translate(a.x, a.y);
    g.rotate(a.angle);
    // The arrow's position is its tip, so the shaft trails behind it.
    this.arrowShape(-30, 0, 0, 1);
    g.restore();
  }

  private arrowShape(x: number, y: number, rot: number, s: number) {
    const g = this.g;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.strokeStyle = '#d9c09a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-26, 0);
    g.lineTo(22, 0);
    g.stroke();
    g.fillStyle = '#c7ccd6';
    g.beginPath();
    g.moveTo(30, 0);
    g.lineTo(20, -4.5);
    g.lineTo(20, 4.5);
    g.fill();
    g.fillStyle = '#ff7a5c';
    g.beginPath();
    g.moveTo(-26, 0);
    g.lineTo(-18, -6);
    g.lineTo(-14, 0);
    g.lineTo(-18, 6);
    g.fill();
    g.restore();
  }
}
