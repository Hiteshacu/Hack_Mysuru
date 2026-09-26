/*
 * Fully procedural soundscape (no audio files): generative ambient music, wind, birdsong by day,
 * crickets at night, lapping water near lakes, crackling campfire, footsteps and UI chimes.
 */

const PENTATONIC = [0, 2, 4, 7, 9];
const CHORDS = [
  [50, 57, 62, 66, 69], // D  maj9-ish
  [47, 54, 59, 62, 66], // Bm7
  [43, 50, 55, 59, 62], // Gmaj7
  [45, 52, 57, 61, 64], // A
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private waterGain!: GainNode;
  private fireGain!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  /** True while the audio graph is being built (the context exists but is not usable yet). */
  private starting = false;
  /** The graph is complete and safe to drive. */
  private ready = false;

  constructor() {
    const retry = () => this.resumeIfNeeded();
    window.addEventListener('pointerdown', retry, { passive: true });
    window.addEventListener('keydown', retry);
  }
  private volume = 0.9;
  private nextBird = 0;
  private nextCricket = 0;
  private nextChord = 0;
  private nextNote = 0;
  private nextCrackle = 0;
  private chordIndex = 0;
  private night = 0;
  private fireProximity = 0;

  get enabled() {
    return this.ready && !this.muted;
  }

  /**
   * Creates (and tries to resume) the audio context. Must run inside the click that starts the world:
   * Firefox only allows audio while a user gesture is active, and a blocked `resume()` returns a promise
   * that never settles — so it is fired and forgotten, never awaited.
   */
  private open() {
    if (this.ctx) {
      this.resumeIfNeeded();
      return this.ctx;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.resumeIfNeeded();
    return this.ctx;
  }

  /** Browsers suspend audio until the page is interacted with; retry on every interaction. */
  resumeIfNeeded() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  start(muted = false) {
    this.muted = muted;
    if (this.ready || this.starting) {
      this.setMuted(muted);
      this.resumeIfNeeded();
      return;
    }
    this.starting = true;
    const ctx = this.open();
    if (!ctx) {
      this.starting = false;
      return;
    }

    this.master = ctx.createGain();
    this.master.gain.value = muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.6);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.55;
    this.reverb.connect(reverbGain).connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.85;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.95;
    this.ambBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.2 * 0.6 + white * 0.4 * 0.25;
    }

    // Wind bed
    const wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 480;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.3;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.ambBus);

    // Water lapping
    const water = this.loopNoise();
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    const waterMod = ctx.createGain();
    waterMod.gain.value = 0.6;
    lfo.connect(lfoGain).connect(waterMod.gain);
    lfo.start();
    water.connect(wf).connect(waterMod).connect(this.waterGain).connect(this.ambBus);

    // Fire bed
    const fire = this.loopNoise();
    const ff = ctx.createBiquadFilter();
    ff.type = 'lowpass';
    ff.frequency.value = 500;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    fire.connect(ff).connect(this.fireGain).connect(this.ambBus);

    const now = ctx.currentTime;
    this.nextChord = now + 0.5;
    this.nextNote = now + 3;
    this.nextBird = now + 2;
    this.nextCricket = now + 1;
    this.nextCrackle = now + 1;
    this.ready = true;
    this.starting = false;
    this.setMuted(this.muted);
  }

  private loopNoise() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 2);
    return src;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ready || !this.ctx) return;
    if (!m && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.25);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ready && this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  get isMuted() {
    return this.muted;
  }

  // ---------------------------------------------------------------- music

  private pad(freq: number, when: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(gain, when + dur * 0.35);
    out.gain.linearRampToValueAtTime(0, when + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, when);
    filter.frequency.linearRampToValueAtTime(1400, when + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(600, when + dur);
    filter.connect(out).connect(this.musicBus);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(filter);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
  }

  private pluck(freq: number, when: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.001;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.8);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus);
    o.start(when);
    o2.start(when);
    o.stop(when + 3);
    o2.stop(when + 3);
  }

  // ---------------------------------------------------------------- nature

  private bird(when: number) {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = ctx.createGain();
    out.gain.value = (0.12 + Math.random() * 0.1) * (1 - this.night);
    out.connect(pan).connect(this.ambBus);
    pan.connect(this.reverb);
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 5);
    let t = when;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const len = 0.06 + Math.random() * 0.1;
      const f0 = base * (0.85 + Math.random() * 0.35);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() > 0.5 ? 1.4 : 0.7), t + len);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len + 0.03 + Math.random() * 0.08;
    }
  }

  private cricket(when: number) {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const out = ctx.createGain();
    out.gain.value = 0.05 * this.night;
    out.connect(pan).connect(this.ambBus);
    const f = 4200 + Math.random() * 900;
    for (let i = 0; i < 3; i++) {
      const t = when + i * 0.07;
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + 0.045);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.06);
    }
  }

  private noiseBurst(when: number, dur: number, freq: number, q: number, gain: number, bus: AudioNode, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(when, Math.random() * 2.5);
    src.stop(when + dur + 0.02);
  }

  // ---------------------------------------------------------------- public sfx

  footstep(surface: 'grass' | 'path' | 'stone' | 'water') {
    if (!this.ready) return;
    if (!this.enabled) return;
    const t = this.ctx!.currentTime;
    const presets = {
      grass: [0.09, 2400, 0.6, 0.35],
      path: [0.07, 900, 0.9, 0.5],
      stone: [0.05, 1600, 1.4, 0.45],
      water: [0.22, 1200, 0.5, 0.45],
    } as const;
    const [dur, freq, q, gain] = presets[surface];
    this.noiseBurst(t, dur, freq * (0.85 + Math.random() * 0.3), q, gain * (0.7 + Math.random() * 0.3), this.sfxBus);
  }

  jump() {
    if (!this.ready) return;
    if (!this.enabled) return;
    this.noiseBurst(this.ctx!.currentTime, 0.18, 700, 0.8, 0.25, this.sfxBus);
  }

  land() {
    if (!this.ready) return;
    if (!this.enabled) return;
    this.noiseBurst(this.ctx!.currentTime, 0.14, 380, 0.7, 0.6, this.sfxBus, 'lowpass');
  }

  chime(kind: 'open' | 'discover' | 'travel' | 'click') {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const seq = {
      open: [74, 81],
      discover: [69, 74, 78, 81, 86],
      travel: [86, 81, 78, 74],
      click: [88],
    }[kind];
    seq.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const g = ctx.createGain();
      const when = t + i * (kind === 'discover' ? 0.09 : 0.07);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(kind === 'click' ? 0.05 : 0.12, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + (kind === 'click' ? 0.15 : 1.2));
      o.connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverb);
      o.start(when);
      o.stop(when + 1.3);
    });
    if (kind === 'travel') this.noiseBurst(t, 0.9, 1800, 0.4, 0.25, this.sfxBus, 'highpass');
  }

  // ---------------------------------------------------------------- combat

  /** Gunshot; `distance` in metres attenuates and muffles distant enemy fire. */
  gunshot(distance: number) {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const near = Math.max(0.08, 1 - distance / 70);
    const bus = ctx.createGain();
    bus.gain.value = near * (distance < 1 ? 0.55 : 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + near * 6000;
    lp.connect(bus).connect(this.sfxBus);
    bus.connect(this.reverb);
    this.noiseBurst(t, 0.09, 1800, 0.6, 1, lp, 'bandpass');
    this.noiseBurst(t, 0.22, 380, 0.7, 0.9, lp, 'lowpass');
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(lp);
    o.start(t);
    o.stop(t + 0.16);
  }

  explosion(distance: number) {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const near = Math.max(0.15, 1 - distance / 90);
    const bus = ctx.createGain();
    bus.gain.value = near * 0.9;
    bus.connect(this.sfxBus);
    bus.connect(this.reverb);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000 * near + 400, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
    lp.connect(bus);
    this.noiseBurst(t, 1.6, 600, 0.3, 1.2, lp, 'lowpass');
    this.noiseBurst(t, 0.3, 2500, 0.5, 0.6, lp, 'bandpass');
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 1.1);
  }

  hit() {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  hurt() {
    if (!this.ready) return;
    if (!this.enabled) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.25, 260, 1.2, 0.9, this.sfxBus, 'bandpass');
  }

  enemyDown() {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    [76, 71, 64].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const g = ctx.createGain();
      const w = t + i * 0.08;
      g.gain.setValueAtTime(0, w);
      g.gain.linearRampToValueAtTime(0.08, w + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, w + 0.5);
      o.connect(g).connect(this.sfxBus);
      o.start(w);
      o.stop(w + 0.6);
    });
  }

  /** Magazine out, magazine in, bolt release. */
  reload() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.05, 1400, 3, 0.35, this.sfxBus, 'bandpass');
    this.noiseBurst(t + 0.55, 0.06, 900, 2.4, 0.4, this.sfxBus, 'bandpass');
    this.noiseBurst(t + 1.15, 0.05, 2200, 4, 0.3, this.sfxBus, 'highpass');
  }

  throwWhoosh() {
    if (!this.ready) return;
    if (!this.enabled) return;
    this.noiseBurst(this.ctx!.currentTime, 0.35, 900, 0.8, 0.35, this.sfxBus, 'bandpass');
  }

  ghost() {
    if (!this.ready) return;
    if (!this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    [81, 76, 72, 69, 64].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const g = ctx.createGain();
      const w = t + i * 0.16;
      g.gain.setValueAtTime(0, w);
      g.gain.linearRampToValueAtTime(0.07, w + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, w + 1.6);
      o.connect(g);
      g.connect(this.sfxBus);
      g.connect(this.reverb);
      o.start(w);
      o.stop(w + 1.7);
    });
  }

  // ---------------------------------------------------------------- per-frame

  update(opts: { night: number; waterProximity: number; fireProximity: number; wind: number }) {
    if (!this.ready) return;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.night = opts.night;
    this.fireProximity = opts.fireProximity;

    this.windGain.gain.setTargetAtTime(0.22 + opts.wind * 0.2, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(380 + Math.sin(now * 0.13) * 160 + Math.sin(now * 0.41) * 90, now, 0.4);
    this.waterGain.gain.setTargetAtTime(opts.waterProximity * 0.85, now, 0.3);
    this.fireGain.gain.setTargetAtTime(opts.fireProximity * 0.4, now, 0.3);

    const horizon = now + 0.2;
    if (this.nextChord < horizon) {
      const chord = CHORDS[this.chordIndex % CHORDS.length];
      const dur = 9.5;
      chord.forEach((m, i) => this.pad(mtof(m), this.nextChord + i * 0.05, dur, i === 0 ? 0.16 : 0.1));
      this.chordIndex++;
      this.nextChord += 8;
    }
    if (this.nextNote < horizon) {
      const root = CHORDS[(this.chordIndex + CHORDS.length - 1) % CHORDS.length][0] + 24;
      const m = root + PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] + (Math.random() > 0.7 ? 12 : 0);
      this.pluck(mtof(m), this.nextNote, 0.17);
      this.nextNote += [0.8, 1.2, 1.6, 2.4, 3.2][Math.floor(Math.random() * 5)];
    }
    if (this.nextBird < horizon) {
      if (this.night < 0.6) this.bird(this.nextBird);
      this.nextBird += 1.8 + Math.random() * 4.5;
    }
    if (this.nextCricket < horizon) {
      if (this.night > 0.3) this.cricket(this.nextCricket);
      this.nextCricket += 0.35 + Math.random() * 0.6;
    }
    if (this.nextCrackle < horizon) {
      if (this.fireProximity > 0.05) {
        this.noiseBurst(this.nextCrackle, 0.03, 2500 + Math.random() * 2500, 2, 0.5 * this.fireProximity, this.ambBus, 'highpass');
      }
      this.nextCrackle += 0.05 + Math.random() * 0.25;
    }
  }
}
