import type { Terrain } from '../world/Terrain';
import { PLAY_RADIUS, WATER_LEVEL, WORLD_SIZE, zones, type ZoneId } from '../world/layout';

const PREVIEW_RES = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Live minimap + zoomable travel map. Starts with a quick painted preview and switches to the
 * satellite render of the real 3D world (see Experience.bakeMap) as soon as it is ready.
 */
export class MapView {
  image: HTMLCanvasElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private bigPlayer: HTMLElement | null = null;
  private discovered = new Set<ZoneId>();
  private viewport: HTMLElement | null = null;
  private layer: HTMLElement | null = null;
  private scaleBar: HTMLElement | null = null;
  private zoom = 1;
  private tx = 0;
  private ty = 0;
  private enemyDots: HTMLElement[] = [];
  /** Renders a fresh, full-resolution image of one patch of the world (see Experience.bakeMap). */
  private detailProvider: ((centerX: number, centerZ: number, half: number) => HTMLCanvasElement | null) | null = null;
  private detailLayer: HTMLElement | null = null;
  private detailTimer = 0;
  private detailKey = '';

  constructor(terrain: Terrain, miniCanvas: HTMLCanvasElement) {
    this.image = MapView.preview(terrain);
    this.mini = miniCanvas;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.mini.width = this.mini.height = 150 * dpr;
    this.miniCtx = this.mini.getContext('2d')!;
  }

  /** Fast hill-shaded placeholder shown for the first second while the real render is baked. */
  private static preview(terrain: Terrain) {
    const c = document.createElement('canvas');
    c.width = c.height = PREVIEW_RES;
    const g = c.getContext('2d')!;
    const img = g.createImageData(PREVIEW_RES, PREVIEW_RES);
    const half = WORLD_SIZE / 2;
    for (let py = 0; py < PREVIEW_RES; py++) {
      for (let px = 0; px < PREVIEW_RES; px++) {
        const x = (px / PREVIEW_RES) * WORLD_SIZE - half;
        const z = (py / PREVIEW_RES) * WORLD_SIZE - half;
        const h = terrain.heightAt(x, z);
        let r = 66, gg = 102, b = 40;
        if (h < WATER_LEVEL) {
          r = 40; gg = 92; b = 110;
        } else {
          const path = terrain.mask(x, z, 0);
          r += (176 - r) * path; gg += (150 - gg) * path; b += (104 - b) * path;
        }
        const shade = 0.9 + (h - terrain.heightAt(x - 1, z - 1)) * 0.08;
        const i = (py * PREVIEW_RES + px) * 4;
        img.data[i] = r * shade;
        img.data[i + 1] = gg * shade;
        img.data[i + 2] = b * shade;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Swap in the baked satellite render. The minimap keeps drawing from the canvas, while the travel
   * map gets a decoded <img> — a big canvas element costs the compositor a stall the first time it
   * is shown, an already-decoded image does not.
   */
  setImage(canvas: HTMLCanvasElement) {
    this.image = canvas;
    const slot = this.layer?.querySelector('.bigmap-image');
    if (!slot || !this.layer) return;
    const img = document.createElement('img');
    img.className = 'bigmap-image';
    img.decoding = 'async';
    img.alt = 'Top-down satellite view of the portfolio world';
    const show = () => {
      if (!this.layer) return;
      const current = this.layer.querySelector('.bigmap-image');
      if (current) this.layer.replaceChild(img, current);
    };
    canvas.toBlob((blob) => {
      if (!blob) return;
      img.src = URL.createObjectURL(blob);
      img.decode().then(show, show);
    }, 'image/webp', 0.9);
  }

  setDiscovered(set: Set<ZoneId>) {
    this.discovered = set;
  }

  /** Zooming in re-renders the visible patch instead of magnifying the baked image. */
  setDetailProvider(fn: (centerX: number, centerZ: number, half: number) => HTMLCanvasElement | null) {
    this.detailProvider = fn;
  }

  private scheduleDetail() {
    if (!this.detailProvider || !this.viewport || !this.detailLayer) return;
    window.clearTimeout(this.detailTimer);
    if (this.zoom < 1.35) {
      this.detailLayer.innerHTML = '';
      this.detailKey = '';
      return;
    }
    // Wait until the gesture settles — one render per view, not one per wheel tick.
    this.detailTimer = window.setTimeout(() => this.renderDetail(), 220);
  }

  private renderDetail() {
    if (!this.detailProvider || !this.viewport || !this.detailLayer) return;
    const size = this.viewport.clientWidth || 1;
    // Visible rect in map space (0..1), then in world metres.
    const u0 = -this.tx / (size * this.zoom), v0 = -this.ty / (size * this.zoom);
    const span = 1 / this.zoom;
    const cx = (u0 + span / 2) * WORLD_SIZE - WORLD_SIZE / 2;
    const cz = (v0 + span / 2) * WORLD_SIZE - WORLD_SIZE / 2;
    const half = (span * WORLD_SIZE) / 2;
    const key = `${cx.toFixed(1)}|${cz.toFixed(1)}|${half.toFixed(1)}`;
    if (key === this.detailKey) return;
    const canvas = this.detailProvider(cx, cz, half);
    if (!canvas) return;
    this.detailKey = key;
    canvas.className = 'bigmap-detail';
    // Place it over exactly the world rect it was rendered from.
    canvas.style.left = `${(u0 + 0) * 100}%`;
    canvas.style.top = `${(v0 + 0) * 100}%`;
    canvas.style.width = `${span * 100}%`;
    canvas.style.height = `${span * 100}%`;
    this.detailLayer.innerHTML = '';
    this.detailLayer.appendChild(canvas);
  }

  drawMini(px: number, pz: number, facing: number, cameraYaw: number, enemies: { x: number; z: number }[] = []) {
    const g = this.miniCtx;
    const size = this.mini.width;
    const res = this.image.width;
    const viewRadius = 60; // metres shown from centre to edge
    const scale = size / 2 / ((viewRadius / WORLD_SIZE) * res);
    g.save();
    g.clearRect(0, 0, size, size);
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2b3a22';
    g.fillRect(0, 0, size, size);
    const mx = ((px + WORLD_SIZE / 2) / WORLD_SIZE) * res;
    const mz = ((pz + WORLD_SIZE / 2) / WORLD_SIZE) * res;
    g.translate(size / 2, size / 2);
    g.scale(scale, scale);
    g.translate(-mx, -mz);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // Lift the satellite render a little so it stays readable at minimap size.
    g.filter = 'brightness(1.16) saturate(1.12)';
    g.drawImage(this.image, 0, 0);
    g.filter = 'none';
    g.restore();

    // Soft inner rim so the round map reads like a lens
    const rim = g.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size / 2);
    rim.addColorStop(0, 'rgba(10,14,8,0)');
    rim.addColorStop(1, 'rgba(10,14,8,0.32)');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.fill();

    const toMini = (x: number, z: number) => ({
      x: size / 2 + ((x - px) / viewRadius) * (size / 2),
      y: size / 2 + ((z - pz) / viewRadius) * (size / 2),
    });
    const dpr = size / 150;
    for (const zn of zones) {
      let p = toMini(zn.x, zn.z);
      const dx = p.x - size / 2, dy = p.y - size / 2;
      const d = Math.hypot(dx, dy);
      const maxD = size / 2 - 9 * dpr;
      const edge = d > maxD;
      if (edge) p = { x: size / 2 + (dx / d) * maxD, y: size / 2 + (dy / d) * maxD };
      g.beginPath();
      g.arc(p.x, p.y, (edge ? 3.5 : 5) * dpr, 0, Math.PI * 2);
      g.fillStyle = zn.color;
      g.globalAlpha = this.discovered.has(zn.id) ? 1 : 0.6;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 1.5 * dpr;
      g.strokeStyle = 'rgba(255,248,232,0.9)';
      g.stroke();
    }

    // Enemies (red, pulsing), clamped to the rim when out of range
    const pulse = 0.75 + Math.sin(performance.now() / 180) * 0.25;
    for (const e of enemies) {
      let p = toMini(e.x, e.z);
      const dx = p.x - size / 2, dy = p.y - size / 2;
      const d = Math.hypot(dx, dy);
      const maxD = size / 2 - 7 * dpr;
      if (d > maxD) p = { x: size / 2 + (dx / d) * maxD, y: size / 2 + (dy / d) * maxD };
      g.beginPath();
      g.arc(p.x, p.y, 3.6 * dpr * pulse + 1, 0, Math.PI * 2);
      g.fillStyle = '#ff4d3d';
      g.fill();
      g.lineWidth = 1.2 * dpr;
      g.strokeStyle = 'rgba(40,0,0,0.85)';
      g.stroke();
    }

    // North tick
    g.fillStyle = 'rgba(255,248,232,0.95)';
    g.font = `700 ${9 * dpr}px Manrope Variable, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('N', size / 2, 4 * dpr);

    // View cone + player arrow
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(-cameraYaw + Math.PI);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 46 * dpr);
    cone.addColorStop(0, 'rgba(255,246,226,0.4)');
    cone.addColorStop(1, 'rgba(255,246,226,0)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 46 * dpr, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
    g.closePath();
    g.fill();
    g.restore();

    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(-facing);
    g.beginPath();
    g.moveTo(0, 7 * dpr);
    g.lineTo(5 * dpr, -5 * dpr);
    g.lineTo(0, -2.5 * dpr);
    g.lineTo(-5 * dpr, -5 * dpr);
    g.closePath();
    g.fillStyle = '#fff6e6';
    g.strokeStyle = '#1c2419';
    g.lineWidth = 2 * dpr;
    g.stroke();
    g.fill();
    g.restore();

    this.bigPlayer?.style.setProperty('left', `${((px + WORLD_SIZE / 2) / WORLD_SIZE) * 100}%`);
    this.bigPlayer?.style.setProperty('top', `${((pz + WORLD_SIZE / 2) / WORLD_SIZE) * 100}%`);
    this.bigPlayer?.style.setProperty('--facing', `${-facing}rad`);
    this.lastPlayer = { x: px, z: pz };
  }

  private lastPlayer = { x: 0, z: 0 };

  /** Builds the zoomable travel map inside the given container. */
  mountBig(container: HTMLElement, onTravel: (id: ZoneId) => void) {
    const viewport = document.createElement('div');
    viewport.className = 'bigmap-canvas';
    const layer = document.createElement('div');
    layer.className = 'bigmap-layer';
    const img = this.image;
    img.className = 'bigmap-image';
    const pct = (v: number) => `${((v + WORLD_SIZE / 2) / WORLD_SIZE) * 100}%`;
    layer.appendChild(img);

    // Sharp re-render of the zoomed-in patch sits directly on top of the baked image.
    this.detailLayer = document.createElement('div');
    this.detailLayer.className = 'bigmap-detail-layer';
    layer.appendChild(this.detailLayer);

    // Explorable boundary ring
    const ring = document.createElement('div');
    ring.className = 'bigmap-ring';
    ring.style.width = ring.style.height = `${((PLAY_RADIUS * 2) / WORLD_SIZE) * 100}%`;
    layer.appendChild(ring);

    for (const zn of zones) {
      const b = document.createElement('button');
      b.className = 'map-marker';
      b.style.left = pct(zn.x);
      b.style.top = pct(zn.z);
      b.style.setProperty('--c', zn.color);
      b.innerHTML = `<span class="dot"></span><span class="map-label"><small>${zn.subtitle}</small>${zn.title}</span>`;
      b.addEventListener('click', (e) => {
        if (this.dragged) {
          e.preventDefault();
          return;
        }
        onTravel(zn.id);
      });
      layer.appendChild(b);
    }
    this.bigPlayer = document.createElement('div');
    this.bigPlayer.className = 'map-player';
    layer.appendChild(this.bigPlayer);
    viewport.appendChild(layer);

    const compass = document.createElement('div');
    compass.className = 'bigmap-compass';
    compass.setAttribute('aria-hidden', 'true');
    compass.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><path d="M20 5 25 20H15Z" class="n"/><path d="M20 35 15 20h10Z"/><text x="20" y="4.2">N</text></svg>';
    viewport.appendChild(compass);

    const tools = document.createElement('div');
    tools.className = 'bigmap-tools';
    tools.innerHTML = '<button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="me" aria-label="Centre on me"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>';
    tools.addEventListener('click', (e) => {
      const z = (e.target as HTMLElement).closest('button')?.dataset.z;
      const rect = viewport.getBoundingClientRect();
      if (z === 'in') this.zoomAt(this.zoom * 1.5, rect.width / 2, rect.height / 2);
      if (z === 'out') this.zoomAt(this.zoom / 1.5, rect.width / 2, rect.height / 2);
      if (z === 'me') this.centerOn(this.lastPlayer.x, this.lastPlayer.z, Math.max(this.zoom, 2.2));
    });
    viewport.appendChild(tools);

    const bar = document.createElement('div');
    bar.className = 'bigmap-scale';
    bar.innerHTML = '<i></i><span></span>';
    viewport.appendChild(bar);
    this.scaleBar = bar;

    container.appendChild(viewport);
    this.viewport = viewport;
    this.layer = layer;
    this.bindGestures(viewport);
    this.applyTransform();
  }

  private dragged = false;

  private bindGestures(el: HTMLElement) {
    const pointers = new Map<number, { x: number; y: number }>();
    let startDist = 0, startZoom = 1, moved = 0;
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      this.zoomAt(this.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.bigmap-tools')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      this.dragged = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y);
        startZoom = this.zoom;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6 && !this.dragged) {
        this.dragged = true;
        el.setPointerCapture(e.pointerId);
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const r = el.getBoundingClientRect();
        this.zoomAt(startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(startDist, 1)), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      } else if (this.dragged) {
        this.tx += dx;
        this.ty += dy;
        this.applyTransform();
      }
    });
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      // Let the click that ends a drag be ignored, then re-enable marker clicks.
      if (this.dragged) setTimeout(() => (this.dragged = false), 0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private zoomAt(zoom: number, cx: number, cy: number) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    // Keep the map point under (cx, cy) fixed while zooming.
    this.tx = cx - ((cx - this.tx) * z) / this.zoom;
    this.ty = cy - ((cy - this.ty) * z) / this.zoom;
    this.zoom = z;
    this.applyTransform();
  }

  private centerOn(x: number, z: number, zoom: number) {
    if (!this.viewport) return;
    const size = this.viewport.clientWidth;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.tx = size / 2 - ((x + WORLD_SIZE / 2) / WORLD_SIZE) * size * this.zoom;
    this.ty = size / 2 - ((z + WORLD_SIZE / 2) / WORLD_SIZE) * size * this.zoom;
    this.applyTransform();
  }

  /** Opening the travel map resets the view to show the whole valley. */
  resetView() {
    this.zoom = 1;
    this.tx = this.ty = 0;
    this.applyTransform();
  }

  private applyTransform() {
    if (!this.layer || !this.viewport) return;
    const size = this.viewport.clientWidth || 1;
    const max = size * (this.zoom - 1);
    this.tx = Math.min(0, Math.max(-max, this.tx));
    this.ty = Math.min(0, Math.max(-max, this.ty));
    this.layer.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`;
    this.scheduleDetail();
    this.layer.style.setProperty('--inv', `${1 / this.zoom}`);
    this.viewport.classList.toggle('zoomed', this.zoom > 1.01);
    if (this.scaleBar) {
      const metresAcross = WORLD_SIZE / this.zoom;
      const nice = [10, 20, 25, 50, 100].find((m) => m / metresAcross > 0.12) ?? 100;
      (this.scaleBar.firstElementChild as HTMLElement).style.width = `${(nice / metresAcross) * size}px`;
      this.scaleBar.lastElementChild!.textContent = `${nice} m`;
    }
  }

  /** Live enemy markers on the travel map. */
  updateBigEnemies(enemies: { x: number; z: number; alive: boolean }[]) {
    if (!this.layer) return;
    while (this.enemyDots.length < enemies.length) {
      const dot = document.createElement('span');
      dot.className = 'map-enemy';
      dot.title = 'Enemy';
      this.layer.appendChild(dot);
      this.enemyDots.push(dot);
    }
    enemies.forEach((e, i) => {
      const dot = this.enemyDots[i];
      dot.hidden = !e.alive;
      dot.style.left = `${((e.x + WORLD_SIZE / 2) / WORLD_SIZE) * 100}%`;
      dot.style.top = `${((e.z + WORLD_SIZE / 2) / WORLD_SIZE) * 100}%`;
    });
  }
}
