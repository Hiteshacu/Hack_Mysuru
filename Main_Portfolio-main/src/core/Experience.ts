import * as THREE from 'three';
import gsap from 'gsap';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

import { Terrain } from '../world/Terrain';
import { Colliders } from '../world/Colliders';
import { Grass } from '../world/Grass';
import { Vegetation } from '../world/Vegetation';
import { Horizon } from '../world/Horizon';
import { Water } from '../world/Water';
import { Environment, type TimeOfDay } from '../world/Environment';
import { Labels } from '../world/Labels';
import { Landmarks, type Interactable } from '../world/Landmarks';
import { Particles } from '../world/Particles';
import { lakes, PLAY_RADIUS, SPAWN, WATER_LEVEL, WORLD_SIZE, zoneById, zones, type ZoneDef, type ZoneId } from '../world/layout';
import { AnimatedCharacter } from '../player/Character';
import { Assets } from './Assets';
import { Village } from '../world/Village';
import { Combat, type CombatEvents } from '../combat/Combat';
import { Player } from '../player/Player';
import { CameraRig } from '../player/CameraRig';
import { Input } from './Input';
import { AudioEngine } from './Audio';
import { QUALITY, type QualityLevel } from './Quality';
import { SharpenEffect } from './SharpenEffect';
import { clamp } from '../utils/math';

export interface ExperienceEvents extends CombatEvents {
  onProgress: (progress: number, label: string) => void;
  onCombatState: (state: { near: boolean; safe: boolean; aimingEnemy: boolean }) => void;
  onBattle: (on: boolean) => void;
  onPointerLock: (locked: boolean) => void;
  onScope: (on: boolean) => void;
  onInteractable: (item: Interactable | null) => void;
  onDiscover: (zone: ZoneDef, discovered: number, total: number) => void;
  onZone: (zone: ZoneDef | null) => void;
  onFirstMove: () => void;
  onQualityChange: (level: QualityLevel, reason: 'lower' | 'restore') => void;
  onKey: (code: string) => void;
  /** The browser/GPU dropped the WebGL context (driver reset, out of GPU memory...). */
  onContextLost: () => void;
  /** Rendering hit repeated errors and stopped. */
  onFatal: (err: unknown) => void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

// Adaptive quality thresholds. Below STRUGGLING the world steps down; it only steps back up once it
// is comfortably above COMFORTABLE. The gap between them is deliberate: without it, a device sitting
// near the line slowly loses quality over a session and never gets it back.
const STRUGGLING_FPS = 30;
const COMFORTABLE_FPS = 52;

export class Experience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1400);
  readonly input: Input;
  readonly audio = new AudioEngine();
  composer!: EffectComposer;
  private renderPass!: RenderPass;
  private effectPass!: EffectPass;
  private smaaPass!: EffectPass;
  private smaaEnabled = false;
  private sharpenPass!: EffectPass;
  private sharpenEnabled = true;
  private aoPass!: N8AOPostPass;
  private aoEnabled = false;
  horizon!: Horizon;
  battle = false;
  /** Set when the browser compiles shaders synchronously (Firefox): skip the long aerial intro. */
  quickStart = false;
  /** Set while a full-screen overlay covers the world: skip updates and rendering entirely. */
  paused = false;
  compiled: Promise<void> = Promise.resolve();
  /** Satellite-style top-down render of the real world, used by the minimap and the travel map. */
  mapImage: Promise<HTMLCanvasElement | null> = Promise.resolve(null);
  private isCompiled = false;
  private emoteUntil = 0;
  private bloom!: BloomEffect;

  terrain!: Terrain;
  colliders = new Colliders();
  grass!: Grass;
  vegetation!: Vegetation;
  water!: Water;
  env!: Environment;
  labels = new Labels();
  landmarks!: Landmarks;
  particles!: Particles;
  player!: Player;
  character!: AnimatedCharacter;
  assets = new Assets();
  village!: Village;
  combat!: Combat;
  private aimHold = 0;
  private stepTimer = 0;
  private dustTimer = 0;
  private combatState = { near: false, safe: false, aimingEnemy: false };
  private raycaster = new THREE.Raycaster();
  rig!: CameraRig;

  quality: QualityLevel = 'high';
  autoQuality = true;
  started = false;
  discovered = new Set<ZoneId>();
  private activeItem: Interactable | null = null;
  private currentZone: ZoneDef | null = null;
  private elapsed = 0;
  private lastTime = 0;
  private moved = false;
  private marker!: THREE.Mesh;
  private blob!: THREE.Mesh;
  private frameTimes: number[] = [];
  private qualityCheckAt = 0;
  private raf = 0;
  /** Dynamic resolution: scales the pixel ratio down on slow GPUs before dropping a quality tier. */
  private renderScale = 1;
  /** Best tier this device is allowed back up to (what it was detected/asked for). */
  private ceiling: QualityLevel = 'high';
  private downgrades = 0;
  private goodWindows = 0;
  private frameErrors = 0;
  private lastError = '';
  private stopped = false;
  /** Chrome-family browsers compile shaders on a background thread; Firefox does not. */
  private parallelCompile = true;

  constructor(canvas: HTMLCanvasElement, private events: ExperienceEvents) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.parallelCompile = this.renderer.extensions.has('KHR_parallel_shader_compile');

    this.input = new Input(canvas);
    this.input.onTap = (x, y) => this.handleTap(x, y);
    this.input.onSecondary = () => this.input.press('KeyG');
    this.input.onLockChange = (locked) => {
      if (this.rig) this.rig.locked = locked;
      this.events.onPointerLock(locked);
    };
    this.input.onKey = (code) => this.events.onKey(code);

    window.addEventListener('resize', () => this.resize());

    // Never leave a frozen canvas: stop cleanly when the GPU context is lost and let the UI recover.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      this.events.onContextLost();
    });
  }

  private stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }

  // ------------------------------------------------------------------ loading

  async load(quality: QualityLevel) {
    this.quality = quality;
    this.ceiling = quality;
    const step = async (p: number, label: string) => {
      this.events.onProgress(p, label);
      await nextFrame();
    };

    await step(0.02, 'Loading 3D models');
    await this.assets.load((p) => this.events.onProgress(0.02 + p * 0.3, 'Loading 3D models'));

    await step(0.34, 'Shaping the valley');
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);

    await step(0.42, 'Building the landmarks');
    this.landmarks = new Landmarks(this.terrain, this.colliders, this.labels, this.assets);
    this.scene.add(this.landmarks.group, this.labels.group);
    this.village = new Village(this.terrain, this.colliders, this.assets, this.labels);
    this.scene.add(this.village.group);

    await step(0.52, 'Planting the forest');
    this.vegetation = new Vegetation(this.terrain, this.colliders, this.assets, quality === 'low', this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.vegetation.group);
    this.horizon = new Horizon((x, z) => this.terrain.heightAt(Math.max(-129, Math.min(129, x)), Math.max(-129, Math.min(129, z))));
    this.scene.add(this.horizon.mesh);

    // Keep grass out from under bushes, rocks, trunks and buildings so props sit on top of the meadow.
    for (const b of this.vegetation.grassBlockers) this.terrain.blockGrass(b.x, b.z, b.r);
    for (const c of this.colliders.circles) if (c.r > 0.9) this.terrain.blockGrass(c.x, c.z, c.r * 0.9);
    for (const b of [...this.colliders.boxes, ...this.colliders.floors]) this.terrain.blockGrassBox(b.x, b.z, b.hw, b.hd, b.rot);
    this.terrain.finalizeGrassMask();

    await step(0.62, 'Growing the meadow');
    // Lush everywhere on every tier: slower devices trim draw distance / LOD instead of thinning the meadow.
    this.grass = new Grass(this.terrain, this.colliders, quality === 'low' ? 9 : 12, quality === 'low' ? 45000 : 92000);
    this.grass.prebuild(SPAWN.x, SPAWN.z, 42);
    this.scene.add(this.grass.group);

    await step(0.72, 'Filling the lakes');
    this.water = new Water(this.terrain);
    this.scene.add(this.water.group);

    await step(0.76, 'Painting the sky');
    this.env = new Environment(this.scene);
    this.env.onSettled = () => this.refreshEnvironment();

    await step(0.8, 'Waking the fireflies');
    this.particles = new Particles(this.terrain);
    this.scene.add(this.particles.mesh);

    // Player: Quaternius "Adventurer" (CC0) with the Toon Shooter AK attached to the right hand.
    const rifle = this.assets.gltf.rifle.scene.getObjectByName('AK')!;
    this.character = new AnimatedCharacter(this.assets.gltf.adventurer, { weapon: 'AK', height: 1.78, attach: { object: rifle, bone: 'Index1.R' } });
    this.character.play('Idle');
    this.scene.add(this.character.root);
    this.player = new Player(this.terrain, this.colliders);
    this.player.teleport(SPAWN.x, SPAWN.z, SPAWN.facing);
    this.rig = new CameraRig(this.camera, this.terrain);
    this.rig.clampCamera = (focus, pos) => this.landmarks.clampToCabin(focus, pos);
    this.rig.snap(this.player.position, 0);
    this.createHelpers();

    await step(0.84, 'Deploying the outposts');
    this.combat = new Combat(this.assets, this.terrain, this.colliders, this.village, this.audio, this.events, {
      position: this.player.position,
      char: this.character,
    });
    this.scene.add(this.combat.group);

    this.buildComposer();
    this.applyQuality(quality);
    this.resize();

    this.events.onEnemies(this.combat.aliveCount, this.combat.total);
    this.events.onPlayerHealth(this.combat.hp, 100);
    this.events.onGrenades(this.combat.grenades);
    // Every visit starts in Explore mode; the battle is opt-in from the top bar.
    this.setBattle(false, false);
    await step(0.92, 'Lighting the lanterns');
    this.updateWorld(0, 0);
    this.introCamera(0);
    // Shaders compile in the background (parallel where supported) so the Enter button appears right away;
    // rendering waits for them so the page never freezes on a synchronous compile.
    this.mapImage = new Promise((r) => (this.resolveMap = r));
    this.compiled = this.warmUp(quality);
    await step(1, 'Ready');

    this.lastTime = performance.now();
    this.loop();
  }

  /**
   * Shader warm-up. Chrome compiles programs in parallel on the GPU thread (KHR_parallel_shader_compile),
   * but Firefox compiles synchronously — compiling the whole scene at once froze the page for seconds.
   * So without that extension we compile one part of the world per frame, which keeps the loading screen
   * animating and reports real progress.
   */
  private warmSize: { w: number; h: number; shadowSize: number } | null = null;
  private warming = false;

  private resizeShadowMap(size: number) {
    const shadow = this.env.sun.shadow;
    shadow.mapSize.set(size, size);
    shadow.map?.dispose();
    shadow.map = null;
  }

  private async warmUp(quality: QualityLevel) {
    const parallel = this.parallelCompile;
    // Battle props start hidden; reveal them for the warm-up so their shaders are ready on demand.
    const battleHidden: THREE.Object3D[] = [];
    this.combat.group.traverse((o) => {
      if (!o.visible) {
        o.visible = true;
        battleHidden.push(o);
      }
    });
    this.quickStart = !parallel;
    // Hold the idle intro camera still: warm-up frames must render the spawn view.
    this.warming = true;
    // Warm-up renders happen from the spawn view; the intro camera sees the whole valley at once,
    // which would mean compiling every shader in the world up front.
    const introPos = this.camera.position.clone();
    const introQuat = this.camera.quaternion.clone();
    this.rig.snap(this.player.position, 0);
    this.rig.update(0.016, this.player.position, this.player.facing, 0, { dragX: 0, dragY: 0, wheel: 0, lastDragTime: -10 }, 0);
    // The sky-derived environment map has to be on the materials *before* they are compiled,
    // otherwise assigning it later invalidates every program and they all compile twice.
    this.refreshEnvironment();
    try {
      if (parallel) {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        const w = window.innerWidth, h = window.innerHeight;
        const shadowSize = this.env.sun.shadow.mapSize.x;
        this.renderer.setSize(320, 180, false);
        this.composer.setSize(320, 180, false);
        this.resizeShadowMap(512);
        // Drivers like Firefox's compile a shader when it is first *drawn*, not when it is linked,
        // so each part of the world is drawn on its own frame: same total work, but the page keeps
        // breathing and the progress bar keeps moving instead of freezing for several seconds.
        const parts: THREE.Object3D[] = [
          this.terrain.mesh, this.env.sky, this.grass.group, this.character.root, this.landmarks.group,
          this.village.group, this.vegetation.group, this.horizon.mesh, this.water.group, this.particles.mesh,
          this.combat.group, this.labels.group,
        ];
        for (let i = 0; i < parts.length; i++) {
          this.renderer.compile(parts[i], this.camera, this.scene);
          this.events.onProgress(0.88 + ((i + 1) / parts.length) * 0.06, 'Warming up the graphics');
          await nextFrame();
        }
        this.warmSize = { w, h, shadowSize };
      }
    } catch (err) {
      console.warn('Shader warm-up incomplete', err);
    }
    const firstEnemy = this.combat.enemies[0];
    if (firstEnemy) {
      const camPos = this.camera.position.clone(), camQuat = this.camera.quaternion.clone();
      this.camera.position.set(firstEnemy.position.x, firstEnemy.position.y + 2.2, firstEnemy.position.z + 7);
      this.camera.lookAt(firstEnemy.position.x, firstEnemy.position.y + 1.2, firstEnemy.position.z);
      this.camera.updateMatrixWorld();
      await nextFrame();
      const prevTarget = this.renderer.getRenderTarget();
      try {
        this.renderer.setRenderTarget(this.composer.inputBuffer);
        this.renderer.render(this.scene, this.camera);
      } catch {
        /* warm-up frame only */
      } finally {
        this.renderer.setRenderTarget(prevTarget);
      }
      this.camera.position.copy(camPos);
      this.camera.quaternion.copy(camQuat);
      this.camera.updateMatrixWorld();
    }

    // Post-processing shaders only compile when a pass first runs, and each one can take a second
    // or more on browsers without parallel compilation — so warm them one pass per frame.
    const passes = this.composer.passes;
    const wanted = passes.map((p) => p.enabled);
    if (!parallel) passes.forEach((p) => (p.enabled = false));
    for (let i = 0; i < passes.length; i++) {
      passes[i].enabled = wanted[i];
      this.events.onProgress(0.94 + ((i + 1) / passes.length) * 0.06, 'Warming up the graphics');
      await nextFrame();
      try {
        this.composer.render(0.016);
      } catch (err) {
        console.warn('Warm-up frame failed', err);
      }
      if (parallel) break; // Chrome compiles everything in one cheap frame
    }
    passes.forEach((p, i) => (p.enabled = wanted[i]));
    if (this.warmSize) {
      this.resizeShadowMap(this.warmSize.shadowSize);
      this.renderer.setSize(this.warmSize.w, this.warmSize.h, false);
      this.composer.setSize(this.warmSize.w, this.warmSize.h, false);
      this.warmSize = null;
    }
    this.camera.position.copy(introPos);
    this.camera.quaternion.copy(introQuat);
    battleHidden.forEach((o) => (o.visible = false));
    this.warming = false;
    this.isCompiled = true;
    this.events.onProgress(1, 'Ready');
    // The map render is never on the critical path: the painted preview is used until it arrives.
    this.scheduleMapBake(quality);
  }

  private resolveMap: (c: HTMLCanvasElement | null) => void = () => undefined;

  private scheduleMapBake(quality: QualityLevel) {
    const run = () => {
      let map: HTMLCanvasElement | null = null;
      try {
        if (!this.stopped && !this.renderer.getContext().isContextLost()) {
          map = this.bakeMap(quality === 'high' ? 1280 : quality === 'medium' ? 1024 : 768);
        }
      } catch (err) {
        console.warn('Map render skipped', err);
      }
      this.resolveMap(map);
      this.pausePerfWatch(2);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(run, { timeout: 4000 });
    else window.setTimeout(run, 1200);
  }

  private createHelpers() {
    const ringMat = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0, depthWrite: false });
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2), ringMat);
    this.marker.renderOrder = 5;
    this.scene.add(this.marker);

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);
  }

  private buildComposer() {
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new BloomEffect({ intensity: 0.3, luminanceThreshold: 0.9, luminanceSmoothing: 0.18, mipmapBlur: true, radius: 0.6 });
    this.effectPass = new EffectPass(
      this.camera,
      this.bloom,
      new HueSaturationEffect({ saturation: 0.05 }),
      new BrightnessContrastEffect({ contrast: 0.08 }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new VignetteEffect({ offset: 0.35, darkness: 0.32 }),
    );
    this.smaaPass = new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    this.sharpenPass = new EffectPass(this.camera, new SharpenEffect(0.5));
    // Screen-space ambient occlusion (N8AO): contact shadows in grass, under trees, props and buildings.
    this.aoPass = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    Object.assign(this.aoPass.configuration, {
      aoRadius: 1.7,
      distanceFalloff: 0.8,
      intensity: 1.4,
      aoSamples: 8,
      denoiseSamples: 4,
      denoiseRadius: 8,
      gammaCorrection: false,
      halfRes: true,
      depthAwareUpsampling: false,
    });
    this.setPasses(true, true, true);
  }

  /**
   * Renders the actual 3D world straight down with an orthographic camera (trees, shadows, water,
   * buildings, hills) and tone-maps it into a canvas — a real "satellite" image for the maps.
   */
  /**
   * Renders a square patch of the world from straight above. `half` is the patch radius in metres
   * (the whole map by default) and `size` the pixel resolution of the result.
   */
  bakeMap(size: number, centerX = 0, centerZ = 0, half = WORLD_SIZE / 2) {
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1200);
    cam.position.set(centerX, 500, centerZ);
    cam.up.set(0, 0, -1);
    cam.lookAt(centerX, 0, centerZ);
    cam.updateMatrixWorld();
    const detail = half < WORLD_SIZE / 2 - 0.5;

    // Half float keeps the highlights without needing EXT_float_blend (which some GPUs lack).
    const halfOk = this.renderer.extensions.has('EXT_color_buffer_half_float') || this.renderer.extensions.has('EXT_color_buffer_float');
    const rt = new THREE.WebGLRenderTarget(size, size, { type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true });

    // Hide everything that isn't part of the landscape, remove haze and fit the sun's shadow to the whole map.
    const hidden = [this.env.sky, this.env.starsMesh, this.labels.group, this.particles.mesh, this.combat.group, this.character.root, this.marker, this.blob, this.grass.group];
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const fogDensity = this.env.fog.density;
    this.env.fog.density = 0;
    this.vegetation.uniforms.uOcclude.value = 0;
    const sun = this.env.sun;
    const hemi = this.env.hemi;
    const sc = sun.shadow.camera;
    const saved = {
      l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, n: sc.near, f: sc.far,
      pos: sun.position.clone(), target: sun.target.position.clone(),
      sunColor: sun.color.clone(), sunIntensity: sun.intensity,
      hemiIntensity: hemi.intensity, hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor.clone(),
    };
    const surveyDir = new THREE.Vector3(0.32, 0.93, 0.18).normalize();
    sun.color.set('#fff4e6');
    sun.intensity = 3.1;
    hemi.intensity = 1.05;
    hemi.color.set('#cfe2fb');
    hemi.groundColor.set('#7d6b46');
    const shadowHalf = Math.min(190, half * 1.45 + 20);
    Object.assign(sc, { left: -shadowHalf, right: shadowHalf, top: shadowHalf, bottom: -shadowHalf, near: 1, far: 1000 });
    sc.updateProjectionMatrix();
    sun.target.position.set(centerX, 0, centerZ);
    sun.target.updateMatrixWorld();
    sun.position.set(centerX, 0, centerZ).addScaledVector(surveyDir, 420);
    sun.updateMatrixWorld();

    const prevTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.render(this.scene, cam);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      hidden.forEach((o, i) => (o.visible = vis[i]));
      this.env.fog.density = fogDensity;
      Object.assign(sc, { left: saved.l, right: saved.r, top: saved.t, bottom: saved.b, near: saved.n, far: saved.f });
      sc.updateProjectionMatrix();
      sun.position.copy(saved.pos);
      sun.target.position.copy(saved.target);
      sun.target.updateMatrixWorld();
      sun.color.copy(saved.sunColor);
      sun.intensity = saved.sunIntensity;
      hemi.intensity = saved.hemiIntensity;
      hemi.color.copy(saved.hemiSky);
      hemi.groundColor.copy(saved.hemiGround);
    }

    const pixels = halfOk ? new Uint16Array(size * size * 4) : new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    rt.dispose();
    // Half-float bits -> float, through a lookup table (one entry per possible 16-bit value).
    let halfLUT: Float32Array | null = null;
    if (halfOk) {
      halfLUT = new Float32Array(65536);
      for (let h = 0; h < 65536; h++) {
        const sign = h >> 15 ? -1 : 1, exp = (h >> 10) & 0x1f, frac = h & 0x3ff;
        halfLUT[h] = exp === 0 ? sign * 2 ** -14 * (frac / 1024) : exp === 31 ? 0 : sign * 2 ** (exp - 15) * (1 + frac / 1024);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const out = img.data;
    const value = halfLUT ? (v: number) => halfLUT![v] : (v: number) => v / 255;
    const contourStep = detail ? 1.5 : 3;
    // sRGB encode through a lookup table — a Math.pow per channel per pixel is the slowest part here.
    const LUT = new Uint8Array(1025);
    for (let i = 0; i <= 1024; i++) {
      const c = i / 1024;
      LUT[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
    }
    const toSRGB = (c: number) => LUT[(c * 1024) | 0];
    const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
    const terrain = this.terrain;
    const step = (half * 2) / size;
    for (let py = 0; py < size; py++) {
      // WebGL rows start at the bottom; the map's +z points down.
      const src = (size - 1 - py) * size;
      const z = centerZ + (py + 0.5) * step - half;
      for (let px = 0; px < size; px++) {
        const i = (src + px) * 4, o = (py * size + px) * 4;
        // three.js ACES filmic (same curve as the post-processing tone mapping)
        const R = value(pixels[i]) / 0.6, G = value(pixels[i + 1]) / 0.6, B = value(pixels[i + 2]) / 0.6;
        const ir = fit(0.59719 * R + 0.35458 * G + 0.04823 * B);
        const ig = fit(0.076 * R + 0.90834 * G + 0.01566 * B);
        const ib = fit(0.0284 * R + 0.13383 * G + 0.83777 * B);
        let cr = Math.min(1, Math.max(0, 1.60475 * ir - 0.53108 * ig - 0.07367 * ib));
        let cg = Math.min(1, Math.max(0, -0.10208 * ir + 1.10813 * ig - 0.00605 * ib));
        let cb = Math.min(1, Math.max(0, -0.00327 * ir - 0.07276 * ig + 1.07602 * ib));
        // Topographic contour lines on the hills (every 3 m), fading out beyond the explorable valley.
        const x = centerX + (px + 0.5) * step - half;
        const h = terrain.heightAt(x, z);
        if (h > 1.2) {
          const band = Math.floor(h / contourStep);
          if (band !== Math.floor(terrain.heightAt(x + step, z) / contourStep) || band !== Math.floor(terrain.heightAt(x, z + step) / contourStep)) {
            const k = band % 5 === 0 ? 0.72 : 0.85;
            cr *= k; cg *= k; cb *= k;
          }
        }
        const rim = detail ? 0 : Math.min(1, Math.max(0, (Math.hypot(x, z) - PLAY_RADIUS) / 30));
        const dim = 1 - rim * 0.35;
        out[o] = toSRGB(cr) * dim;
        out[o + 1] = toSRGB(cg) * dim;
        out[o + 2] = toSRGB(cb) * dim;
        out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Full-resolution render of one patch of the world, for the zoomed travel map. */
  mapDetail(centerX: number, centerZ: number, half: number) {
    if (this.stopped || this.renderer.getContext().isContextLost()) return null;
    this.pausePerfWatch(2);
    try {
      return this.bakeMap(this.quality === 'low' ? 768 : 1024, centerX, centerZ, half);
    } catch (err) {
      console.warn('Map detail render skipped', err);
      return null;
    }
  }

  /** Re-renders the sky into an environment map and applies it to every PBR (glTF) material. */
  refreshEnvironment() {
    const tex = this.env.buildEnvironmentMap(this.renderer);
    const intensity = this.env.state.envIntensity;
    this.scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        if (std.userData.baseEnv === undefined) std.userData.baseEnv = std.envMapIntensity ?? 1;
        const hadEnv = !!std.envMap;
        std.envMap = tex;
        std.envMapIntensity = std.userData.baseEnv * intensity;
        if (!hadEnv) std.needsUpdate = true;
      }
    });
  }

  private setPasses(smaa: boolean, sharpen: boolean, ao: boolean) {
    if (this.smaaEnabled === smaa && this.sharpenEnabled === sharpen && this.aoEnabled === ao && this.composer.passes.length) return;
    this.smaaEnabled = smaa;
    this.sharpenEnabled = sharpen;
    this.aoEnabled = ao;
    this.composer.removeAllPasses();
    this.composer.addPass(this.renderPass);
    if (ao) this.composer.addPass(this.aoPass);
    this.composer.addPass(this.effectPass);
    if (smaa) this.composer.addPass(this.smaaPass);
    if (sharpen) this.composer.addPass(this.sharpenPass);
  }

  // ------------------------------------------------------------------ quality

  applyQuality(level: QualityLevel) {
    this.quality = level;
    const q = QUALITY[level];
    this.applyPixelRatio();
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
      });
    }
    this.env.sun.castShadow = q.shadows;
    if (this.env.sun.shadow.mapSize.x !== q.shadowMap) {
      this.env.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.env.sun.shadow.map?.dispose();
      this.env.sun.shadow.map = null;
    }
    this.grass.setQuality(q.grassDensity, q.grassDistance, q.grassField);
    this.setPasses(q.smaa, q.sharpen, q.ao && this.parallelCompile);
    if (this.aoPass) this.aoPass.configuration.halfRes = q.pixelHalfAO;
    this.bloom.blendMode.opacity.value = q.bloom ? 1 : 0;
    this.blob.visible = !q.shadows;
    this.resize();
  }

  private applyPixelRatio() {
    const q = QUALITY[this.quality];
    const base = Math.min(q.maxPixelRatio, Math.max(window.devicePixelRatio, q.minPixelRatio));
    // Never go below 0.75 so world signs and edges stay readable.
    this.renderer.setPixelRatio(Math.max(0.75, base * this.renderScale));
  }

  setQuality(level: QualityLevel | 'auto') {
    this.renderScale = 1;
    this.downgrades = 0;
    this.goodWindows = 0;
    if (level === 'auto') {
      this.autoQuality = true;
      this.frameTimes = [];
      this.applyQuality(this.quality);
      return;
    }
    // A chosen level is also the ceiling auto mode may climb back to later.
    this.autoQuality = false;
    this.ceiling = level;
    this.applyQuality(level);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h, false);
    if (this.particles) this.particles.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    this.combat?.effects.setPixelScale(h * this.renderer.getPixelRatio());
  }

  // ------------------------------------------------------------------ flow

  async start(withAudio: boolean, skipIntro = false) {
    this.started = true;
    this.audio.start(!withAudio);
    if (skipIntro) {
      this.rig.snap(this.player.position, 0);
      this.qualityCheckAt = this.elapsed + 3;
      return;
    }
    this.rig.cinematic = true;
    const from = this.camera.position.clone();
    const fromLook = new THREE.Vector3(0, 6, 20);
    this.rig.snap(this.player.position, 0);
    const endPos = this.rig.computeDesired(new THREE.Vector3());
    const endLook = this.player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    const curve = new THREE.CatmullRomCurve3([
      from,
      new THREE.Vector3(from.x * 0.4 + 18, 28, from.z * 0.4 + 70),
      new THREE.Vector3(6, 9, SPAWN.z + 16),
      endPos,
    ]);
    const look = new THREE.Vector3();
    const proxy = { t: 0 };
    return new Promise<void>((resolve) => {
      gsap.to(proxy, {
        t: 1,
        duration: 4.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.camera.position.copy(curve.getPoint(proxy.t));
          look.lerpVectors(fromLook, endLook, gsap.parseEase('power1.inOut')(proxy.t));
          this.camera.lookAt(look);
        },
        onComplete: () => {
          this.rig.cinematic = false;
          this.rig.snap(this.player.position, 0);
          this.frameTimes = [];
          this.qualityCheckAt = this.elapsed + 3;
          resolve();
        },
      });
    });
  }

  private introCamera(t: number) {
    const a = t * 0.045 + 0.6;
    this.camera.position.set(Math.sin(a) * 95, 46, 30 + Math.cos(a) * 95);
    this.camera.lookAt(0, 4, 0);
  }

  teleportToZone(id: ZoneId) {
    this.pausePerfWatch(3);
    const zn = zoneById[id];
    const x = zn.x + zn.arrive[0];
    const z = zn.z + zn.arrive[1];
    const facing = Math.atan2(zn.x - x, zn.z - z);
    this.player.teleport(x, z, facing);
    this.rig.snap(this.player.position, facing + Math.PI);
    this.rig.pitch = 0.32;
    this.rig.targetDistance = 9.5;
    this.updateWorld(0, 0);
  }

  setTime(time: TimeOfDay) {
    this.env.setTime(time);
  }

  get interactable() {
    return this.activeItem;
  }

  // ------------------------------------------------------------------ input helpers

  private handleTap(clientX: number, clientY: number) {
    if (!this.started || this.rig.cinematic || !this.input.enabled) return;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let prev = 0;
    for (let t = 0.5; t < 160; t += 0.6) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < this.terrain.heightAt(x, z)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const mx = o.x + d.x * mid, mz = o.z + d.z * mid;
          if (o.y + d.y * mid < this.terrain.heightAt(mx, mz)) hi = mid;
          else lo = mid;
        }
        const px = o.x + d.x * hi, pz = o.z + d.z * hi;
        if (this.terrain.heightAt(px, pz) < WATER_LEVEL - 0.6) return;
        this.player.moveTarget = new THREE.Vector3(px, this.terrain.heightAt(px, pz), pz);
        this.marker.position.copy(this.player.moveTarget).y += 0.08;
        this.marker.scale.setScalar(1.6);
        (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
        this.markFirstMove();
        return;
      }
      prev = t;
    }
  }

  private markFirstMove() {
    if (this.moved) return;
    this.moved = true;
    this.events.onFirstMove();
  }

  private surface(): 'grass' | 'path' | 'stone' | 'water' {
    const p = this.player.position;
    if (this.player.inWater) return 'water';
    if (this.terrain.mask(p.x, p.z, 2) > 0.5) return 'stone';
    if (this.terrain.mask(p.x, p.z, 0) > 0.5) return 'path';
    return 'grass';
  }

  // ------------------------------------------------------------------ loop

  private loop = () => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (this.paused) {
      this.input.endFrame();
      // Coming back from a menu should not count as a slow frame.
      this.pausePerfWatch(1.5);
      return;
    }
    const dt = clamp(rawDt, 0, 1 / 20);
    this.elapsed += dt;

    try {
      if (this.started) this.updateGame(dt);
      else if (!this.warming) this.introCamera(this.elapsed);

      this.updateWorld(this.elapsed, dt);
      if (this.isCompiled) this.composer.render(dt);
      this.frameErrors = 0;
    } catch (err) {
      // Single bad frames are survivable (they happen); only a solid run of broken frames is fatal.
      const message = err instanceof Error ? err.message : String(err);
      if (message !== this.lastError) {
        this.lastError = message;
        console.error(err);
      }
      this.frameErrors += 1;
      if (this.frameErrors > 90) {
        this.stop();
        this.events.onFatal(err);
      }
    }
    this.input.endFrame();

    if (this.started && !this.rig.cinematic && this.autoQuality && !document.hidden) this.trackPerformance(rawDt);
  };

  // ------------------------------------------------------------------ battle mode

  /** Battle on: enemies, weapon, crosshair and mouse-lock aiming. Off: pure exploration. */
  setBattle(on: boolean, notify = true) {
    this.pausePerfWatch(3);
    this.battle = on;
    this.combat.setEnabled(on);
    this.input.battleMode = on;
    this.rig.shoulder = false;
    this.character.setWeaponVisible(on);
    if (!on) {
      this.input.unlock();
      this.input.mouseFiring = false;
      this.input.mouseScoping = false;
      this.input.touchScoping = false;
      this.player.aimYaw = null;
    }
    if (notify) this.events.onBattle(on);
  }

  /** Play a short one-shot gesture (e.g. when opening a station). */
  emote(name: 'Interact' | 'Wave') {
    if (!this.started || this.player.speed > 0.5 || this.combat.dying) return;
    this.character.play(name, { once: true, fade: 0.15 });
    this.emoteUntil = this.elapsed + 1.4;
  }

  private updateGame(dt: number) {
    const combat = this.combat;
    const dying = combat.dying;
    const axis = dying ? { x: 0, y: 0 } : this.input.axis();
    const moving = Math.hypot(axis.x, axis.y) > 0.1;
    if (moving) this.markFirstMove();
    const jump = !dying && (this.input.consume('Space') || this.input.consume('TouchJump'));
    const wasGrounded = this.player.grounded;
    const p = this.player.position;
    const locked = this.input.locked;
    const battleActive = this.battle && combat.playerAlive;

    // ---- combat input
    const safe = !this.battle || this.isSafe();
    const near = this.battle && combat.enemies.some((e) => e.alive && e.position.distanceTo(p) < 55);
    let aimingEnemy = false;
    this.rig.shoulder = battleActive && (locked || this.input.touchFiring || this.input.touchScoping);
    const scoped = battleActive && this.input.scoping && (locked || this.input.touchScoping);
    if (scoped !== this.rig.scope) {
      this.rig.scope = scoped;
      this.audio.chime('click');
      this.events.onScope(scoped);
    }
    if (battleActive && !this.rig.cinematic) {
      const aimPoint = locked || scoped ? this.centerAim() : this.autoAim();
      if (locked) aimingEnemy = !!this.centerEnemy();
      if (this.input.firing) {
        const yaw = combat.fire(aimPoint, this.elapsed, scoped);
        if (yaw !== null) {
          this.aimHold = 0.45;
          this.rig.kick(scoped ? 0.007 : 0.016);
          this.input.clearFirePulse();
        }
      }
      if (this.input.consume('KeyR') || this.input.consume('TouchReload')) combat.reload();
      if (this.input.consume('KeyG') || this.input.consume('TouchGrenade')) {
        const yaw = combat.throwGrenade(locked ? this.centerAim(true) : this.autoAim(16));
        if (yaw !== null) this.aimHold = 0.6;
      }
      // Over-the-shoulder: the character faces where the camera looks; otherwise face the target while shooting.
      if (locked || scoped) this.player.aimYaw = this.rig.forwardFacing;
      else if (this.aimHold > 0) this.player.aimYaw = Math.atan2(aimPoint.x - p.x, aimPoint.z - p.z);
      else this.player.aimYaw = null;
    } else {
      this.player.aimYaw = null;
    }
    this.aimHold -= dt;
    if (near !== this.combatState.near || safe !== this.combatState.safe || aimingEnemy !== this.combatState.aimingEnemy) {
      this.combatState = { near, safe, aimingEnemy };
      this.events.onCombatState(this.combatState);
    }

    if (!this.rig.cinematic) this.player.update(dt, axis, this.input.sprint, jump, this.rig.yaw, { walk: this.input.walk || scoped, battle: this.rig.shoulder });
    if (jump && wasGrounded) this.audio.jump();
    if (this.player.landed) {
      this.audio.land();
      if (this.surface() !== 'water') combat.effects.dust(new THREE.Vector3(p.x, this.player.groundAt(p.x, p.z) + 0.05, p.z), 7, 1.3);
    }

    this.rig.indoor = this.landmarks.insideCabin(p);
    this.rig.shake = combat.effects.shake;
    this.rig.update(dt, p, this.player.facing, this.player.speed, this.input, performance.now() / 1000);

    // ---- character animation (Adventurer clip set)
    const c = this.character;
    c.root.position.copy(p);
    c.root.rotation.y = this.player.facing;
    if (!dying && !(this.elapsed < this.emoteUntil && this.player.speed < 0.5)) {
      const speed = this.player.speed;
      const armed = battleActive;
      const shooting = armed && this.aimHold > 0;
      const airborne = !this.player.grounded && p.y - this.player.groundAt(p.x, p.z) > 0.5;
      if (airborne) {
        c.play(armed ? 'Idle_Gun' : 'Run', { fade: 0.15 });
        c.setTimeScale(0.25);
      } else if (speed > 0.35) {
        // Movement direction relative to where the character faces → strafe / backpedal clips.
        const moveYaw = Math.atan2(this.player.velocity.x, this.player.velocity.z);
        let rel = moveYaw - this.player.facing;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        let clip = speed < 3 ? 'Walk' : 'Run';
        if (armed) {
          // In battle the weapon is always shouldered: strafes and backpedals keep their own clips,
          // everything else runs the gun-up pose.
          if (Math.abs(rel) > 2.2) clip = 'Run_Back';
          else if (rel > 1.1) clip = 'Run_Left';
          else if (rel < -1.1) clip = 'Run_Right';
          else clip = 'Run_Shoot';
        } else if (this.player.aimYaw !== null && speed >= 1) {
          if (Math.abs(rel) > 2.2) clip = 'Run_Back';
          else if (rel > 0.7) clip = 'Run_Left';
          else if (rel < -0.7) clip = 'Run_Right';
          else clip = 'Run';
        }
        c.play(clip, { fade: 0.18 });
        c.setTimeScale(clip === 'Walk' ? clamp(speed / 2.1, 0.6, 1.5) : clamp(speed / 5.6, 0.75, 1.55));
        // Dust under the boots when sprinting.
        if (this.player.grounded && speed > 5.5) {
          this.dustTimer -= dt;
          if (this.dustTimer <= 0) {
            this.dustTimer = 0.16;
            if (this.surface() !== 'water') combat.effects.dust(new THREE.Vector3(p.x, this.player.groundAt(p.x, p.z) + 0.05, p.z), 3, 0.8);
          }
        }
      } else {
        c.play(shooting ? 'Idle_Gun_Shoot' : armed ? 'Idle_Gun_Pointing' : 'Idle', { fade: 0.25 });
      }
      if (this.player.grounded && speed > 0.8) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = speed > 6.5 ? 0.28 : speed > 3 ? 0.34 : 0.5;
          this.audio.footstep(this.surface());
        }
      }
    }
    // Hide the character when the camera is right against it (scope, tight corners indoors).
    c.root.visible = !this.rig.scope && this.camera.position.distanceTo(this.rig.focus) > 0.75;
    c.update(dt);
    combat.update(dt, this.elapsed, safe);

    const groundY = this.player.groundAt(p.x, p.z);
    this.blob.position.set(p.x, Math.max(groundY, WATER_LEVEL) + 0.04, p.z);
    this.blob.scale.setScalar(1 - clamp((p.y - groundY) / 3, 0, 1) * 0.5);

    const mm = this.marker.material as THREE.MeshBasicMaterial;
    if (this.player.moveTarget) {
      this.marker.scale.setScalar(Math.max(1, this.marker.scale.x - dt * 2));
      mm.opacity = 0.55 + Math.sin(this.elapsed * 6) * 0.25;
    } else mm.opacity = Math.max(0, mm.opacity - dt * 3);

    this.checkProximity();

    let water = 0;
    for (const l of lakes) water = Math.max(water, 1 - clamp((Math.hypot(p.x - l.x, p.z - l.z) - l.r) / 22, 0, 1));
    const camp = zoneById.contact;
    const fire = 1 - clamp(Math.hypot(p.x - camp.x, p.z - camp.z) / 16, 0, 1);
    this.audio.update({ night: this.env.state.night, waterProximity: water, fireProximity: fire, wind: 0.6 });
  }

  /** Stations and the cabin are safe zones: enemies ignore you there. */
  isSafe() {
    const p = this.player.position;
    if (this.landmarks.insideCabin(p)) return true;
    return zones.some((z) => Math.hypot(p.x - z.x, p.z - z.z) < z.discover + 2);
  }

  private centerRay() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    return this.raycaster.ray;
  }

  private centerEnemy() {
    const ray = this.centerRay();
    return this.combat.rayEnemy(ray.origin, ray.direction, 140, 0.8)?.enemy ?? null;
  }

  /** World point under the screen-centre crosshair; snaps onto enemies near the crosshair. */
  private centerAim(ground = false) {
    const ray = this.centerRay();
    const enemy = this.combat.rayEnemy(ray.origin, ray.direction, 140, 0.8)?.enemy;
    if (enemy && !ground) return enemy.chest();
    const o = ray.origin, d = ray.direction;
    for (let t = 2; t < 150; t += 0.7) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < this.terrain.heightAt(x, z)) return new THREE.Vector3(x, ground ? y : y + 0.9, z);
    }
    return o.clone().addScaledVector(d, ground ? 18 : 90);
  }

  /** Keyboard/touch aiming: nearest enemy in front of the camera, else straight ahead. */
  private autoAim(ahead = 40) {
    const p = this.player.position;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const target = this.combat.autoTarget(p, forward, 0.7) ?? this.combat.autoTarget(p, forward, Math.PI, 30);
    if (target) return target.chest();
    return new THREE.Vector3(p.x + Math.sin(this.player.facing) * ahead, p.y + 1.2, p.z + Math.cos(this.player.facing) * ahead);
  }

  restartBattle() {
    this.combat.reset();
    this.character.setWeaponVisible(this.battle);
  }

  private updateWorld(time: number, dt: number) {
    const focus = this.started ? this.player.position : new THREE.Vector3(0, 0, 20);
    const night = this.env.state.night;
    this.env.update(time, dt, focus, this.camera);
    this.grass.update(time, this.started ? this.player.position : this.camera.position.clone().setY(0).multiplyScalar(0.35));
    this.vegetation.update(time, this.started ? this.player.position : focus, this.started && !this.rig.cinematic ? this.camera : undefined, this.rig.focus);
    const gu = this.grass.uniforms;
    gu.uSunDir.value.copy(this.env.sunDir);
    gu.uSunColor.value.copy(this.env.state.sunColor);
    gu.uSunStrength.value = 1 - night * 0.55;
    this.water.update(time);
    const wu = this.water.uniforms;
    wu.uSky.value.copy(this.env.state.skyHorizon);
    wu.uSunDir.value.copy(this.env.sunDir);
    wu.uSunColor.value.copy(this.env.state.sunColor);
    wu.uSunStrength.value = 1 - night * 0.7;
    wu.uNight.value = night;
    wu.uShallow.value.copy(this.env.state.waterShallow);
    wu.uDeep.value.copy(this.env.state.waterDeep);
    this.landmarks.update(time, dt, night, focus, this.camera);
    this.labels.update(this.started ? this.player.position : this.camera.position);
    this.particles.update(time, night);
    this.bloom.intensity = this.env.state.bloom;
  }

  private checkProximity() {
    const p = this.player.position;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.landmarks.interactables) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d < it.radius) {
        const score = d / it.radius - (it.projectId ? 0.3 : 0);
        if (score < bestScore) {
          best = it;
          bestScore = score;
        }
      }
    }
    if (best !== this.activeItem) {
      this.activeItem = best;
      this.events.onInteractable(best);
    }

    let zone: ZoneDef | null = null;
    for (const zn of zones) {
      if (Math.hypot(p.x - zn.x, p.z - zn.z) < zn.discover + 6) {
        zone = zn;
        break;
      }
    }
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.events.onZone(zone);
    }
    for (const zn of zones) {
      if (!this.discovered.has(zn.id) && Math.hypot(p.x - zn.x, p.z - zn.z) < zn.discover) {
        this.discovered.add(zn.id);
        this.audio.chime('discover');
        this.events.onDiscover(zn, this.discovered.size, zones.length);
      }
    }
  }

  /**
   * Adaptive performance: first lowers the render resolution in small steps (invisible to most people),
   * then steps the quality tier down; resolution climbs back when there is headroom.
   */
  private trackPerformance(dt: number) {
    if (this.elapsed < this.qualityCheckAt) return;
    if (dt > 0.25) return; // tab switches and other hitches are not frame-rate data
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    this.frameTimes = [];
    // Median frame time ignores one-off spikes (GC, chunk building, a map render).
    const fps = 1 / sorted[Math.floor(sorted.length / 2)];
    const order: QualityLevel[] = ['low', 'medium', 'high'];
    const index = order.indexOf(this.quality);

    if (fps < STRUGGLING_FPS) {
      this.goodWindows = 0;
      if (this.renderScale > 0.73) {
        this.renderScale = Math.max(0.72, this.renderScale - 0.1);
        this.applyPixelRatio();
        this.resize();
      } else if (index > 0) {
        this.downgrades++;
        // Repeatedly failing at a tier means this device simply cannot hold it — stop climbing back.
        if (this.downgrades >= 3) this.ceiling = order[index - 1];
        this.applyQuality(order[index - 1]);
        this.events.onQualityChange(order[index - 1], 'lower');
      }
      this.qualityCheckAt = this.elapsed + 3;
      return;
    }

    if (fps < COMFORTABLE_FPS) {
      // In the band between the two thresholds nothing changes — this hysteresis is what stops
      // the world from slowly sliding down a notch at a time over a long session.
      this.goodWindows = 0;
      return;
    }

    // Comfortably fast: give back what was taken away, quality tier first (it is the visible part),
    // and wait longer before each successive attempt so we never oscillate.
    this.goodWindows++;
    const needed = 3 + this.downgrades * 3;
    if (this.goodWindows < needed) return;
    this.goodWindows = 0;
    if (index < order.indexOf(this.ceiling)) {
      this.applyQuality(order[index + 1]);
      this.events.onQualityChange(order[index + 1], 'restore');
      this.qualityCheckAt = this.elapsed + 6;
    } else if (this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.09);
      this.applyPixelRatio();
      this.resize();
      this.qualityCheckAt = this.elapsed + 4;
    } else {
      this.qualityCheckAt = this.elapsed + 20;
    }
  }

  /** Ignore frame times for a moment (after a teleport, a map render, leaving a menu…). */
  private pausePerfWatch(seconds = 2) {
    this.frameTimes = [];
    this.qualityCheckAt = Math.max(this.qualityCheckAt, this.elapsed + seconds);
  }

  dispose() {
    this.stop();
  }
}
