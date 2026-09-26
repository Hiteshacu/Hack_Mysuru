import * as THREE from 'three';
import { noiseGLSL } from '../shaders/noise.glsl';

const MAX_SPARKS = 600;

/** Soft star-shaped muzzle flash. */
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? 22 : 62;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
}

interface Explosion {
  fire: THREE.Mesh;
  ring: THREE.Mesh;
  scorch: THREE.Mesh;
  light: THREE.PointLight;
  age: number;
  radius: number;
}

/** Pooled, lightweight combat VFX: tracers, muzzle flashes, sparks/debris, explosions and smoke. */
export class Effects {
  readonly group = new THREE.Group();
  private tracers: Tracer[] = [];
  private tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private flashMat = new THREE.SpriteMaterial({ map: flashTexture(), color: new THREE.Color(4, 3, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private flashes: { sprite: THREE.Sprite; life: number }[] = [];
  private flashLight = new THREE.PointLight('#ffb35a', 0, 9, 2);
  private explosions: Explosion[] = [];

  // Particles (sparks, embers, smoke) share one Points buffer.
  private pPos = new Float32Array(MAX_SPARKS * 3);
  private pVel = new Float32Array(MAX_SPARKS * 3);
  private pCol = new Float32Array(MAX_SPARKS * 4);
  private pLife = new Float32Array(MAX_SPARKS);
  private pMax = new Float32Array(MAX_SPARKS);
  private pSize = new Float32Array(MAX_SPARKS);
  private pKind = new Uint8Array(MAX_SPARKS); // 0 spark, 1 smoke
  private pCursor = 0;
  private points: THREE.Points;
  private fireMat: THREE.ShaderMaterial;
  shake = 0;

  constructor() {
    this.group.add(this.flashLight);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uScale: { value: 600 } },
        vertexShader: /* glsl */ `
          attribute float size;
          attribute vec4 color;
          uniform float uScale;
          varying vec4 vColor;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uScale / max(-mv.z, 0.5);
            gl_Position = projectionMatrix * mv;
            vColor = color;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec4 vColor;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            if (a < 0.01) discard;
            gl_FragColor = vec4(vColor.rgb, vColor.a * a);
          }
        `,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.group.add(this.points);

    this.fireMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAge: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAge;
        varying vec3 vN;
        varying vec3 vP;
        ${noiseGLSL}
        void main() {
          float n = fbm2(vP.xy * 2.5 + vP.z * 1.7 + uTime * 3.0);
          float rim = pow(abs(vN.z), 1.5);
          vec3 hot = vec3(1.0, 0.92, 0.6);
          vec3 fire = vec3(1.0, 0.42, 0.08);
          vec3 col = mix(fire, hot, rim * (1.0 - uAge));
          float a = clamp((rim * 0.9 + n * 0.6) * (1.0 - uAge * uAge), 0.0, 1.0);
          gl_FragColor = vec4(col * 3.0 * a, a);
        }
      `,
    });
  }

  // ---------------------------------------------------------------- spawners

  tracer(from: THREE.Vector3, to: THREE.Vector3, enemy = false) {
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) {
      if (this.tracers.length > 60) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), enemy ? this.tracerMat.clone() : this.tracerMat);
      mesh.renderOrder = 9;
      this.group.add(mesh);
      t = { mesh, life: 0 };
      this.tracers.push(t);
    }
    const len = from.distanceTo(to);
    t.mesh.position.copy(from).lerp(to, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.035, 0.035, len);
    (t.mesh.material as THREE.MeshBasicMaterial).color.set(enemy ? new THREE.Color(4, 1.2, 0.8) : new THREE.Color(4, 3.2, 1.6));
    t.mesh.visible = true;
    t.life = 0.07;
  }

  muzzle(at: THREE.Vector3, light = true) {
    let f = this.flashes.find((x) => x.life <= 0);
    if (!f) {
      const sprite = new THREE.Sprite(this.flashMat);
      sprite.renderOrder = 9;
      this.group.add(sprite);
      f = { sprite, life: 0 };
      this.flashes.push(f);
    }
    f.sprite.position.copy(at);
    f.sprite.scale.setScalar(0.45 + Math.random() * 0.25);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    f.life = 0.05;
    if (light) {
      this.flashLight.position.copy(at);
      this.flashLight.intensity = 6;
    }
  }

  private emit(kind: number, pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, alpha: number, size: number, life: number) {
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % MAX_SPARKS;
    this.pPos.set([pos.x, pos.y, pos.z], i * 3);
    this.pVel.set([vel.x, vel.y, vel.z], i * 3);
    this.pCol.set([color.r, color.g, color.b, alpha], i * 4);
    this.pLife[i] = life;
    this.pMax[i] = life;
    this.pSize[i] = size;
    this.pKind[i] = kind;
  }

  /** Dry dust kicked up by boots — footfalls when sprinting, a bigger puff on landing. */
  dust(at: THREE.Vector3, count = 4, strength = 1) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set((Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 1.5).multiplyScalar(strength);
      this.emit(1, at, v, new THREE.Color('#b6a488'), 0.2 + Math.random() * 0.18, 0.22 + Math.random() * 0.28, 0.45 + Math.random() * 0.45);
    }
  }

  sparks(at: THREE.Vector3, normal = new THREE.Vector3(0, 1, 0), count = 10, color = new THREE.Color(3, 2.2, 1)) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 5).addScaledVector(normal, 2);
      this.emit(0, at, v, color, 1, 0.05 + Math.random() * 0.05, 0.25 + Math.random() * 0.3);
    }
    this.emit(1, at, new THREE.Vector3(0, 0.6, 0), new THREE.Color('#9a9184'), 0.5, 0.35, 0.8);
  }

  explosion(at: THREE.Vector3, radius = 6) {
    const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.fireMat.clone());
    fire.position.copy(at).add(new THREE.Vector3(0, 0.6, 0));
    fire.renderOrder = 9;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.6, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    ring.position.copy(at).add(new THREE.Vector3(0, 0.15, 0));
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.45, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#150f0a', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    scorch.position.copy(at).add(new THREE.Vector3(0, 0.06, 0));
    const light = new THREE.PointLight('#ff8a3a', 60, radius * 4, 1.6);
    light.position.copy(at).add(new THREE.Vector3(0, 1.5, 0));
    this.group.add(fire, ring, scorch, light);
    this.explosions.push({ fire, ring, scorch, light, age: 0, radius });

    const v = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 12);
      this.emit(0, at.clone().add(new THREE.Vector3(0, 0.5, 0)), v, new THREE.Color(3, 1.4 + Math.random(), 0.4), 1, 0.07 + Math.random() * 0.08, 0.5 + Math.random() * 0.8);
    }
    for (let i = 0; i < 18; i++) {
      v.set(Math.random() - 0.5, 0.6 + Math.random(), Math.random() - 0.5).multiplyScalar(2.2);
      const grey = 0.18 + Math.random() * 0.2;
      this.emit(1, at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2)), v, new THREE.Color(grey, grey * 0.95, grey * 0.9), 0.75, 1.1 + Math.random() * 1.2, 2.2 + Math.random() * 1.5);
    }
    this.shake = Math.max(this.shake, 0.6);
  }

  // ---------------------------------------------------------------- update

  update(dt: number, time: number) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 90);

    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.pLife[i] <= 0) {
        this.pCol[i * 4 + 3] = 0;
        continue;
      }
      this.pLife[i] -= dt;
      const k = this.pKind[i];
      const drag = k === 1 ? 0.9 : 0.98;
      this.pVel[i * 3] *= drag;
      this.pVel[i * 3 + 2] *= drag;
      this.pVel[i * 3 + 1] = k === 1 ? this.pVel[i * 3 + 1] * 0.97 + dt * 0.4 : this.pVel[i * 3 + 1] - 14 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      const life = Math.max(0, this.pLife[i] / this.pMax[i]);
      if (k === 1) {
        this.pSize[i] += dt * 1.2;
        this.pCol[i * 4 + 3] = Math.min(0.6, life * 0.9);
      } else {
        this.pCol[i * 4 + 3] = life;
      }
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.age += dt;
      const t = Math.min(1, e.age / 0.55);
      const mat = e.fire.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = time;
      mat.uniforms.uAge.value = t;
      e.fire.scale.setScalar(0.6 + e.radius * 0.42 * Math.sqrt(t));
      e.fire.visible = t < 1;
      const rt = Math.min(1, e.age / 0.4);
      e.ring.scale.setScalar(0.5 + e.radius * 1.2 * rt);
      (e.ring.material as THREE.MeshBasicMaterial).opacity = 1 - rt;
      e.ring.visible = rt < 1;
      e.light.intensity = Math.max(0, 60 * (1 - e.age / 0.45));
      (e.scorch.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - Math.max(0, (e.age - 8) / 6));
      if (e.age > 14) {
        this.group.remove(e.fire, e.ring, e.scorch, e.light);
        e.fire.geometry.dispose();
        (e.fire.material as THREE.Material).dispose();
        e.ring.geometry.dispose();
        e.scorch.geometry.dispose();
        this.explosions.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }

  setPixelScale(heightPx: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx * 0.7;
  }
}
