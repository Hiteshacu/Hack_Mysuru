import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { Colliders } from './Colliders';
import type { Labels } from './Labels';
import type { Assets } from '../core/Assets';
import { DISPLAY_FONT, UI_FONT } from './Labels';
import { projectPedestals, zoneById, type ZoneId } from './layout';
import { achievements, certifications, projects, skillGroups } from '../data/portfolio';
import { noiseGLSL } from '../shaders/noise.glsl';
import { mulberry32 } from '../utils/math';

export interface Interactable {
  id: string;
  zone: ZoneId;
  projectId?: string;
  x: number;
  z: number;
  radius: number;
  title: string;
}

type Updater = (time: number, dt: number, night: number) => void;

const rnd = mulberry32(9001);

const M = {
  stone: new THREE.MeshLambertMaterial({ color: '#b4ab98', flatShading: true }),
  stoneDark: new THREE.MeshLambertMaterial({ color: '#827b6e', flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ color: '#8b5e3c' }),
  woodDark: new THREE.MeshLambertMaterial({ color: '#5b3b26' }),
  roof: new THREE.MeshLambertMaterial({ color: '#8c4a35', flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: '#3a3833', metalness: 0.6, roughness: 0.5 }),
};

function planksTexture(base: string, dark: string, rows = 8) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const h = 256 / rows;
  for (let i = 0; i < rows; i++) {
    g.fillStyle = i % 2 ? base : shade(base, -0.06);
    g.fillRect(0, i * h, 256, h);
    g.fillStyle = dark;
    g.fillRect(0, i * h + h - 3, 256, 3);
    for (let k = 0; k < 6; k++) {
      g.globalAlpha = 0.18;
      g.fillRect(rnd() * 256, i * h + rnd() * h, 20 + rnd() * 50, 1.5);
      g.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function shade(hex: string, amt: number) {
  return '#' + new THREE.Color(hex).offsetHSL(0, 0, amt).getHexString();
}

function wrapText(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export class Landmarks {
  readonly group = new THREE.Group();
  readonly interactables: Interactable[] = [];
  private updaters: Updater[] = [];
  private glowMats: { mat: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  private rings: { mat: THREE.ShaderMaterial; x: number; z: number; r: number }[] = [];
  private billboards: THREE.Object3D[] = [];
  private tmpV = new THREE.Vector3();

  constructor(private terrain: Terrain, private colliders: Colliders, private labels: Labels, private assets: Assets) {
    this.buildGate();
    this.buildCabin();
    this.buildCrystals();
    this.buildGrove();
    this.buildTrophies();
    this.buildBanners();
    this.buildCamp();
  }

  // ---------------------------------------------------------------- helpers

  private ground(x: number, z: number) {
    return this.terrain.heightAt(x, z);
  }

  private zoneGroup(id: ZoneId, faceArrive = true) {
    const zn = zoneById[id];
    const g = new THREE.Group();
    g.position.set(zn.x, this.ground(zn.x, zn.z), zn.z);
    if (faceArrive) g.rotation.y = Math.atan2(zn.arrive[0], zn.arrive[1]);
    this.group.add(g);
    return g;
  }

  /** World XZ of a point given in a zone group's local space. */
  private toWorld(g: THREE.Group, lx: number, lz: number) {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    return { x: g.position.x + lx * c + lz * s, z: g.position.z - lx * s + lz * c };
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private glow(color: string, day = 0.6, night = 3) {
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: day });
    this.glowMats.push({ mat, day, night });
    return mat;
  }

  private lantern(parent: THREE.Object3D, x: number, z: number, height = 2.4, color = '#ffb35a') {
    this.mesh(new THREE.CylinderGeometry(0.07, 0.1, height, 6), M.woodDark, parent, x, height / 2, z);
    this.mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), M.woodDark, parent, x + 0.3, height - 0.1, z);
    // Open lantern: cap, base plate and four thin bars around a glowing core.
    const lamp = new THREE.Group();
    lamp.position.set(x + 0.55, height - 0.16, z);
    parent.add(lamp);
    this.mesh(new THREE.CylinderGeometry(0.02, 0.2, 0.14, 4).rotateY(Math.PI / 4), M.metal, lamp, 0, -0.03, 0);
    this.mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), M.metal, lamp, 0, -0.48, 0);
    for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.mesh(new THREE.BoxGeometry(0.025, 0.36, 0.025), M.metal, lamp, bx * 0.11, -0.28, bz * 0.11).castShadow = false;
    }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.glow(color, 1.2, 6));
    bulb.position.y = -0.28;
    lamp.add(bulb);
    const sway = rnd() * 10;
    this.updaters.push((t) => {
      lamp.rotation.z = Math.sin(t * 1.2 + sway) * 0.06;
      lamp.rotation.x = Math.cos(t * 0.9 + sway) * 0.04;
    });
  }

  private ring(x: number, z: number, radius: number, color: string) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uActive: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uActive;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float edge = smoothstep(0.84, 0.9, r) * smoothstep(1.0, 0.93, r);
          float pulse = fract(uTime * 0.45);
          float wave = smoothstep(0.08, 0.0, abs(r - pulse)) * (1.0 - pulse) * smoothstep(0.0, 0.2, pulse);
          float dash = step(0.5, fract(atan(p.y, p.x) / 6.2831 * 36.0 + uTime * 0.1));
          float a = edge * mix(0.55, 1.0, dash) * (0.35 + uActive * 0.9) + wave * (0.25 + uActive * 0.6);
          gl_FragColor = vec4(uColor * a * 1.6, a);
        }
      `,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), mat);
    m.position.set(x, this.ground(x, z) + 0.06, z);
    m.renderOrder = 4;
    this.group.add(m);
    this.rings.push({ mat, x, z, r: radius });
  }

  private interact(item: Interactable, ringColor: string, ringRadius = 2.2) {
    this.interactables.push(item);
    this.ring(item.x, item.z, ringRadius, ringColor);
  }

  private beam(parent: THREE.Object3D, color: string, height: number, radius: number) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float fade = (1.0 - vUv.y) * (1.0 - vUv.y) * smoothstep(0.0, 0.05, vUv.y + 0.02);
          float lines = 0.7 + 0.3 * sin(vUv.y * 60.0 - uTime * 4.0);
          float a = fade * lines * 0.85;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, height, 32, 1, true), mat);
    m.position.y = height / 2;
    parent.add(m);
    this.updaters.push((t) => (mat.uniforms.uTime.value = t));
    return m;
  }

  // ---------------------------------------------------------------- welcome gate

  private buildGate() {
    const zn = zoneById.welcome;
    const g = this.zoneGroup('welcome', false);
    for (const side of [-1, 1]) {
      let y = 0;
      const sizes = [1.9, 1.6, 1.5, 1.45, 1.35];
      sizes.forEach((s, i) => {
        const h = i === 0 ? 1 : 1.5;
        const b = this.mesh(new THREE.BoxGeometry(s, h, s), i % 2 ? M.stoneDark : M.stone, g, side * 3.8, y + h / 2, 0);
        b.rotation.y = (rnd() - 0.5) * 0.12;
        y += h;
      });
      this.colliders.addBox(zn.x + side * 3.8, zn.z, 2, 2);
      this.lantern(g, side * 5.8, 1.6, 2.6);
    }
    const lintel = this.mesh(new THREE.BoxGeometry(10.2, 0.9, 1.9), M.stone, g, 0, 7.45, 0);
    lintel.rotation.z = 0.01;
    this.mesh(new THREE.BoxGeometry(7.6, 0.6, 1.4), M.stoneDark, g, 0, 8.2, 0);

    // Floating medallion
    const orbMat = this.glow('#ffc46b', 1.4, 4);
    const orb = this.mesh(new THREE.IcosahedronGeometry(0.55, 1), orbMat, g, 0, 9.6, 0);
    orb.castShadow = false;
    const ringMat = new THREE.MeshStandardMaterial({ color: '#e7b35a', metalness: 0.8, roughness: 0.3, emissive: '#6b4310' });
    const ring1 = this.mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 48), ringMat, g, 0, 9.6, 0);
    const ring2 = this.mesh(new THREE.TorusGeometry(1.35, 0.04, 8, 48), ringMat, g, 0, 9.6, 0);
    this.updaters.push((t) => {
      orb.position.y = 9.6 + Math.sin(t * 1.3) * 0.18;
      ring1.position.y = ring2.position.y = orb.position.y;
      ring1.rotation.set(t * 0.6, t * 0.4, 0);
      ring2.rotation.set(-t * 0.3, 0, t * 0.5);
      orb.rotation.y = t * 0.5;
    });

    // Hanging chains + banners under the lintel
    for (const side of [-1, 1]) {
      const bannerTex = this.bannerTexture(side < 0 ? 'EXPLORE' : 'DISCOVER', '#2e4a33', '#f2b35c');
      const cloth = this.cloth(1.3, 2.4, bannerTex);
      cloth.position.set(side * 2.2, 5.75, 0.2);
      g.add(cloth);
    }

    this.labels.create('Hitesh A', new THREE.Vector3(zn.x, g.position.y + 12, zn.z), {
      subtitle: 'Welcome · Portfolio World',
      scale: 1.7,
      near: 55,
      far: 110,
    });
    this.interact({ id: 'welcome', zone: 'welcome', x: zn.x, z: zn.z - 3, radius: 5, title: 'Welcome' }, zn.color, 2.6);
  }

  private bannerTexture(text: string, bg: string, fg: string) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 512);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(18, 18, 220, 476);
    g.fillStyle = fg;
    g.font = `700 34px ${UI_FONT}`;
    g.textAlign = 'center';
    g.save();
    g.translate(128, 256);
    g.rotate(-Math.PI / 2);
    g.letterSpacing = '10px';
    g.fillText(text, 0, 12);
    g.restore();
    g.beginPath();
    g.arc(128, 70, 18, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(128, 442, 18, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** A waving cloth hanging from its top edge. */
  private cloth(width: number, height: number, map: THREE.Texture) {
    const geo = new THREE.PlaneGeometry(width, height, 10, 16).translate(0, -height / 2, 0);
    const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
    const uniforms = { uTime: { value: 0 } };
    const seed = rnd() * 10;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
           float hang = clamp(-position.y / ${height.toFixed(2)}, 0.0, 1.0);
           transformed.z += sin(uTime * 2.2 + position.y * 1.6 + position.x * 2.0 + ${seed.toFixed(2)}) * 0.16 * hang;
           transformed.x += sin(uTime * 1.3 + position.y * 0.8 + ${seed.toFixed(2)}) * 0.05 * hang;`,
        );
    };
    this.updaters.push((t) => (uniforms.uTime.value = t));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- about cabin

  /** Enterable cabin: walls with a real doorway, opening door, fading roof and a furnished interior. */
  private buildCabin() {
    const zn = zoneById.about;
    const g = this.zoneGroup('about');
    const planks = planksTexture('#9a6a45', '#4a2f1e', 9);
    const wallMat = new THREE.MeshLambertMaterial({ map: planks });
    const innerMat = new THREE.MeshLambertMaterial({ map: planksTexture('#c29467', '#6b4a33', 10) });
    const floorTex = planksTexture('#8a5d3b', '#4a2f1e', 14);
    floorTex.repeat.set(3, 3);
    const W = 10, D = 8, H = 3.5, T = 0.3, FY = 0.55, DOOR = 1.9;
    const rotC = -g.rotation.y;
    const worldBox = (lx: number, lz: number, w: number, d: number) => {
      const p = this.toWorld(g, lx, lz);
      this.colliders.addBox(p.x, p.z, w, d, rotC);
    };

    // Platform (floor + porch) and steps — all walkable floors
    this.mesh(new THREE.BoxGeometry(W + 1.6, FY, D + 3.8), M.woodDark, g, 0, FY / 2, 1.1);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T, D - T).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.position.y = FY + 0.01;
    floor.receiveShadow = true;
    g.add(floor);
    this.mesh(new THREE.BoxGeometry(3.2, 0.28, 0.9), M.woodDark, g, 0, 0.14, D / 2 + 3.45);
    const plat = this.toWorld(g, 0, 1.1);
    this.colliders.addFloor(plat.x, plat.z, W + 1.6, D + 3.8, g.position.y + FY, rotC);
    const step = this.toWorld(g, 0, D / 2 + 3.45);
    this.colliders.addFloor(step.x, step.z, 3.2, 0.9, g.position.y + 0.28, rotC);

    // Walls (outer planks, lighter inner lining)
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z — `inner` is the face that looks into the room.
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number, inner: number) => {
      const mats = [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat];
      mats[inner] = innerMat;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    wall(W, H, T, 0, FY + H / 2, -D / 2, 4);
    worldBox(0, -D / 2, W, T + 0.2);
    const seg = (W - DOOR) / 2;
    for (const sx of [-1, 1]) {
      // side walls with a window opening (split into pieces around it)
      const WIN = 1.6, sill = 1.1, winH = 1.1;
      const sideX = (sx * (W - T)) / 2;
      const inF = sx < 0 ? 0 : 1;
      wall(T, H, (D - WIN) / 2, sideX, FY + H / 2, -(D + WIN) / 4, inF);
      wall(T, H, (D - WIN) / 2, sideX, FY + H / 2, (D + WIN) / 4, inF);
      wall(T, sill, WIN, sideX, FY + sill / 2, 0, inF);
      wall(T, H - sill - winH, WIN, sideX, FY + sill + winH + (H - sill - winH) / 2, 0, inF);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN, winH), new THREE.MeshLambertMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.25, emissive: '#ffc978', emissiveIntensity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      this.glowMats.push({ mat: glass.material as THREE.MeshLambertMaterial, day: 0.05, night: 1.4 });
      glass.position.set(sideX, FY + sill + winH / 2, 0);
      glass.rotation.y = Math.PI / 2;
      g.add(glass);
      worldBox(sideX, 0, T + 0.2, D);
      // front wall pieces either side of the doorway
      wall(seg, H, T, sx * (DOOR / 2 + seg / 2), FY + H / 2, D / 2, 5);
      worldBox(sx * (DOOR / 2 + seg / 2), D / 2, seg, T + 0.2);
      for (const sz of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.42, H + 0.2, 0.42), M.woodDark, g, (sx * W) / 2, FY + H / 2, (sz * D) / 2);
    }
    wall(DOOR, H - 2.5, T, 0, FY + 2.5 + (H - 2.5) / 2, D / 2, 5);

    // Hinged door that swings open when someone approaches
    const hinge = new THREE.Group();
    hinge.position.set(-DOOR / 2 + 0.05, FY, D / 2);
    g.add(hinge);
    const doorPanel = this.mesh(new THREE.BoxGeometry(DOOR - 0.1, 2.45, 0.1), M.woodDark, hinge, (DOOR - 0.1) / 2, 1.225, 0);
    this.mesh(new THREE.SphereGeometry(0.06, 8, 6), M.metal, doorPanel, (DOOR - 0.1) / 2 - 0.2, 0, 0.08);
    const doorWorld = this.toWorld(g, 0, D / 2);
    this.updaters.push((_t, dt) => {
      const p = this.playerPos;
      const near = Math.hypot(p.x - doorWorld.x, p.z - doorWorld.z) < 3.4;
      const target = near ? 1.6 : 0;
      hinge.rotation.y += (target - hinge.rotation.y) * Math.min(1, dt * 4);
    });

    // Roof group (hidden while the player is inside so the camera can see in)
    const roof = new THREE.Group();
    g.add(roof);
    const rise = 2.3;
    const slope = Math.atan2(rise, D / 2);
    const slabLen = Math.hypot(rise, D / 2) + 0.9;
    for (const sz of [-1, 1]) {
      const slab = this.mesh(new THREE.BoxGeometry(W + 1.4, 0.24, slabLen), M.roof, roof, 0, FY + H + rise / 2 + 0.12, (sz * D) / 4 + sz * 0.32);
      slab.rotation.x = sz * slope;
    }
    const gable = new THREE.Shape();
    gable.moveTo(-D / 2, 0);
    gable.lineTo(D / 2, 0);
    gable.lineTo(0, rise);
    gable.closePath();
    const gableMat = new THREE.MeshLambertMaterial({ map: planks, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) this.mesh(new THREE.ShapeGeometry(gable), gableMat, roof, (sx * W) / 2, FY + H, 0).rotation.y = Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(0.9, 3, 0.9), M.stoneDark, roof, -3.2, FY + H + 1.5, -2.4);
    const smoke = this.risingParticles({ count: 26, height: 7, spread: 0.9, size: 0.9, color: '#d9d4cc', additive: false, speed: 0.12 });
    smoke.position.set(-3.2, FY + H + 3.1, -2.4);
    roof.add(smoke);
    // Ceiling beams stay visible inside
    for (const bz of [-2, 0, 2]) this.mesh(new THREE.BoxGeometry(W - 0.4, 0.22, 0.22), M.woodDark, g, 0, FY + H - 0.12, bz).castShadow = false;

    // ---- Interior
    const inside = new THREE.Group();
    inside.position.y = FY;
    g.add(inside);
    const place = (name: string, x: number, z: number, rot: number, scale: number, collide = 0) => {
      const obj = this.assets.instance(name);
      obj.scale.setScalar(scale);
      obj.rotation.y = rot;
      obj.position.set(x, 0, z);
      inside.add(obj);
      if (collide) {
        const w = this.toWorld(g, x, z);
        this.colliders.addCircle(w.x, w.z, collide);
      }
      return obj;
    };
    place('Bed', -3.3, -2.95, Math.PI / 2, 0.52, 1.1);
    place('Bookcase', 2.2, -D / 2 + 0.55, 0, 0.68, 0.7);
    place('Desk', W / 2 - 0.75, -1.2, -Math.PI / 2, 0.9, 0.8);
    place('OfficeChair', W / 2 - 1.75, -1.2, Math.PI / 2, 0.95);
    place('Sofa', -3.9, 1.8, Math.PI / 2, 0.5, 0.9);
    place('Table', -1.6, 1.8, 0, 0.55, 0.6);
    place('Chair', -0.75, 1.35, -Math.PI / 2, 0.9);
    place('Chair', -0.75, 2.25, -Math.PI / 2, 0.9);

    // Laptop on the desk showing the résumé
    const laptop = new THREE.Group();
    laptop.position.set(W / 2 - 0.75, 0.84, -1.2);
    laptop.rotation.y = -Math.PI / 2;
    inside.add(laptop);
    this.mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), M.metal, laptop, 0, 0, 0.05);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), new THREE.MeshBasicMaterial({ map: this.screenTexture(), toneMapped: false }));
    screen.position.set(0, 0.2, -0.16);
    screen.rotation.x = -0.18;
    laptop.add(screen);
    this.mesh(new THREE.BoxGeometry(0.62, 0.4, 0.02), M.metal, laptop, 0, 0.2, -0.175).rotation.x = -0.18;

    // Rug, wall frames, fireplace and a warm light
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: this.rugTexture() }));
    rug.position.set(-1.2, 0.03, 1.2);
    rug.receiveShadow = true;
    inside.add(rug);
    const frame = (text: string, sub: string, x: number) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshLambertMaterial({ map: this.frameTexture(text, sub) }));
      f.position.set(x, 1.9, -D / 2 + T / 2 + 0.02);
      inside.add(f);
    };
    frame('B.E. AI & DS', 'SMVITM · CGPA 8.33', -0.9);
    frame('10+ Podiums', 'National hackathons', -3.3);
    this.mesh(new THREE.BoxGeometry(1.8, 1.3, 0.7), M.stoneDark, inside, -0.9, 0.65, -D / 2 + 0.5);
    this.mesh(new THREE.BoxGeometry(1.1, 0.8, 0.2), new THREE.MeshBasicMaterial({ color: '#140c08' }), inside, -0.9, 0.5, -D / 2 + 0.86);
    const fp = this.toWorld(g, -0.9, -D / 2 + 0.5);
    this.colliders.addCircle(fp.x, fp.z, 0.9);
    const hearth = new THREE.Group();
    hearth.position.set(-0.9, 0.12, -D / 2 + 0.95);
    inside.add(hearth);
    for (let i = 0; i < 2; i++) hearth.add(this.flame(0.5 - i * 0.12, 0.8 - i * 0.2, 7 + i * 3.1));
    this.cabinLight = new THREE.PointLight('#ffb168', 6, 9, 1.4);
    this.cabinLight.position.set(0, H - 0.6, 0);
    inside.add(this.cabinLight);

    // Porch details
    this.lantern(g, 2.6, D / 2 + 1.6, 2.3);
    this.mesh(new THREE.BoxGeometry(1.8, 0.14, 0.5), M.wood, g, -2.6, FY + 0.45, D / 2 + 1.3);
    for (const bx of [-0.7, 0.7]) this.mesh(new THREE.BoxGeometry(0.12, 0.45, 0.42), M.woodDark, g, -2.6 + bx, FY + 0.22, D / 2 + 1.3);
    for (let i = 0; i < 5; i++) {
      const log = this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8), M.wood, g, W / 2 + 1.5, 0.25 + (i < 3 ? 0 : 0.36), -1.5 + (i < 3 ? i * 0.42 : (i - 3) * 0.42 + 0.21));
      log.rotation.z = Math.PI / 2;
    }
    const logs = this.toWorld(g, W / 2 + 1.5, -1.1);
    this.colliders.addCircle(logs.x, logs.z, 0.9);

    this.cabin = { group: g, roof, W, D, floorY: FY, height: H };
    const f = this.toWorld(g, 0, D / 2 + 4.6);
    const desk = this.toWorld(g, W / 2 - 2.3, -1.2);
    const shelf = this.toWorld(g, 2.2, -D / 2 + 1.8);
    this.labels.create('The Cabin', new THREE.Vector3(zn.x, g.position.y + 9.2, zn.z), { subtitle: 'About & Education · walk inside', accent: zn.color, near: 38, far: 70 });
    this.interact({ id: 'about', zone: 'about', x: f.x, z: f.z, radius: 3.4, title: 'About & Education' }, zn.color);
    this.interact({ id: 'about-desk', zone: 'about', x: desk.x, z: desk.z, radius: 1.5, title: 'Laptop · About me' }, zn.color, 0.9);
    this.interact({ id: 'about-shelf', zone: 'certifications', x: shelf.x, z: shelf.z, radius: 1.5, title: 'Bookshelf · Certifications' }, '#e39bd0', 0.9);
  }

  private cabin!: { group: THREE.Group; roof: THREE.Group; W: number; D: number; floorY: number; height: number };
  private cabinLight!: THREE.PointLight;
  private playerPos = new THREE.Vector3();

  /** True when the point is inside the cabin walls. */
  insideCabin(p: THREE.Vector3) {
    const g = this.cabin.group;
    const dx = p.x - g.position.x, dz = p.z - g.position.z;
    const c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return Math.abs(lx) < this.cabin.W / 2 - 0.1 && Math.abs(lz) < this.cabin.D / 2 - 0.1 && p.y > g.position.y + 0.3;
  }

  /**
   * Pulls a camera position back inside the cabin walls (and under the ceiling beams),
   * moving it along the line towards the focus point so the view stays behind the character.
   */
  clampToCabin(focus: THREE.Vector3, pos: THREE.Vector3) {
    const g = this.cabin.group;
    const c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y);
    const local = (v: THREE.Vector3) => {
      const dx = v.x - g.position.x, dz = v.z - g.position.z;
      return { x: dx * c + dz * s, y: v.y - g.position.y, z: -dx * s + dz * c };
    };
    const f = local(focus), p = local(pos);
    const hx = this.cabin.W / 2 - 0.45, hz = this.cabin.D / 2 - 0.45;
    const y0 = this.cabin.floorY + 0.5, y1 = this.cabin.floorY + this.cabin.height - 0.4;
    let t = 1;
    const limit = (from: number, to: number, lo: number, hi: number) => {
      const d = to - from;
      if (to > hi && d > 1e-5) t = Math.min(t, Math.max(0, (hi - from) / d));
      if (to < lo && d < -1e-5) t = Math.min(t, Math.max(0, (lo - from) / d));
    };
    limit(f.x, p.x, -hx, hx);
    limit(f.z, p.z, -hz, hz);
    limit(f.y, p.y, y0, y1);
    if (t < 1) pos.lerpVectors(focus, pos, t);
  }

  private screenTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const x = c.getContext('2d')!;
    const grad = x.createLinearGradient(0, 0, 512, 320);
    grad.addColorStop(0, '#1d2a22');
    grad.addColorStop(1, '#2d4033');
    x.fillStyle = grad;
    x.fillRect(0, 0, 512, 320);
    x.fillStyle = '#f2b35c';
    x.font = `700 22px ${UI_FONT}`;
    x.fillText('RÉSUMÉ', 36, 60);
    x.fillStyle = '#fff6e8';
    x.font = `600 58px ${DISPLAY_FONT}`;
    x.fillText('Hitesh A', 36, 128);
    x.font = `500 22px ${UI_FONT}`;
    x.fillStyle = 'rgba(255,246,232,.75)';
    ['AI & Data Science · Security', 'PayProof · PhishGuardAI', 'Aadhaar Analyzer · NordicGuard', 'Press E to read more'].forEach((l, i) => x.fillText(l, 36, 180 + i * 32));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private rugTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#7a2f2a';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#e8b04a';
    x.lineWidth = 8;
    x.strokeRect(14, 14, 228, 228);
    x.lineWidth = 3;
    x.strokeRect(34, 34, 188, 188);
    x.fillStyle = '#e8b04a';
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.moveTo(128, 60 + i * 30);
      x.lineTo(148, 75 + i * 30);
      x.lineTo(128, 90 + i * 30);
      x.lineTo(108, 75 + i * 30);
      x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private frameTexture(title: string, sub: string) {
    const c = document.createElement('canvas');
    c.width = 390;
    c.height = 270;
    const x = c.getContext('2d')!;
    x.fillStyle = '#5b3b26';
    x.fillRect(0, 0, 390, 270);
    x.fillStyle = '#f6ecd8';
    x.fillRect(18, 18, 354, 234);
    x.textAlign = 'center';
    x.fillStyle = '#2a2a22';
    x.font = `600 44px ${DISPLAY_FONT}`;
    x.fillText(title, 195, 130);
    x.fillStyle = '#b06a2c';
    x.font = `700 20px ${UI_FONT}`;
    x.fillText(sub.toUpperCase(), 195, 175);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------------------------------------------------------------- crystal circle

  private buildCrystals() {
    const zn = zoneById.skills;
    const g = this.zoneGroup('skills');
    this.mesh(new THREE.CylinderGeometry(8.4, 8.9, 0.4, 48), M.stone, g, 0, 0.12, 0).castShadow = false;
    const rune = new THREE.Mesh(new THREE.RingGeometry(6.9, 7.15, 96).rotateX(-Math.PI / 2), this.glow('#7fe0cc', 0.8, 3));
    rune.position.y = 0.34;
    g.add(rune);

    const palette = ['#7fe0cc', '#9fb8ff', '#e39bd0', '#ffd27a', '#ff9f6b', '#b6f08a', '#8fd3ff', '#f7a8a8'];
    skillGroups.forEach((sg, i) => {
      const a = (i / skillGroups.length) * Math.PI * 2 + Math.PI / skillGroups.length;
      const lx = Math.sin(a) * 6.1, lz = Math.cos(a) * 6.1;
      this.mesh(new THREE.CylinderGeometry(0.5, 0.72, 1.3, 8), M.stoneDark, g, lx, 0.95, lz);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette[i]).multiplyScalar(0.55),
        emissive: palette[i],
        emissiveIntensity: 0.45,
        metalness: 0,
        roughness: 0.3,
        flatShading: true,
      });
      this.glowMats.push({ mat, day: 0.45, night: 2.4 });
      const crystal = this.mesh(new THREE.OctahedronGeometry(0.55, 0), mat, g, lx, 2.6, lz);
      crystal.scale.set(1, 2.1, 1);
      const small = this.mesh(new THREE.OctahedronGeometry(0.22, 0), mat, g, lx, 2.6, lz);
      const phase = i * 0.8;
      this.updaters.push((t) => {
        crystal.position.y = 2.7 + Math.sin(t * 1.4 + phase) * 0.22;
        crystal.rotation.y = t * 0.7 + phase;
        small.position.set(lx + Math.cos(t * 1.6 + phase) * 0.95, crystal.position.y + 0.3, lz + Math.sin(t * 1.6 + phase) * 0.95);
        small.rotation.x = t;
      });
      const w = this.toWorld(g, lx, lz);
      this.colliders.addCircle(w.x, w.z, 0.8);
      this.labels.create(sg.title, new THREE.Vector3(w.x, g.position.y + 4.4, w.z), { scale: 0.5, near: 5.5, far: 9 });
    });

    // Central cluster
    this.mesh(new THREE.CylinderGeometry(1.1, 1.5, 1.1, 10), M.stoneDark, g, 0, 0.85, 0);
    const coreMat = new THREE.MeshStandardMaterial({ color: '#bff6ea', emissive: '#58d6be', emissiveIntensity: 1, roughness: 0.1, flatShading: true });
    this.glowMats.push({ mat: coreMat, day: 1, night: 3 });
    const core = new THREE.Group();
    core.position.y = 3.4;
    g.add(core);
    [
      [0, 0, 0, 1.0, 2.4],
      [0.7, -0.5, 0.2, 0.5, 1.4],
      [-0.6, -0.6, -0.3, 0.45, 1.2],
      [0.1, -0.7, -0.7, 0.4, 1.1],
    ].forEach(([x, y, z, r, sy]) => {
      const c = this.mesh(new THREE.OctahedronGeometry(r, 0), coreMat, core, x, y, z);
      c.scale.y = sy;
      c.rotation.z = x * 0.5;
    });
    const halo = this.mesh(new THREE.TorusGeometry(2.1, 0.05, 8, 64), coreMat, g, 0, 3.4, 0);
    this.updaters.push((t) => {
      core.rotation.y = t * 0.35;
      core.position.y = 3.4 + Math.sin(t) * 0.25;
      halo.rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.3, 0, t * 0.4);
      halo.position.y = core.position.y;
    });
    this.colliders.addCircle(zn.x, zn.z, 1.7);

    this.labels.create('Crystal Circle', new THREE.Vector3(zn.x, g.position.y + 7.8, zn.z), { subtitle: 'Skills', accent: zn.color, near: 40, far: 72 });
    const f = this.toWorld(g, 0, 3.6);
    this.interact({ id: 'skills', zone: 'skills', x: f.x, z: f.z, radius: 4.2, title: 'Skills' }, zn.color);
  }

  // ---------------------------------------------------------------- project grove

  private buildGrove() {
    const zn = zoneById.projects;
    const g = this.zoneGroup('projects', false);

    // Monolith at the back of the plaza
    const back = new THREE.Group();
    back.position.set(0, 0, -15.5);
    g.add(back);
    const slate = new THREE.MeshLambertMaterial({ color: '#4d5160', flatShading: true });
    this.mesh(new THREE.BoxGeometry(3.6, 0.6, 2), M.stoneDark, back, 0, 0.3, 0);
    this.mesh(new THREE.BoxGeometry(2.6, 6.4, 0.9), slate, back, 0, 3.8, 0);
    this.mesh(new THREE.ConeGeometry(1.84, 0.9, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.36), slate, back, 0, 7.45, 0);
    const inlay = this.glow('#9fb8ff', 1.8, 4);
    const inlayGeo = new THREE.BoxGeometry(1, 0.08, 0.06);
    for (let i = 0; i < 5; i++) {
      const bar = this.mesh(inlayGeo, inlay, back, 0, 1.6 + i * 1.05, 0.47);
      bar.scale.x = 1.7 - Math.abs(i - 2) * 0.35;
      bar.castShadow = false;
    }
    const core = this.mesh(new THREE.OctahedronGeometry(0.34, 0), inlay, back, 0, 5.6, 0.55);
    core.castShadow = false;
    this.updaters.push((t) => (core.rotation.y = t));
    this.colliders.addBox(zn.x, zn.z - 15.5, 3.4, 1.8);

    projectPedestals.forEach((p) => {
      const project = projects.find((pr) => pr.id === p.projectId)!;
      const local = new THREE.Group();
      local.position.set(p.x - zn.x, this.ground(p.x, p.z) - g.position.y, p.z - zn.z);
      g.add(local);
      this.mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.9, 12), M.stoneDark, local, 0, 0.45, 0);
      this.mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 24), M.stone, local, 0, 1.02, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.04, 6, 48).rotateX(Math.PI / 2), this.glow(project.accent, 1.2, 3));
      rim.position.y = 1.15;
      local.add(rim);
      this.beam(local, project.accent, 3.6, 0.95).position.y = 1.15 + 1.8;

      const emblem = this.emblem(project.id, project.accent);
      emblem.position.y = 3.1;
      emblem.scale.setScalar(1.45);
      local.add(emblem);
      const phase = rnd() * 6;
      this.updaters.push((t) => {
        emblem.rotation.y = t * 0.8 + phase;
        emblem.position.y = 3.2 + Math.sin(t * 1.5 + phase) * 0.15;
      });
      this.colliders.addCircle(p.x, p.z, 1.1);
      this.labels.create(project.name, new THREE.Vector3(p.x, this.ground(p.x, p.z) + 5.3, p.z), {
        subtitle: 'Project',
        accent: project.accent,
        scale: 0.6,
        near: 9,
        far: 16,
      });
      const toCenter = Math.atan2(zn.x - p.x, zn.z + 6 - p.z);
      this.interact(
        {
          id: `project-${project.id}`,
          zone: 'projects',
          projectId: project.id,
          x: p.x + Math.sin(toCenter) * 2.1,
          z: p.z + Math.cos(toCenter) * 2.1,
          radius: 2.1,
          title: project.name,
        },
        project.accent,
        1.3,
      );
    });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) continue; // keep the entrance open
      this.lantern(g, Math.sin(a) * 12.5, Math.cos(a) * 12.5, 2.5, '#bcd0ff');
      this.colliders.addCircle(zn.x + Math.sin(a) * 12.5, zn.z + Math.cos(a) * 12.5, 0.25);
    }

    this.labels.create('Project Grove', new THREE.Vector3(zn.x, g.position.y + 9.2, zn.z - 15.5), {
      subtitle: 'Projects',
      accent: zn.color,
      scale: 1.1,
      near: 45,
      far: 80,
    });
    this.interact({ id: 'projects', zone: 'projects', x: zn.x, z: zn.z + 4, radius: 3.6, title: 'All Projects' }, zn.color, 2.4);
  }

  private emblem(id: string, color: string) {
    const c = new THREE.Color(color);
    const solid = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.4), toneMapped: false });
    const faint = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.1), transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    const wire = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.8), wireframe: true, toneMapped: false });
    const g = new THREE.Group();
    switch (id) {
      case 'payproof': {
        const sheetGeo = new THREE.BoxGeometry(0.72, 0.96, 0.02);
        const edges = new THREE.EdgesGeometry(sheetGeo);
        const line = new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(1.8), toneMapped: false });
        for (let i = 0; i < 3; i++) {
          const sheet = new THREE.Mesh(sheetGeo, faint);
          sheet.position.set(-0.12 + i * 0.12, -0.08 + i * 0.08, -0.12 + i * 0.12);
          sheet.add(new THREE.LineSegments(edges, line));
          g.add(sheet);
        }
        for (let i = 0; i < 3; i++) {
          const text = new THREE.Mesh(new THREE.BoxGeometry(0.42 - i * 0.08, 0.035, 0.01), solid);
          text.position.set(0.12 - 0.02, 0.2 - i * 0.14, 0.14);
          g.add(text);
        }
        const check = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 32), wire);
        check.position.set(0.22, 0.25, 0.2);
        g.add(check);
        break;
      }
      case 'phishguard': {
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), wire));
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 32, Math.PI * 1.4), solid);
        hook.rotation.z = Math.PI * 0.8;
        g.add(hook);
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), solid).translateY(0.35).translateX(0.28));
        break;
      }
      case 'aadhaar': {
        [0.5, 0.9, 0.7, 1.2, 0.95].forEach((h, i) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), i === 3 ? solid : faint);
          bar.position.set(-0.5 + i * 0.25, h / 2 - 0.5, 0);
          g.add(bar);
        });
        g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.4), wire).translateY(-0.52));
        break;
      }
      default: {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.7);
        shape.quadraticCurveTo(0.35, 0.62, 0.62, 0.52);
        shape.quadraticCurveTo(0.62, -0.25, 0, -0.75);
        shape.quadraticCurveTo(-0.62, -0.25, -0.62, 0.52);
        shape.quadraticCurveTo(-0.35, 0.62, 0, 0.7);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
        geo.center();
        g.add(new THREE.Mesh(geo, faint));
        const edge = new THREE.Mesh(geo, wire);
        edge.scale.setScalar(1.06);
        g.add(edge);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), solid);
        g.add(star);
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- trophies

  private buildTrophies() {
    const zn = zoneById.achievements;
    const g = this.zoneGroup('achievements');
    // Stepped stage at the back
    for (let i = 0; i < 3; i++) {
      this.mesh(new THREE.CylinderGeometry(7.5 - i * 1.4, 7.7 - i * 1.4, 0.35, 40, 1, false, Math.PI * 0.62, Math.PI * 0.76), M.stone, g, 0, 0.18 + i * 0.35, -1.2).castShadow = false;
    }
    // Backdrop columns
    for (const sx of [-1, 1]) {
      this.mesh(new THREE.CylinderGeometry(0.45, 0.55, 6, 10), M.stone, g, sx * 4.4, 3, -6);
      this.mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), M.stoneDark, g, sx * 4.4, 6.2, -6);
      const w = this.toWorld(g, sx * 4.4, -6);
      this.colliders.addCircle(w.x, w.z, 0.7);
    }
    this.mesh(new THREE.BoxGeometry(10.4, 0.7, 1.4), M.stone, g, 0, 6.8, -6);
    const hall = this.cloth(7.2, 1.3, this.wideBannerTexture('HALL OF TROPHIES', '10+ hackathon podiums'));
    hall.position.set(0, 6.4, -5.2);
    g.add(hall);

    const gold = new THREE.MeshStandardMaterial({ color: '#f1c15b', metalness: 0.85, roughness: 0.28, emissive: '#5a3c08', emissiveIntensity: 0.6 });
    const silver = new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.85, roughness: 0.25, emissive: '#3d4650', emissiveIntensity: 0.5 });
    const bronze = new THREE.MeshStandardMaterial({ color: '#d58a4f', metalness: 0.85, roughness: 0.3, emissive: '#4a2408', emissiveIntensity: 0.6 });

    const cupProfile = [
      [0, 0], [0.42, 0], [0.42, 0.1], [0.14, 0.18], [0.1, 0.55], [0.18, 0.62], [0.46, 0.8], [0.52, 1.25], [0.47, 1.28], [0.4, 0.86], [0, 0.78],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const cupGeo = new THREE.LatheGeometry(cupProfile, 28);
    const handleGeo = new THREE.TorusGeometry(0.2, 0.04, 8, 20, Math.PI * 1.2);

    achievements.forEach((ach, i) => {
      const a = ((i - (achievements.length - 1) / 2) / achievements.length) * Math.PI * 1.05;
      const R = 5.2;
      const lx = Math.sin(a) * R, lz = -Math.cos(a) * R + 2.2;
      const pedestalH = 1.1 + (ach.place === '2nd' ? 0.35 : 0);
      this.mesh(new THREE.BoxGeometry(1.1, pedestalH, 1.1), M.stoneDark, g, lx, pedestalH / 2, lz).rotation.y = -a;
      this.mesh(new THREE.BoxGeometry(1.25, 0.12, 1.25), M.stone, g, lx, pedestalH + 0.06, lz).rotation.y = -a;
      const mat = ach.place === '2nd' ? silver : ach.place === '3rd' ? bronze : gold;
      const trophy = new THREE.Group();
      trophy.position.set(lx, pedestalH + 0.12, lz);
      g.add(trophy);
      if (ach.place === 'Ranked') {
        const medal = this.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32), mat, trophy, 0, 0.9, 0);
        medal.rotation.x = Math.PI / 2;
        this.mesh(new THREE.OctahedronGeometry(0.2, 0), mat, trophy, 0, 0.9, 0.08).scale.set(1, 1, 0.3);
        this.mesh(new THREE.BoxGeometry(0.1, 0.5, 0.02), new THREE.MeshLambertMaterial({ color: '#b73a3a' }), trophy, 0, 1.45, 0);
      } else {
        this.mesh(cupGeo, mat, trophy);
        for (const sx of [-1, 1]) {
          const h = this.mesh(handleGeo, mat, trophy, sx * 0.5, 0.95, 0);
          h.rotation.z = sx > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
          if (sx < 0) h.rotation.y = Math.PI;
        }
      }
      const phase = i;
      this.updaters.push((t) => {
        trophy.rotation.y = t * 0.6 + phase;
        trophy.position.y = pedestalH + 0.12 + Math.sin(t * 1.2 + phase) * 0.06;
      });
      const w = this.toWorld(g, lx, lz);
      this.colliders.addCircle(w.x, w.z, 0.85);
      this.labels.create(`${ach.place} · ${ach.event.split(' —')[0]}`, new THREE.Vector3(w.x, g.position.y + pedestalH + 2.2, w.z), {
        scale: 0.4,
        near: 3.5,
        far: 6.5,
      });
    });

    const sparkle = this.risingParticles({ count: 40, height: 4, spread: 6, size: 0.12, color: '#ffe39a', additive: true, speed: 0.08 });
    sparkle.position.set(0, 1, -0.5);
    g.add(sparkle);

    this.labels.create('Hall of Trophies', new THREE.Vector3(zn.x, g.position.y + 9.4, zn.z), { subtitle: 'Hackathons & Achievements', accent: zn.color, near: 40, far: 72 });
    const f = this.toWorld(g, 0, 4.2);
    this.interact({ id: 'achievements', zone: 'achievements', x: f.x, z: f.z, radius: 4, title: 'Hackathons & Achievements' }, zn.color);
  }

  private wideBannerTexture(title: string, sub: string) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 190;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6b2f2a';
    g.fillRect(0, 0, 1024, 190);
    g.strokeStyle = '#f2c46b';
    g.lineWidth = 6;
    g.strokeRect(14, 14, 996, 162);
    g.fillStyle = '#ffe2a8';
    g.textAlign = 'center';
    g.font = `600 70px ${DISPLAY_FONT}`;
    g.fillText(title, 512, 98);
    g.font = `600 28px ${UI_FONT}`;
    g.fillStyle = '#f2c46b';
    g.fillText(sub.toUpperCase(), 512, 150);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------------------------------------------------------------- certification banners

  private buildBanners() {
    const zn = zoneById.certifications;
    const g = this.zoneGroup('certifications');
    const colors = [
      ['#1f5c4d', '#9fe3c9'],
      ['#1f3d66', '#9fc6ff'],
      ['#6a2e5a', '#f3b4df'],
    ];
    certifications.forEach((cert, i) => {
      const lx = (i - 1) * 3.4;
      const lz = -1.5 - Math.abs(i - 1) * -0.8;
      this.mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 8), M.stoneDark, g, lx, 0.25, lz);
      this.mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.4, 8), M.woodDark, g, lx, 3.2, lz);
      this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), M.woodDark, g, lx, 6.0, lz).rotation.z = Math.PI / 2;
      this.mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: '#e8b04a', metalness: 0.8, roughness: 0.3 }), g, lx, 6.5, lz);
      const tex = this.certTexture(cert.issuer, cert.title, colors[i][0], colors[i][1]);
      const cloth = this.cloth(2.3, 3.6, tex);
      cloth.position.set(lx, 5.95, lz + 0.08);
      g.add(cloth);
      const w = this.toWorld(g, lx, lz);
      this.colliders.addCircle(w.x, w.z, 0.6);
    });
    this.labels.create('Banner Ridge', new THREE.Vector3(zn.x, g.position.y + 9, zn.z), { subtitle: 'Certifications', accent: zn.color, near: 40, far: 72 });
    const f = this.toWorld(g, 0, 3.2);
    this.interact({ id: 'certifications', zone: 'certifications', x: f.x, z: f.z, radius: 4, title: 'Certifications' }, zn.color);
  }

  private certTexture(issuer: string, title: string, bg: string, fg: string) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 800;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 800);
    grad.addColorStop(0, shade(bg, 0.06));
    grad.addColorStop(1, shade(bg, -0.06));
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 800);
    g.strokeStyle = '#e9c173';
    g.lineWidth = 10;
    g.strokeRect(26, 26, 460, 700);
    // pointed tail
    g.fillStyle = '#e9c173';
    g.beginPath();
    g.moveTo(0, 760);
    g.lineTo(256, 800);
    g.lineTo(512, 760);
    g.lineTo(512, 800);
    g.lineTo(0, 800);
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = fg;
    g.beginPath();
    g.arc(256, 150, 58, 0, Math.PI * 2);
    g.lineWidth = 6;
    g.strokeStyle = fg;
    g.stroke();
    g.font = `700 54px ${DISPLAY_FONT}`;
    g.fillText('✦', 256, 170);
    g.font = `700 30px ${UI_FONT}`;
    g.letterSpacing = '4px';
    wrapText(g, issuer.toUpperCase(), 400).forEach((l, i) => g.fillText(l, 256, 270 + i * 40));
    g.letterSpacing = '0px';
    g.fillStyle = '#fff6e8';
    g.font = `600 44px ${DISPLAY_FONT}`;
    wrapText(g, title, 400).forEach((l, i) => g.fillText(l, 256, 400 + i * 58));
    g.fillStyle = '#e9c173';
    g.fillRect(186, 660, 140, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // ---------------------------------------------------------------- lakeside camp

  private campLight!: THREE.PointLight;

  private buildCamp() {
    const zn = zoneById.contact;
    const g = this.zoneGroup('contact');

    // Fire pit
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = this.mesh(new THREE.DodecahedronGeometry(0.28, 0), M.stoneDark, g, Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95);
      s.scale.set(1, 0.7, 1);
      s.rotation.set(rnd(), rnd(), rnd());
    }
    const logGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.3, 7).translate(0, 0.65, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const log = this.mesh(logGeo, M.woodDark, g, Math.sin(a) * 0.55, 0.05, Math.cos(a) * 0.55);
      log.rotation.order = 'YXZ';
      log.rotation.set(-0.62, a, 0);
    }
    const flames = new THREE.Group();
    flames.position.y = 0.3;
    g.add(flames);
    for (let i = 0; i < 3; i++) flames.add(this.flame(1.1 - i * 0.2, 1.9 - i * 0.35, i * 3.1));
    const embers = this.risingParticles({ count: 36, height: 5, spread: 0.6, size: 0.07, color: '#ffa04a', additive: true, speed: 0.35 });
    embers.position.y = 0.5;
    g.add(embers);
    this.campLight = new THREE.PointLight('#ff9a4a', 20, 16, 1.6);
    this.campLight.position.set(0, 1.4, 0);
    g.add(this.campLight);
    this.colliders.addCircle(zn.x, zn.z, 1.3);

    // Tent
    const tentMat = new THREE.MeshLambertMaterial({ color: '#d9894a', flatShading: true, side: THREE.DoubleSide });
    const tent = this.mesh(new THREE.ConeGeometry(2.3, 2.7, 4, 1, true), tentMat, g, -4.6, 1.35, -2.6);
    tent.rotation.y = Math.PI / 4 + 0.3;
    const flap = this.mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshLambertMaterial({ color: '#3a2618', side: THREE.DoubleSide }), g, -3.55, 0.75, -1.5);
    flap.rotation.y = 0.3 + Math.PI / 4;
    this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), M.woodDark, g, -4.6, 3.0, -2.6);
    const tw = this.toWorld(g, -4.6, -2.6);
    this.colliders.addCircle(tw.x, tw.z, 2.1);

    // Log benches
    [
      [2.6, 1.0, 0.5],
      [-1.2, 2.8, 1.35],
      [1.0, -2.7, -0.4],
    ].forEach(([x, z, r]) => {
      const b = this.mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.2, 10).rotateZ(Math.PI / 2), M.wood, g, x, 0.28, z);
      b.rotation.y = r;
      const w = this.toWorld(g, x, z);
      this.colliders.addCircle(w.x, w.z, 0.7);
    });

    // Signpost with contact arrows
    const post = new THREE.Group();
    post.position.set(3.6, 0, -2.4);
    g.add(post);
    this.mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.8, 8), M.woodDark, post, 0, 1.9, 0);
    ['GitHub', 'LinkedIn', 'Email', 'Phone'].forEach((txt, i) => {
      const board = this.signBoard(txt);
      board.position.set(0, 3.25 - i * 0.62, 0);
      board.rotation.y = [0.4, -0.7, 1.9, -2.3][i];
      post.add(board);
    });
    const pw = this.toWorld(g, 3.6, -2.4);
    this.colliders.addCircle(pw.x, pw.z, 0.35);

    this.lantern(g, -2.2, -4.4, 2.4);
    this.lantern(g, 4.8, 2.6, 2.4);

    // Mailbox
    const mailbox = new THREE.Group();
    mailbox.position.set(-3.2, 0, 3.2);
    g.add(mailbox);
    this.mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 6), M.woodDark, mailbox, 0, 0.6, 0);
    const box = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16, 1, false, 0, Math.PI);
    const boxMesh = this.mesh(box, new THREE.MeshLambertMaterial({ color: '#b5463a', side: THREE.DoubleSide }), mailbox, 0, 1.3, 0);
    boxMesh.rotation.z = Math.PI / 2;
    boxMesh.rotation.y = Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(0.6, 0.3, 0.8), new THREE.MeshLambertMaterial({ color: '#b5463a' }), mailbox, 0, 1.15, 0);
    const flag = this.mesh(new THREE.BoxGeometry(0.04, 0.35, 0.18), new THREE.MeshLambertMaterial({ color: '#f2c46b' }), mailbox, 0.32, 1.45, 0.1);
    this.updaters.push((t) => (flag.rotation.x = Math.sin(t * 2) * 0.1));
    const mw = this.toWorld(g, -3.2, 3.2);
    this.colliders.addCircle(mw.x, mw.z, 0.5);

    this.labels.create('Lakeside Camp', new THREE.Vector3(zn.x, g.position.y + 6.8, zn.z), { subtitle: 'Contact', accent: zn.color, near: 40, far: 72 });
    const f = this.toWorld(g, 0, 3.4);
    this.interact({ id: 'contact', zone: 'contact', x: f.x, z: f.z, radius: 4.2, title: 'Contact' }, zn.color);
  }

  private signBoard(text: string) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#a4764c';
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(430, 14);
    g.lineTo(506, 64);
    g.lineTo(430, 114);
    g.lineTo(0, 114);
    g.closePath();
    g.fill();
    g.fillStyle = '#5b3b26';
    g.fillRect(0, 100, 440, 6);
    g.font = `700 54px ${UI_FONT}`;
    g.fillStyle = '#fff3dc';
    g.textBaseline = 'middle';
    g.fillText(text, 30, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), mat);
    m.geometry.translate(0.85, 0, 0);
    m.castShadow = true;
    return m;
  }

  private flame(width: number, height: number, seed: number) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uSeed;
        varying vec2 vUv;
        ${noiseGLSL}
        void main() {
          vec2 uv = vUv;
          float x = (uv.x - 0.5) * 2.0;
          float n = fbm2(vec2(x * 1.6 + uSeed, uv.y * 2.4 - uTime * 2.6));
          float width = (1.0 - uv.y) * 0.95 + 0.04;
          float shape = 1.0 - smoothstep(0.35, 1.0, abs(x + (n - 0.5) * 0.5 * uv.y) / width);
          shape *= smoothstep(1.0, 0.2, uv.y + (n - 0.5) * 0.45) * smoothstep(0.0, 0.08, uv.y);
          vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.86, 0.45), smoothstep(0.35, 0.95, shape));
          gl_FragColor = vec4(col * shape * 2.2, shape);
        }
      `,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0), mat);
    m.userData.offset = (seed / 3.1) * 0.9;
    this.billboards.push(m);
    this.updaters.push((t) => (mat.uniforms.uTime.value = t));
    m.renderOrder = 5;
    return m;
  }

  private risingParticles(o: { count: number; height: number; spread: number; size: number; color: string; additive: boolean; speed: number }) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.attributes.position = plane.attributes.position;
    geo.attributes.uv = plane.attributes.uv;
    const seeds = new Float32Array(o.count * 3);
    for (let i = 0; i < o.count; i++) seeds.set([rnd(), rnd(), rnd()], i * 3);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    geo.instanceCount = o.count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(o.color) },
        uHeight: { value: o.height },
        uSpread: { value: o.spread },
        uSize: { value: o.size },
        uSpeed: { value: o.speed },
        uAdd: { value: o.additive ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uHeight, uSpread, uSize, uSpeed;
        varying vec2 vUv;
        varying float vLife;
        void main() {
          float life = fract(uTime * uSpeed * (0.7 + aSeed.z * 0.6) + aSeed.x);
          vec3 p = vec3((aSeed.x - 0.5) * uSpread, life * uHeight, (aSeed.y - 0.5) * uSpread);
          p.x += sin(life * 6.0 + aSeed.y * 20.0) * 0.3 * life * uSpread;
          p.z += cos(life * 5.0 + aSeed.x * 20.0) * 0.3 * life * uSpread;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * uSize * (0.6 + life * 1.4);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vLife = life;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAdd;
        varying vec2 vUv;
        varying float vLife;
        void main() {
          float d = length(vUv - 0.5);
          float a = smoothstep(0.5, 0.0, d) * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife);
          a *= mix(0.35, 1.4, uAdd);
          vec3 col = uColor * mix(1.0, 2.2, uAdd);
          gl_FragColor = vec4(col * mix(1.0, a, uAdd), a);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    this.updaters.push((t) => (mat.uniforms.uTime.value = t));
    return mesh;
  }

  // ---------------------------------------------------------------- update

  setEnvIntensity(night: number) {
    for (const g of this.glowMats) g.mat.emissiveIntensity = g.day + (g.night - g.day) * night;
  }

  update(time: number, dt: number, night: number, player: THREE.Vector3, camera: THREE.Camera) {
    this.playerPos.copy(player);
    for (const u of this.updaters) u(time, dt, night);
    // The camera stays under the ceiling indoors, so the roof only hides if the view is from above it.
    const cam = camera.position;
    this.cabin.roof.visible = !(this.insideCabin(player) && cam.y > this.cabin.group.position.y + this.cabin.floorY + this.cabin.height);
    this.cabinLight.intensity = 7 + night * 12;
    this.setEnvIntensity(night);
    for (const r of this.rings) {
      r.mat.uniforms.uTime.value = time;
      const near = Math.hypot(player.x - r.x, player.z - r.z) < r.r + 1.5 ? 1 : 0;
      r.mat.uniforms.uActive.value += (near - r.mat.uniforms.uActive.value) * Math.min(1, dt * 5);
    }
    const flicker = Math.sin(time * 9) * 0.12 + Math.sin(time * 23.7) * 0.08 + Math.sin(time * 4.3) * 0.1;
    this.campLight.intensity = (6 + night * 30) * (1 + flicker);

    // Cylindrical billboarding for flames (parents only rotate around Y).
    for (const o of this.billboards) {
      o.getWorldPosition(this.tmpV);
      const yaw = Math.atan2(camera.position.x - this.tmpV.x, camera.position.z - this.tmpV.z);
      const parentYaw = o.parent?.parent ? o.parent.parent.rotation.y : 0;
      o.rotation.y = yaw - parentYaw + o.userData.offset;
    }
  }
}
