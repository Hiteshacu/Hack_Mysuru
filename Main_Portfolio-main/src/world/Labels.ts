import * as THREE from 'three';

export const DISPLAY_FONT = '"Fraunces Variable", Georgia, serif';
export const UI_FONT = '"Manrope Variable", system-ui, sans-serif';

interface LabelOptions {
  subtitle?: string;
  accent?: string;
  scale?: number;
  near?: number;
  far?: number;
}

export interface Label {
  sprite: THREE.Sprite;
  near: number;
  far: number;
}

/** Crisp canvas-rendered billboard labels that fade in as the player approaches. */
export class Labels {
  readonly group = new THREE.Group();
  private list: Label[] = [];

  create(title: string, position: THREE.Vector3, opts: LabelOptions = {}) {
    const dpr = 2;
    const padX = 42 * dpr;
    const titleSize = 46 * dpr;
    const subSize = 19 * dpr;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = `600 ${titleSize}px ${DISPLAY_FONT}`;
    const tw = g.measureText(title).width;
    let sw = 0;
    if (opts.subtitle) {
      g.font = `700 ${subSize}px ${UI_FONT}`;
      sw = g.measureText(opts.subtitle.toUpperCase()).width + opts.subtitle.length * 3 * dpr;
    }
    const w = Math.ceil(Math.max(tw, sw) + padX * 2);
    const h = Math.ceil(opts.subtitle ? 150 * dpr : 106 * dpr);
    c.width = w;
    c.height = h;

    const r = 26 * dpr;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fillStyle = 'rgba(24, 32, 22, 0.58)';
    g.fill();
    g.lineWidth = 2 * dpr;
    g.strokeStyle = 'rgba(255, 240, 214, 0.35)';
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let y = h / 2;
    if (opts.subtitle) {
      g.font = `700 ${subSize}px ${UI_FONT}`;
      g.fillStyle = opts.accent ?? '#f2b35c';
      g.letterSpacing = `${3 * dpr}px`;
      g.fillText(opts.subtitle.toUpperCase(), w / 2, 48 * dpr);
      g.letterSpacing = '0px';
      y = 96 * dpr;
    }
    g.font = `600 ${titleSize}px ${DISPLAY_FONT}`;
    g.fillStyle = '#fff6e8';
    g.fillText(title, w / 2, y);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    const s = (opts.scale ?? 1) * 0.0105;
    sprite.scale.set((w / dpr) * s, (h / dpr) * s, 1);
    sprite.position.copy(position);
    sprite.renderOrder = 10;
    this.group.add(sprite);
    const label = { sprite, near: opts.near ?? 40, far: opts.far ?? 70 };
    this.list.push(label);
    return label;
  }

  update(player: THREE.Vector3) {
    for (const l of this.list) {
      const d = l.sprite.position.distanceTo(player);
      const o = 1 - THREE.MathUtils.smoothstep(d, l.near, l.far);
      l.sprite.material.opacity = o;
      l.sprite.visible = o > 0.01;
    }
  }
}
