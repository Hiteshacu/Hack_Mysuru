import gsap from 'gsap';
import type { Experience } from '../core/Experience';
import type { QualityLevel } from '../core/Quality';
import type { Interactable } from '../world/Landmarks';
import { TIMES, zoneById, zones, type TimeOfDay, type ZoneDef, type ZoneId } from '../world/layout';
import { profile, projects } from '../data/portfolio';
import { icons } from './icons';
import { projectDetailHTML, sectionMeta } from './content';
import { MapView } from './MapView';
import { ClassicView } from './ClassicView';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const NAV: { id: ZoneId; label: string }[] = [
  { id: 'welcome', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'contact', label: 'Contact' },
];

const TIME_ICON: Record<TimeOfDay, string> = { morning: icons.sunrise, day: icons.sun, sunset: icons.sunset, night: icons.moon };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches;

export class UI {
  private exp!: Experience;
  private map!: MapView;
  private classic: ClassicView;
  private panelOpen = false;
  private panelAnchor: { x: number; z: number; r: number } | null = null;
  private panelKey = '';
  private active: Interactable | null = null;
  private helpTimer = 0;
  private entered = false;

  constructor(private root: HTMLElement) {
    root.innerHTML = this.template();
    this.classic = new ClassicView($('#classic'), () => this.closeClassic());
    this.bindPortrait();
    this.bindStatic();
  }

  /** Marks the UI as having a real photo once it loads (otherwise the monogram stays). */
  private bindPortrait() {
    const base = import.meta.env.BASE_URL;
    // Whatever the photo was saved as, one of these will load (or none, and the monogram stays).
    const candidates = [`${base}profile.jpg`, `${base}profile.jpeg`, `${base}profile.png`, `${base}profile.webp`];
    const imgs = [...this.root.querySelectorAll<HTMLImageElement>('.portrait-img, .brand-mark img, .hero-portrait')];
    for (const img of imgs) {
      if (img.dataset.bound) continue;
      img.dataset.bound = '1';
      let attempt = 0;
      const ok = () => this.root.classList.add('has-portrait');
      const next = () => {
        attempt++;
        if (attempt < candidates.length) img.src = candidates[attempt];
      };
      img.addEventListener('load', ok);
      img.addEventListener('error', next);
      if (img.complete) {
        if (img.naturalWidth > 0) ok();
        else next();
      }
    }
  }

  /** The loading portrait flies up into the top bar and becomes the profile picture. */
  private flyPortraitToBrand() {
    if (!this.root.classList.contains('has-portrait') || reducedMotion) return;
    const from = this.root.querySelector<HTMLElement>('.portrait');
    const to = this.root.querySelector<HTMLElement>('.brand-mark');
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const clone = from.cloneNode(true) as HTMLElement;
    clone.classList.add('portrait-fly');
    Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(clone);
    gsap.to(clone, {
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height,
      borderRadius: 12,
      duration: 0.9,
      ease: 'power3.inOut',
      onComplete: () => clone.remove(),
    });
  }

  // ------------------------------------------------------------------ template

  private template() {
    const nav = NAV.map((n) => `<button class="nav-link" data-travel="${n.id}">${n.label}</button>`).join('');
    return `
    <div class="fade" id="fade"></div>

    <section id="loader" class="loader" aria-live="polite">
      <div class="loader-bg"></div>
      <div class="loader-inner">
        <div class="portrait" aria-hidden="true">
          <img class="portrait-img" src="${import.meta.env.BASE_URL}profile.jpg" alt="" />
          <svg class="monogram" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" class="mono-ring"/>
            <path d="M36 34v52M36 60h26M62 34v52" class="mono-stroke"/>
            <path d="M70 86 84 34l14 52M75 68h18" class="mono-stroke delay"/>
          </svg>
        </div>
        <p class="eyebrow loader-eyebrow">Portfolio world</p>
        <h1 class="loader-title">${profile.name}</h1>
        <p class="loader-role">${profile.role}</p>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar"></div>
          <div class="progress-sweep" aria-hidden="true"></div>
        </div>
        <p class="loader-status"><span class="status-text">Preparing the world</span> <span class="status-pct">0%</span></p>
        <div class="enter" hidden>
          <button class="btn btn-primary btn-lg" data-enter="audio">${icons.sound} Enter the 3D world</button>
          <button class="btn btn-ghost btn-lg" data-classic>${icons.book} Professional Portfolio</button>
        </div>
        <button class="skip link" data-enter="silent">${icons.mute} Enter the 3D world without sound</button>
        <p class="loader-hint">${isTouch ? 'Tip: use the joystick to walk and drag to look around' : 'Best experienced with headphones · WASD to walk · drag to look'}</p>
      </div>
    </section>

    <header id="topbar" class="topbar" hidden>
      <button class="brand" data-travel="welcome" aria-label="Travel home">
        <span class="brand-mark"><img src="${import.meta.env.BASE_URL}profile.jpg" alt="" /><b>HA</b></span>
        <span class="brand-text"><strong>${profile.name}</strong><small>AI &amp; Security Engineer</small></span>
      </button>
      <nav class="nav" aria-label="Portfolio sections">${nav}</nav>
      <div class="top-actions">
        <button class="icon-btn" data-action="map" title="Map (M)" aria-label="Open map">${icons.map}</button>
        <button class="icon-btn" data-action="time" title="Time of day (T)" aria-label="Change time of day">${icons.sun}</button>
        <button class="icon-btn" data-action="sound" title="Sound" aria-label="Toggle sound">${icons.sound}</button>
        <button class="icon-btn" data-action="settings" title="Settings" aria-label="Settings">${icons.settings}</button>
        <button class="btn btn-primary btn-sm portfolio-btn" data-classic>${icons.book}<span>Portfolio</span></button>
        <button class="btn btn-sm battle-btn" data-action="battle" aria-pressed="false" title="Start or stop the shooting game (B)">${icons.target}<span>Start battle</span></button>
        <button class="icon-btn menu-btn" data-action="menu" aria-label="Open menu" aria-expanded="false">${icons.menu}</button>
      </div>
      <div class="mobile-menu" hidden>
        ${NAV.map((n) => `<button data-travel="${n.id}"><span style="--c:${zoneById[n.id].color}"></span>${n.label}<small>${zoneById[n.id].title}</small></button>`).join('')}
        <button data-classic class="mobile-classic">${icons.book} Open classic portfolio</button>
      </div>
    </header>

    <div id="hud" class="hud" hidden>
      <div class="discovery" title="Stations discovered">
        <span class="disc-count"><b>0</b>/${zones.length}</span>
        <span class="disc-label">discovered</span>
        <span class="disc-dots">${zones.map((z) => `<i data-zone="${z.id}" style="--c:${z.color}" title="${z.title}"></i>`).join('')}</span>
      </div>
      <div class="combat-hud" aria-label="Combat status">
        <div class="hp">
          <span class="hp-icon">❤</span>
          <div class="hp-bar"><i></i></div>
          <b class="hp-num">100</b>
        </div>
        <div class="combat-stats">
          <span class="ammo" title="Rounds left (R to reload)"><b>30</b><small>/30</small></span>
          <span class="grenades" title="Grenades (G / right-click)">${icons.grenade}<b>3</b></span>
          <span class="enemies" title="Enemies remaining">${icons.skull}<b>7</b></span>
          <span class="safe-badge" hidden>${icons.shield} Safe zone</span>
        </div>
      </div>
      <div class="ghost-banner" hidden>
        <strong>Spirit mode</strong>
        <span>You were defeated — you can't fight, but you can still explore the whole portfolio.</span>
        <button class="btn btn-ghost btn-sm" data-action="restart">Restart battle</button>
      </div>
      <div class="toasts" aria-live="polite"></div>
      <button class="prompt" hidden>
        <kbd>${isTouch ? 'Tap' : 'E'}</kbd><span>Open</span><strong class="prompt-title"></strong>
      </button>
      <div class="help ${isTouch ? 'touch' : ''}">
        <button class="help-toggle icon-btn" aria-label="Controls help (H)">?</button>
        <div class="help-card">
          <h4>Controls · <em class="help-mode">Explore</em></h4>
          <ul>
            <li><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> Move (jog)</li>
            <li><span><kbd>Shift</kbd> / <kbd>Ctrl</kbd></span> Sprint / walk</li>
            <li><span><kbd>Space</kbd></span> Jump</li>
            <li><span><kbd>E</kbd></span> Open station</li>
            <li class="explore-only"><span><kbd>Drag</kbd></span> Look around</li>
            <li class="explore-only"><span><kbd>Click</kbd></span> Walk to spot</li>
            <li class="battle-only"><span><kbd>Click</kbd></span> Lock mouse to aim</li>
            <li class="battle-only"><span><kbd>LMB</kbd> / <kbd>F</kbd></span> Shoot</li>
            <li class="battle-only"><span><kbd>RMB</kbd> hold</span> Scope (zoom &amp; aim)</li>
            <li class="battle-only"><span><kbd>G</kbd> / <kbd>MMB</kbd></span> Grenade</li>
            <li class="battle-only"><span><kbd>R</kbd></span> Reload</li>
            <li class="battle-only"><span><kbd>Esc</kbd></span> Free the mouse</li>
            <li><span><kbd>B</kbd> <kbd>M</kbd> <kbd>T</kbd></span> Battle · Map · Time</li>
          </ul>
        </div>
      </div>
      <div class="minimap">
        <canvas aria-hidden="true"></canvas>
        <button class="minimap-btn" data-action="map" aria-label="Open full map">${icons.compass}</button>
        <span class="minimap-zone"></span>
      </div>
      <div class="touch-controls" ${isTouch ? '' : 'hidden'}>
        <div class="joystick"><div class="knob"></div></div>
        <button class="jump-btn" aria-label="Jump">↑</button>
        <button class="fire-btn" aria-label="Fire">${icons.target}</button>
        <button class="grenade-btn" aria-label="Throw grenade">${icons.grenade}</button>
        <button class="scope-btn" aria-label="Toggle scope">${icons.compass}</button>
      </div>
    </div>

    <div class="reticle" hidden><i></i><u class="hitmark"></u></div>
    <div class="scope" aria-hidden="true">
      <div class="scope-lens">
        <i class="scope-h"></i><i class="scope-v"></i>
        <span class="scope-dots">${Array.from({ length: 9 }, () => '<b></b>').join('')}</span>
        <em class="scope-center"></em>
      </div>
      <span class="scope-label">4× SCOPE · release RMB to exit</span>
    </div>
    <button class="aim-hint" hidden>${icons.target}<span><strong>Click to aim</strong> · LMB shoot · hold RMB for scope · G grenade · Esc frees the mouse</span></button>
    <div class="damage-vignette"></div>

    <aside id="panel" class="panel" aria-hidden="true" role="dialog" aria-labelledby="panel-title">
      <div class="panel-inner">
        <header class="panel-head">
          <div>
            <p class="eyebrow panel-eyebrow"></p>
            <h2 id="panel-title" class="panel-title"></h2>
          </div>
          <button class="icon-btn panel-close" aria-label="Close panel (Esc)">${icons.close}</button>
        </header>
        <div class="panel-body"></div>
      </div>
    </aside>

    <div id="map-modal" class="modal" hidden>
      <div class="modal-card map-card" role="dialog" aria-label="World map">
        <header><div><p class="eyebrow">Fast travel</p><h2>World map</h2></div><button class="icon-btn" data-close aria-label="Close map">${icons.close}</button></header>
        <div class="bigmap"></div>
        <p class="muted">Pick a station to travel there instantly.</p>
      </div>
    </div>

    <div id="settings-modal" class="modal" hidden>
      <div class="modal-card" role="dialog" aria-label="Settings">
        <header><div><p class="eyebrow">Preferences</p><h2>Settings</h2></div><button class="icon-btn" data-close aria-label="Close settings">${icons.close}</button></header>
        <div class="setting">
          <label>Graphics quality</label>
          <div class="segmented" data-setting="quality">
            <button data-value="auto">Auto</button><button data-value="high">High</button><button data-value="medium">Medium</button><button data-value="low">Low</button>
          </div>
          <p class="muted setting-note"></p>
        </div>
        <div class="setting">
          <label>Time of day</label>
          <div class="segmented" data-setting="time">
            ${TIMES.map((t) => `<button data-value="${t}">${TIME_ICON[t]}<span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join('')}
          </div>
        </div>
        <div class="setting">
          <label>Camera</label>
          <div class="segmented" data-setting="camera">
            <button data-value="free">Free look</button><button data-value="follow">Follow behind</button>
          </div>
        </div>
        <div class="setting row">
          <label for="sens">Look sensitivity</label>
          <input id="sens" type="range" min="0.3" max="2" step="0.05" value="1" />
        </div>
        <div class="setting row">
          <label for="vol">Volume</label>
          <input id="vol" type="range" min="0" max="1" step="0.05" value="0.9" />
        </div>
        <div class="setting row">
          <label>Battle</label>
          <button class="btn btn-ghost btn-sm" data-action="restart">Restart battle</button>
        </div>
      </div>
    </div>

    <div id="classic" class="classic" hidden></div>
    `;
  }

  // ------------------------------------------------------------------ static bindings

  private bindStatic() {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const travel = t.closest<HTMLElement>('[data-travel]');
      if (travel) {
        if (!this.entered) return;
        this.closeMenu();
        this.travel(travel.dataset.travel as ZoneId);
        return;
      }
      if (t.closest('[data-classic]')) {
        this.closeMenu();
        this.openClassic();
        return;
      }
      const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.handleAction(action);
      const openProject = t.closest<HTMLElement>('[data-open-project]');
      if (openProject) this.openPanel('projects', openProject.dataset.openProject);
      if (t.closest('[data-close]')) this.closeModals();
      if (t.classList.contains('modal')) this.closeModals();
    });

    $('.panel-close', this.root).addEventListener('click', () => this.closePanel());
    $('.prompt', this.root).addEventListener('click', () => this.interact());
    $('.help-toggle', this.root).addEventListener('click', () => this.toggleHelp());
    this.root.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((b) =>
      b.addEventListener('click', () => this.enter(b.dataset.enter === 'audio')),
    );
  }

  private handleAction(action: string) {
    if (!this.exp) return;
    switch (action) {
      case 'map':
        this.openModal('#map-modal');
        break;
      case 'time': {
        const t = this.exp.env.nextTime();
        this.syncTime(t);
        this.exp.audio.chime('click');
        break;
      }
      case 'sound':
        this.exp.audio.setMuted(!this.exp.audio.isMuted);
        if (!this.exp.audio.ctx) this.exp.audio.start(false);
        this.syncSound();
        break;
      case 'settings':
        this.openModal('#settings-modal');
        break;
      case 'battle':
        this.exp.setBattle(!this.exp.battle);
        break;
      case 'restart':
        this.exp.restartBattle();
        this.root.classList.remove('ghost');
        $('.ghost-banner', this.root).hidden = true;
        this.closeModals();
        this.toast('Battle restarted', 'All 7 outposts are manned again. Health and grenades restored.', '#ff7a5c');
        break;
      case 'menu': {
        const menu = $('.mobile-menu', this.root);
        const open = menu.hidden;
        menu.hidden = !open;
        $('.menu-btn', this.root).setAttribute('aria-expanded', String(open));
        if (open && !reducedMotion) gsap.from(menu.children, { y: -8, opacity: 0, stagger: 0.03, duration: 0.3 });
        break;
      }
    }
  }

  private closeMenu() {
    const menu = $('.mobile-menu', this.root);
    if (!menu.hidden) {
      menu.hidden = true;
      $('.menu-btn', this.root).setAttribute('aria-expanded', 'false');
    }
  }

  // ------------------------------------------------------------------ experience wiring

  attach(exp: Experience) {
    this.exp = exp;
  }

  onLoaded() {
    this.map = new MapView(this.exp.terrain, $('.minimap canvas', this.root));
    this.map.setDiscovered(this.exp.discovered);
    this.map.mountBig($('.bigmap', this.root), (id) => this.travel(id));
    this.exp.mapImage.then((canvas) => canvas && this.map.setImage(canvas));
    this.map.setDetailProvider((cx, cz, half) => this.exp.mapDetail(cx, cz, half));
    this.syncUiWeight(this.exp.quality);
    // Lay out and paint the modals once while the loading screen is still up: their first paint is
    // otherwise a ~100 ms hitch the first time the map or settings is opened.
    this.root.querySelectorAll<HTMLElement>('.modal').forEach((m) => {
      m.style.visibility = 'hidden';
      m.hidden = false;
      requestAnimationFrame(() => {
        m.hidden = true;
        m.style.visibility = '';
      });
    });
    this.bindSettings();
    this.bindTouch();
    this.syncTime(this.exp.env.time);

    const enter = $('.enter', this.root);
    enter.hidden = false;
    $('.progress', this.root).classList.add('done');
    if (!reducedMotion) gsap.from(enter.children, { y: 16, opacity: 0, stagger: 0.12, duration: 0.7, ease: 'power3.out' });
    $('.loader', this.root).classList.add('ready');

    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.entered) return;
      const p = this.exp.player.position;
      const alive = this.exp.battle ? this.exp.combat.enemies.filter((e) => e.alive).map((e) => e.position) : [];
      this.map.drawMini(p.x, p.z, this.exp.player.facing, this.exp.rig.yaw, alive);
      if (!$('#map-modal', this.root).hidden) this.map.updateBigEnemies(this.exp.combat.enemies.map((e) => ({ x: e.position.x, z: e.position.z, alive: e.alive && this.exp.battle })));
      if (this.panelOpen && this.panelAnchor) {
        const d = Math.hypot(p.x - this.panelAnchor.x, p.z - this.panelAnchor.z);
        if (d > this.panelAnchor.r + 5) this.closePanel();
      }
    };
    tick();
  }

  setProgress(p: number, label: string) {
    const bar = $('.progress-bar', this.root);
    gsap.to(bar, { scaleX: p, duration: 0.5, ease: 'power2.out' });
    $('.status-text', this.root).textContent = label;
    $('.status-pct', this.root).textContent = `${Math.round(p * 100)}%`;
    $('.progress', this.root).setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  /** Problem message: a toast once the world is running, otherwise on the loading screen. */
  showNotice(message: string) {
    if (this.entered) this.toast('Heads up', message, '#ff7a5c', 8000);
    else this.showError(message);
  }

  /** Frosted-glass blur over a live 3D canvas is costly; keep it only where there is headroom. */
  private syncUiWeight(level: QualityLevel) {
    const firefox = navigator.userAgent.includes('Firefox');
    document.documentElement.classList.toggle('lite-ui', level !== 'high' || firefox || reducedMotion);
  }

  showError(message: string) {
    $('.status-text', this.root).textContent = message;
    $('.status-pct', this.root).textContent = '';
    $('.loader', this.root).classList.add('error');
  }

  async enter(withAudio: boolean, skipIntro = false) {
    if (this.entered) return;
    this.entered = true;
    // Start audio inside the click: browsers only unlock sound while a user gesture is active,
    // and shader warm-up below can take seconds.
    this.exp.audio.start(!withAudio);
    const loader = $('.loader', this.root);
    // If shaders are still compiling in the background, wait here (usually well under a second).
    let settled = false;
    this.exp.compiled.then(() => (settled = true));
    await Promise.resolve();
    if (!settled) {
      this.root.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((b) => {
        b.disabled = true;
      });
      const status = $('.loader-status', this.root);
      status.style.display = 'block';
      $('.status-text', this.root).textContent = 'Warming up the graphics';
      $('.status-pct', this.root).textContent = '';
      $('.loader', this.root).classList.add('warming');
      await this.exp.compiled;
      $('.loader', this.root).classList.remove('warming');
    }
    gsap.to(loader, {
      opacity: 0,
      duration: reducedMotion || skipIntro ? 0.2 : 1.1,
      ease: 'power2.inOut',
      onComplete: () => (loader.hidden = true),
    });
    this.exp.input.enabled = false;
    // Browsers without parallel shader compilation stutter through the aerial flythrough,
    // so they start straight behind the character instead.
    await this.exp.start(withAudio, skipIntro || this.exp.quickStart);
    this.exp.input.enabled = true;
    this.syncSound();
    this.syncBattle();
    $('.aim-hint', this.root).addEventListener('click', () => this.exp.input.lock());

    // Deep links: ?zone=projects or #projects lands visitors straight at a station.
    const params = new URLSearchParams(location.search);
    const target = (params.get('zone') || location.hash.slice(1)) as ZoneId;
    if (target && zoneById[target]) window.setTimeout(() => this.travel(target), skipIntro ? 0 : 400);
    const time = params.get('time') as TimeOfDay | null;
    if (time && TIMES.includes(time)) {
      this.exp.env.setTime(time, 0.01);
      this.syncTime(time);
    }

    const top = $('#topbar', this.root);
    const hud = $('#hud', this.root);
    top.hidden = false;
    hud.hidden = false;
    this.flyPortraitToBrand();
    if (!reducedMotion) {
      gsap.from(top, { y: -40, opacity: 0, duration: 0.9, ease: 'power3.out' });
      gsap.from(top.querySelectorAll('.nav-link, .top-actions > *'), { y: -10, opacity: 0, stagger: 0.04, duration: 0.5, delay: 0.2 });
      gsap.from(hud.children, { opacity: 0, y: 12, stagger: 0.08, duration: 0.7, delay: 0.3, clearProps: 'opacity,transform' });
    }
    this.toast(`Welcome, explorer`, 'Walk through the gate — or use the top bar to jump anywhere.', '#f2b35c', 5200);
    this.flashHelp(3000);
  }

  onFirstMove() {
    /* the controls card already auto-hides after 3 seconds */
  }

  onInteractable(item: Interactable | null) {
    this.active = item;
    this.syncPrompt();
  }

  /** Shows the "Open …" pill only when there is something new to open. */
  private syncPrompt() {
    const item = this.active && !(this.panelOpen && this.panelKey === this.keyFor(this.active)) ? this.active : null;
    const prompt = $('.prompt', this.root);
    if (item) {
      $('.prompt-title', this.root).textContent = item.title;
      if (prompt.hidden) {
        prompt.hidden = false;
        if (!reducedMotion) gsap.fromTo(prompt, { y: 20, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' });
      }
    } else if (!prompt.hidden) {
      gsap.to(prompt, {
        y: 12,
        opacity: 0,
        duration: 0.25,
        onComplete: () => {
          if (!this.active || (this.panelOpen && this.panelKey === this.keyFor(this.active))) prompt.hidden = true;
          gsap.set(prompt, { clearProps: 'opacity,transform' });
        },
      });
    }
  }

  onZone(zone: ZoneDef | null) {
    this.root.querySelectorAll<HTMLElement>('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.travel === zone?.id));
    const label = $('.minimap-zone', this.root);
    label.textContent = zone ? zone.title : '';
    label.style.setProperty('--c', zone?.color ?? 'transparent');
  }

  onDiscover(zone: ZoneDef, count: number, total: number) {
    $('.disc-count b', this.root).textContent = String(count);
    const dot = this.root.querySelector<HTMLElement>(`.disc-dots i[data-zone="${zone.id}"]`);
    dot?.classList.add('on');
    if (dot && !reducedMotion) gsap.fromTo(dot, { scale: 2.2 }, { scale: 1, duration: 0.6, ease: 'back.out(3)' });
    this.toast(`Discovered · ${zone.title}`, zone.subtitle, zone.color);
    if (count === total) {
      window.setTimeout(() => {
        this.toast('World fully explored ✦', 'Thanks for walking through my work. Say hi at the Lakeside Camp!', '#ffd27a', 7000);
        this.celebrate();
      }, 1800);
    }
  }

  // ------------------------------------------------------------------ battle mode

  /** Show the controls card for `ms`, then tuck it away. */
  private flashHelp(ms: number) {
    const help = this.root.querySelector('.help');
    if (!help) return;
    help.classList.remove('collapsed');
    window.clearTimeout(this.helpTimer);
    this.helpTimer = window.setTimeout(() => help.classList.add('collapsed'), ms);
  }

  onBattle(on: boolean) {
    this.syncBattle();
    this.flashHelp(3000);
    if (on) {
      this.toast('Battle started', isTouch ? 'Use the red fire button and the grenade button. Stations are safe zones.' : 'Click the world to aim · LMB shoot · hold RMB to use the scope · G grenade · Esc frees the mouse.', '#ff7a5c', 5000);
    } else {
      this.toast('Game stopped', 'Enemies are gone — explore the portfolio in peace.', '#7fd6c2', 3000);
      this.root.classList.remove('ghost');
      $('.ghost-banner', this.root).hidden = true;
    }
  }

  onScope(on: boolean) {
    this.root.classList.toggle('scoped', on);
    $('.reticle', this.root).hidden = on || !(this.exp.battle && this.exp.input.locked && this.exp.combat.playerAlive);
  }

  onPointerLock(locked: boolean) {
    this.syncBattle();
    const reticle = $('.reticle', this.root);
    reticle.hidden = !(locked && this.exp.battle && this.exp.combat.playerAlive);
  }

  private syncBattle() {
    if (!this.exp) return;
    const on = this.exp.battle;
    this.root.classList.toggle('battle', on);
    const btn = $('.battle-btn', this.root);
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
    btn.querySelector('span')!.textContent = on ? 'Stop game' : 'Start battle';
    $('.help-mode', this.root).textContent = on ? 'Battle' : 'Explore';
    $('.aim-hint', this.root).hidden = !(on && !isTouch && !this.exp.input.locked && this.entered && this.exp.combat.playerAlive);
    const touch = this.root.querySelector<HTMLElement>('.touch-controls');
    if (touch) touch.classList.toggle('armed', on);
  }

  // ------------------------------------------------------------------ combat HUD

  onPlayerHealth(hp: number, max: number) {
    const f = hp / max;
    const bar = $('.hp-bar i', this.root);
    bar.style.transform = `scaleX(${f})`;
    bar.style.background = f > 0.5 ? 'linear-gradient(90deg,#5fd68a,#b6f08a)' : f > 0.25 ? 'linear-gradient(90deg,#f2b35c,#ffd27a)' : 'linear-gradient(90deg,#ff4d3d,#ff8a6b)';
    $('.hp-num', this.root).textContent = String(Math.ceil(hp));
    this.root.querySelector('.combat-hud')?.classList.toggle('low', f <= 0.25 && hp > 0);
  }

  onGrenades(count: number) {
    $('.grenades b', this.root).textContent = String(count);
  }

  onEnemies(alive: number) {
    $('.enemies b', this.root).textContent = String(alive);
  }

  onKill(alive: number, total: number) {
    this.onEnemies(alive);
    const el = $('.enemies', this.root);
    if (!reducedMotion) gsap.fromTo(el, { scale: 1.5 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    if (alive > 0) this.toast('Enemy down', `${alive} of ${total} outposts still active.`, '#ff7a5c', 2200);
  }

  onPlayerHurt() {
    const v = $('.damage-vignette', this.root);
    gsap.fromTo(v, { opacity: 0.85 }, { opacity: 0, duration: 0.6, ease: 'power2.out' });
  }

  onPlayerDeath() {
    $('.reticle', this.root).hidden = true;
    this.root.classList.remove('combat-near');
    window.setTimeout(() => {
      this.root.classList.add('ghost');
      const banner = $('.ghost-banner', this.root);
      banner.hidden = false;
      if (!reducedMotion) gsap.fromTo(banner, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
    }, 2400);
  }

  onPickup(kind: 'health' | 'grenade') {
    this.toast(kind === 'health' ? '+40 Health' : '+2 Grenades', kind === 'health' ? 'Patched up and ready.' : 'Press G or right-click to throw.', kind === 'health' ? '#5fd68a' : '#ffd27a', 1800);
  }

  onAllCleared() {
    this.toast('Valley secured ✦', 'All 7 outposts cleared. The whole world is yours to explore.', '#ffd27a', 7000);
    this.celebrate();
  }

  onCombatState(state: { near: boolean; safe: boolean; aimingEnemy: boolean }) {
    const reticle = $('.reticle', this.root);
    reticle.hidden = !this.exp.battle || !this.exp.input.locked || !this.exp.combat.playerAlive;
    reticle.classList.toggle('on-enemy', state.aimingEnemy);
    this.root.classList.toggle('combat-near', state.near);
    $('.safe-badge', this.root).hidden = !state.safe;
  }

  onQualityChange(level: QualityLevel, reason: 'lower' | 'restore' = 'lower') {
    if (reason === 'restore') this.toast('Graphics restored', `Back to ${level} quality — this device has room to spare.`, '#9fe0b8');
    else this.toast('Graphics adjusted', `Switched to ${level} quality for smoother performance.`, '#9fb8ff');
    this.syncQuality();
    this.syncUiWeight(level);
  }

  /** Rounds left in the magazine (and the reloading state). */
  onAmmo(ammo: number, magazine: number, reloading: boolean) {
    const el = $('.ammo', this.root);
    el.querySelector('b')!.textContent = reloading ? '--' : String(ammo);
    el.querySelector('small')!.textContent = `/${magazine}`;
    el.classList.toggle('reloading', reloading);
    el.classList.toggle('empty', !reloading && ammo <= 5);
    this.root.classList.toggle('reloading', reloading);
  }

  /** Crosshair feedback: a tick for a hit, a red tick for a kill, plus recoil bloom. */
  onShot(hit: 'enemy' | 'kill' | 'barrel' | 'miss') {
    const reticle = $('.reticle', this.root);
    reticle.classList.add('fired');
    window.setTimeout(() => reticle.classList.remove('fired'), 90);
    if (hit === 'miss') return;
    const mark = $('.hitmark', this.root);
    mark.classList.toggle('kill', hit === 'kill');
    mark.classList.remove('show');
    void mark.offsetWidth; // restart the animation
    mark.classList.add('show');
  }

  onKey(code: string) {
    if (!this.entered) {
      if (code === 'Enter' && !$('.enter', this.root).hidden) this.enter(true);
      return;
    }
    if (code === 'Escape') {
      if (!$('#classic', this.root).hidden) this.closeClassic();
      else if (this.anyModalOpen()) this.closeModals();
      else if (this.panelOpen) this.closePanel();
      return;
    }
    if (!$('#classic', this.root).hidden || this.anyModalOpen()) return;
    switch (code) {
      case 'KeyE':
      case 'Enter':
        if (this.panelOpen && (!this.active || this.panelKey === this.keyFor(this.active))) this.closePanel();
        else this.interact();
        break;
      case 'KeyM':
        this.openModal('#map-modal');
        break;
      case 'KeyT':
        this.handleAction('time');
        break;
      case 'KeyH':
        this.toggleHelp();
        break;
      case 'KeyP':
        this.openClassic();
        break;
      case 'KeyB':
        this.handleAction('battle');
        break;
    }
  }

  // ------------------------------------------------------------------ panel

  private keyFor(item: Interactable) {
    return item.projectId ? `project:${item.projectId}` : item.zone;
  }

  private interact() {
    const item = this.active;
    if (!item) return;
    this.openPanel(item.zone, item.projectId, { x: item.x, z: item.z, r: item.radius });
  }

  openPanel(section: string, projectId?: string, anchor?: { x: number; z: number; r: number }) {
    const panel = $('#panel', this.root);
    const body = $('.panel-body', panel);
    const key = projectId ? `project:${projectId}` : section;
    if (this.panelOpen && this.panelKey === key) return;
    this.panelKey = key;
    if (anchor) this.panelAnchor = anchor;
    else if (!this.panelOpen) {
      const p = this.exp.player.position;
      this.panelAnchor = { x: p.x, z: p.z, r: 4 };
    }

    const meta = sectionMeta[section];
    if (projectId) {
      const index = projects.findIndex((p) => p.id === projectId);
      const project = projects[index];
      $('.panel-eyebrow', panel).textContent = `Project Grove · ${index + 1} of ${projects.length}`;
      $('.panel-title', panel).textContent = project.name;
      body.innerHTML = projectDetailHTML(projectId);
    } else {
      $('.panel-eyebrow', panel).textContent = meta.eyebrow;
      $('.panel-title', panel).textContent = meta.title;
      body.innerHTML = meta.render();
    }
    body.scrollTop = 0;
    panel.style.setProperty('--accent', projectId ? projects.find((p) => p.id === projectId)!.accent : zoneById[section as ZoneId]?.color ?? '#f2b35c');

    const wasOpen = this.panelOpen;
    this.panelOpen = true;
    this.root.classList.add('panel-open');
    this.syncPrompt();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    this.exp.audio.chime('open');
    this.exp.emote('Interact');
    if (!reducedMotion) {
      if (!wasOpen) gsap.fromTo(panel, { xPercent: window.innerWidth < 760 ? 0 : 8, yPercent: window.innerWidth < 760 ? 12 : 0, opacity: 0 }, { xPercent: 0, yPercent: 0, opacity: 1, duration: 0.6, ease: 'power3.out' });
      gsap.from(panel.querySelectorAll('.panel-head > div, .panel-body > *'), { y: 18, opacity: 0, stagger: 0.05, duration: 0.55, ease: 'power3.out', delay: wasOpen ? 0 : 0.1 });
      gsap.from(panel.querySelectorAll('.chip'), { opacity: 0, scale: 0.9, stagger: 0.008, duration: 0.3, delay: 0.3 });
    }
    $('.panel-close', panel).focus({ preventScroll: true });
  }

  closePanel() {
    if (!this.panelOpen) return;
    const panel = $('#panel', this.root);
    this.panelOpen = false;
    this.panelKey = '';
    this.panelAnchor = null;
    this.root.classList.remove('panel-open');
    this.syncPrompt();
    panel.setAttribute('aria-hidden', 'true');
    if (reducedMotion) panel.classList.remove('open');
    else
      gsap.to(panel, {
        opacity: 0,
        xPercent: window.innerWidth < 760 ? 0 : 6,
        yPercent: window.innerWidth < 760 ? 10 : 0,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: () => {
          if (!this.panelOpen) panel.classList.remove('open');
          gsap.set(panel, { clearProps: 'opacity,transform' });
        },
      });
    (document.activeElement as HTMLElement)?.blur();
  }

  // ------------------------------------------------------------------ travel

  async travel(id: ZoneId) {
    this.closeModals();
    this.closePanel();
    const fade = $('#fade', this.root);
    this.exp.audio.chime('travel');
    this.exp.input.enabled = false;
    await gsap.to(fade, { opacity: 1, duration: reducedMotion ? 0.1 : 0.45, ease: 'power2.in' });
    this.exp.teleportToZone(id);
    await new Promise((r) => setTimeout(r, 120));
    await gsap.to(fade, { opacity: 0, duration: reducedMotion ? 0.1 : 0.7, ease: 'power2.out' });
    this.exp.input.enabled = true;
    const zn = zoneById[id];
    this.openPanel(id, undefined, { x: zn.x + zn.arrive[0], z: zn.z + zn.arrive[1], r: 6 });
  }

  // ------------------------------------------------------------------ modals

  private anyModalOpen() {
    return [...this.root.querySelectorAll<HTMLElement>('.modal')].some((m) => !m.hidden);
  }

  private openModal(sel: string) {
    this.closeModals();
    const m = $(sel, this.root);
    m.hidden = false;
    this.exp.input.enabled = false;
    this.exp.paused = true;
    if (sel === '#settings-modal') this.syncQuality();
    if (sel === '#map-modal') this.map.resetView();
    if (!reducedMotion) {
      gsap.fromTo(m, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo(m.querySelector('.modal-card'), { y: 24, scale: 0.97 }, { y: 0, scale: 1, duration: 0.5, ease: 'power3.out' });
      if (sel === '#map-modal') gsap.fromTo(m.querySelectorAll('.map-marker .dot'), { scale: 0 }, { scale: 1, stagger: 0.05, duration: 0.5, ease: 'back.out(2.5)', delay: 0.15, overwrite: true, clearProps: 'transform' });
    }
    m.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
  }

  private closeModals() {
    this.exp.paused = !$('#classic', this.root).hidden;
    let any = false;
    this.root.querySelectorAll<HTMLElement>('.modal').forEach((m) => {
      if (!m.hidden) any = true;
      m.hidden = true;
    });
    if (any && this.exp && $('#classic', this.root).hidden) this.exp.input.enabled = true;
  }

  private bindSettings() {
    const seg = (name: string, handler: (v: string) => void) => {
      const el = $(`[data-setting="${name}"]`, this.root);
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!b) return;
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        handler(b.dataset.value!);
      });
    };
    seg('quality', (v) => {
      this.exp.setQuality(v as QualityLevel | 'auto');
      this.syncQuality();
    });
    seg('time', (v) => {
      this.exp.setTime(v as TimeOfDay);
      this.syncTime(v as TimeOfDay);
    });
    seg('camera', (v) => (this.exp.rig.follow = v === 'follow'));
    this.root.querySelector<HTMLElement>('[data-setting="camera"] [data-value="free"]')?.classList.add('on');
    $<HTMLInputElement>('#sens', this.root).addEventListener('input', (e) => (this.exp.rig.sensitivity = +(e.target as HTMLInputElement).value));
    $<HTMLInputElement>('#vol', this.root).addEventListener('input', (e) => this.exp.audio.setVolume(+(e.target as HTMLInputElement).value));
  }

  private syncQuality() {
    const current = this.exp.autoQuality ? 'auto' : this.exp.quality;
    this.root.querySelectorAll<HTMLElement>('[data-setting="quality"] button').forEach((b) => b.classList.toggle('on', b.dataset.value === current));
    $('.setting-note', this.root).textContent = `Rendering at ${this.exp.quality} quality · ${this.exp.grass.bladeCount.toLocaleString()} grass blades in the world`;
  }

  private syncTime(t: TimeOfDay) {
    $('[data-action="time"]', this.root).innerHTML = TIME_ICON[t];
    this.root.querySelectorAll<HTMLElement>('[data-setting="time"] button').forEach((b) => b.classList.toggle('on', b.dataset.value === t));
  }

  private syncSound() {
    const muted = this.exp.audio.isMuted || !this.exp.audio.ctx;
    const b = $('[data-action="sound"]', this.root);
    b.innerHTML = muted ? icons.mute : icons.sound;
    b.classList.toggle('muted', muted);
  }

  // ------------------------------------------------------------------ classic view

  openClassic() {
    const el = $('#classic', this.root);
    if (!el.hidden) return;
    this.bindPortrait();
    this.closeModals();
    this.closePanel();
    el.hidden = false;
    if (this.exp) {
      this.exp.input.enabled = false;
      this.exp.paused = true;
    }
    this.classic.open();
  }

  private closeClassic() {
    if (this.exp) this.exp.paused = false;
    const el = $('#classic', this.root);
    this.classic.close(() => {
      el.hidden = true;
      if (this.exp && this.entered) this.exp.input.enabled = true;
    });
  }

  // ------------------------------------------------------------------ hud helpers

  private toggleHelp() {
    this.root.querySelector('.help')?.classList.toggle('collapsed');
  }

  toast(title: string, body: string, color = '#f2b35c', duration = 3800) {
    const stack = $('.toasts', this.root);
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.setProperty('--c', color);
    t.innerHTML = `<span class="toast-mark">✦</span><div><strong>${title}</strong><p>${body}</p></div>`;
    stack.appendChild(t);
    if (stack.children.length > 3) stack.firstElementChild?.remove();
    gsap.fromTo(t, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
    gsap.to(t, { opacity: 0, y: -10, duration: 0.5, delay: duration / 1000, onComplete: () => t.remove() });
  }

  private celebrate() {
    if (reducedMotion) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    this.root.appendChild(layer);
    const colors = zones.map((z) => z.color);
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.background = colors[i % colors.length];
      layer.appendChild(p);
      gsap.fromTo(
        p,
        { x: window.innerWidth / 2, y: window.innerHeight * 0.35, rotate: 0, opacity: 1 },
        {
          x: window.innerWidth / 2 + (Math.random() - 0.5) * window.innerWidth * 0.9,
          y: window.innerHeight * (0.6 + Math.random() * 0.5),
          rotate: Math.random() * 720,
          opacity: 0,
          duration: 2 + Math.random() * 1.5,
          ease: 'power2.out',
        },
      );
    }
    window.setTimeout(() => layer.remove(), 4000);
  }

  private bindTouch() {
    if (!isTouch) return;
    const joy = $('.joystick', this.root);
    const knob = $('.knob', joy);
    let id: number | null = null;
    let cx = 0, cy = 0;
    const R = 48;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.exp.input.joystick.x = dx / R;
      this.exp.input.joystick.y = -dy / R;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.exp.input.joystick.x = 0;
      this.exp.input.joystick.y = 0;
    };
    joy.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      joy.setPointerCapture(e.pointerId);
      move(e);
    });
    joy.addEventListener('pointermove', move);
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
    const fire = $('.fire-btn', this.root);
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fire.setPointerCapture(e.pointerId);
      this.exp.input.touchFiring = true;
    });
    const stopFire = () => (this.exp.input.touchFiring = false);
    fire.addEventListener('pointerup', stopFire);
    fire.addEventListener('pointercancel', stopFire);
    const scopeBtn = $('.scope-btn', this.root);
    scopeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.exp.input.touchScoping = !this.exp.input.touchScoping;
      scopeBtn.classList.toggle('on', this.exp.input.touchScoping);
    });
    $('.grenade-btn', this.root).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.exp.input.press('TouchGrenade');
    });
    $('.jump-btn', this.root).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.exp.input.press('TouchJump');
    });
  }
}
