// The game layer on top of the coding stages.
//   Debug Den      → "Bug Hunt": production health drains while you work; every test is a bug crawling on the
//                    screen; passing tests squash them one by one (with combos); fixing it restores production.
//   Algorithm Grove → "Boss battle": the Algorithm Guardian has one HP segment per test (examples + hidden);
//                    each passing test lands a hit, each failing test is a counter-attack that costs a heart.
// Both end with a 1–3 star rating from time and attempts. Grading itself still happens on the server.

import gsap from 'gsap';

type Kind = 'debug' | 'dsa';
export interface ArenaResult {
  ok: boolean;
  hidden?: boolean;
}

class Beeps {
  ctx: AudioContext | null = null;
  constructor() {
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }
  tone(freq: number, dur = 0.12, type: OscillatorType = 'square', vol = 0.08, slide = 0) {
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
  hit(combo: number) {
    this.tone(520 + combo * 90, 0.09, 'square', 0.07);
    this.tone(260 + combo * 45, 0.14, 'triangle', 0.08, -120);
  }
  hurt() {
    this.tone(160, 0.25, 'sawtooth', 0.07, -90);
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.08), i * 90));
  }
  close() {
    this.ctx?.close().catch(() => {});
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CodeArena {
  private el: HTMLElement;
  private beeps = new Beeps();
  private hp = 100;
  private hearts = 3;
  private submits = 0;
  private started = performance.now();
  private drain = 0;
  private busy = false;
  private done = false;

  constructor(
    host: HTMLElement,
    private kind: Kind,
    visible: number,
    hidden: number,
  ) {
    this.el = host;
    const total = visible + hidden;
    if (kind === 'debug') {
      this.el.className = 'cs-arena bughunt';
      this.el.innerHTML = `
        <div class="ar-left">
          <div class="ar-siren"></div>
          <div><small>Production status</small><strong class="ar-state">🔥 Incident: users are affected</strong></div>
        </div>
        <div class="ar-field">${Array.from({ length: total }, (_, i) => `<span class="ar-bug${i >= visible ? ' hidden-bug' : ''}" style="--d:${(i * 0.37) % 2}s;--x:${8 + ((i * 83) % 84)}%">${i >= visible ? '🪲' : '🐛'}</span>`).join('')}</div>
        <div class="ar-right">
          <small>Server health</small>
          <div class="ar-bar health"><i style="transform:scaleX(1)"></i></div>
          <span class="ar-combo"></span>
        </div>`;
      // Production health drains slowly while the bug is live (never to zero: this is pressure, not a fail).
      this.drain = window.setInterval(() => {
        if (this.done) return;
        this.setHp(Math.max(20, this.hp - 0.6));
      }, 1500);
    } else {
      this.el.className = 'cs-arena boss';
      this.el.innerHTML = `
        <div class="ar-left">
          <div class="ar-hearts">${'<b>❤</b>'.repeat(3)}</div>
          <small>Your hearts · a failed submit costs one</small>
        </div>
        <div class="ar-bossbox">
          <div class="ar-boss">🐉</div>
          <div class="ar-bossinfo">
            <strong>The Algorithm Guardian</strong>
            <div class="ar-segs">${Array.from({ length: total }, (_, i) => `<i class="${i >= visible ? 'hidden-seg' : ''}"></i>`).join('')}</div>
            <small>${total} HP · one per test (${hidden} hidden)</small>
          </div>
        </div>
        <div class="ar-right"><span class="ar-combo"></span></div>`;
      gsap.to(this.el.querySelector('.ar-boss'), { y: -6, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
  }

  private setHp(v: number) {
    this.hp = v;
    const bar = this.el.querySelector<HTMLElement>('.ar-bar.health i');
    if (!bar) return;
    bar.style.transform = `scaleX(${v / 100})`;
    bar.parentElement!.classList.toggle('low', v < 45);
  }

  private pop(text: string, cls: string, anchor: HTMLElement) {
    const p = document.createElement('span');
    p.className = `ar-pop ${cls}`;
    p.textContent = text;
    const a = anchor.getBoundingClientRect();
    const b = this.el.getBoundingClientRect();
    p.style.left = `${a.left - b.left + a.width / 2}px`;
    p.style.top = `${a.top - b.top}px`;
    this.el.appendChild(p);
    gsap.fromTo(p, { y: 0, opacity: 1, scale: 0.6 }, { y: -38, opacity: 0, scale: 1.2, duration: 1, ease: 'power2.out', onComplete: () => p.remove() });
  }

  private combo(n: number) {
    const c = this.el.querySelector<HTMLElement>('.ar-combo')!;
    c.textContent = n >= 2 ? `COMBO ×${n}!` : '';
    if (n >= 2) gsap.fromTo(c, { scale: 1.6 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
  }

  /**
   * Plays the results as game events, one test at a time. `results` are in test order
   * (visible first, then hidden). Runs of examples only touch the visible part.
   */
  async play(results: ArenaResult[], mode: 'run' | 'submit') {
    if (this.busy || this.done) return;
    this.busy = true;
    if (mode === 'submit' || this.kind === 'debug') this.submits++;
    let streak = 0;
    let failed = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (this.kind === 'debug') {
        const bug = this.el.querySelectorAll<HTMLElement>('.ar-bug')[i];
        if (!bug) continue;
        if (r.ok) {
          streak++;
          if (!bug.classList.contains('squashed')) {
            bug.classList.add('squashed');
            this.pop(streak >= 3 ? 'SQUASHED!' : 'squash!', 'good', bug);
            this.beeps.hit(streak);
          }
        } else {
          streak = 0;
          failed++;
          bug.classList.remove('squashed');
          bug.classList.add('angry');
          this.pop('bite!', 'bad', bug);
          this.beeps.hurt();
          this.setHp(Math.max(20, this.hp - 4));
          setTimeout(() => bug.classList.remove('angry'), 600);
        }
      } else {
        const seg = this.el.querySelectorAll<HTMLElement>('.ar-segs i')[i];
        const boss = this.el.querySelector<HTMLElement>('.ar-boss')!;
        if (!seg) continue;
        if (r.ok) {
          streak++;
          if (mode === 'submit') seg.classList.add('broken');
          else seg.classList.add('scouted');
          this.pop(mode === 'submit' ? `-${10 + streak * 5}` : 'hit', 'good', seg);
          gsap.fromTo(boss, { x: -10, filter: 'brightness(2.4)' }, { x: 0, filter: 'brightness(1)', duration: 0.45, ease: 'elastic.out(1, 0.3)' });
          this.beeps.hit(streak);
        } else {
          streak = 0;
          failed++;
          seg.classList.remove('scouted');
          this.pop('blocked', 'bad', seg);
          gsap.fromTo(boss, { scale: 1 }, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 1 });
          this.beeps.hurt();
        }
      }
      this.combo(streak);
      await wait(r.hidden ? 260 : 200);
    }
    if (this.kind === 'dsa' && mode === 'submit' && failed > 0 && this.hearts > 0) {
      this.hearts--;
      const hearts = this.el.querySelectorAll<HTMLElement>('.ar-hearts b');
      const h = hearts[this.hearts];
      if (h) {
        h.classList.add('lost');
        gsap.fromTo(h, { scale: 1.8 }, { scale: 1, duration: 0.5 });
      }
      gsap.fromTo(this.el, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
    }
    if (mode === 'run' && this.kind === 'dsa') {
      // Scouting is practice: reset the segments for the real fight.
      await wait(500);
      this.el.querySelectorAll('.ar-segs i.scouted').forEach((s) => s.classList.remove('scouted'));
    }
    this.combo(0);
    this.busy = false;
  }

  /** 1–3 stars: fast and first try earns three. */
  stars() {
    const mins = (performance.now() - this.started) / 60000;
    const tries = this.submits;
    if (tries <= 1 && mins < 4) return 3;
    if (tries <= 2 && mins < 10) return 2;
    return 1;
  }

  /** The finale: production restored, or the Guardian defeated. Resolves when the animation ends. */
  async victory() {
    this.done = true;
    window.clearInterval(this.drain);
    const stars = this.stars();
    this.beeps.win();
    if (this.kind === 'debug') {
      this.setHp(100);
      this.el.classList.add('restored');
      this.el.querySelector('.ar-state')!.textContent = '✅ Production restored';
    } else {
      const boss = this.el.querySelector<HTMLElement>('.ar-boss')!;
      gsap.killTweensOf(boss);
      gsap.to(boss, { rotate: 720, scale: 0.1, opacity: 0, duration: 1, ease: 'power2.in' });
      this.el.classList.add('defeated');
    }
    const v = document.createElement('div');
    v.className = 'ar-victory';
    v.innerHTML = `<strong>${this.kind === 'debug' ? 'BUG SQUASHED' : 'GUARDIAN DEFEATED'}</strong><span class="ar-stars">${'★'.repeat(stars)}<em>${'★'.repeat(3 - stars)}</em></span><small>${
      stars === 3 ? 'Flawless: first try and fast' : stars === 2 ? 'Great run' : 'Cleared. Faster and fewer tries earn more stars'
    }</small>`;
    this.el.appendChild(v);
    gsap.fromTo(v, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' });
    gsap.fromTo(v.querySelectorAll('.ar-stars'), { rotate: -20 }, { rotate: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    await wait(1900);
    return stars;
  }

  dispose() {
    window.clearInterval(this.drain);
    this.beeps.close();
  }
}
