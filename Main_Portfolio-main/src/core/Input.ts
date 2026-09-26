type TapHandler = (x: number, y: number) => void;

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * Keyboard, mouse, touch and joystick input with two mouse modes:
 * - Explore: drag to look around, click the ground to walk there, wheel to zoom.
 * - Battle: click to lock the mouse; moving the mouse aims, left button fires, right button throws a grenade.
 */
export class Input {
  enabled = true;
  battleMode = false;
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  joystick = { x: 0, y: 0 };
  dragX = 0;
  dragY = 0;
  wheel = 0;
  lastDragTime = -10;
  onTap?: TapHandler;
  onSecondary?: () => void;
  onKey?: (code: string) => void;
  onLockChange?: (locked: boolean) => void;
  mouseFiring = false;
  touchFiring = false;
  /** A click can start and end inside one frame — this keeps it "held" until a shot goes off. */
  private firePulseUntil = 0;
  /** Right mouse held (or touch scope toggle) → look through the rifle scope. */
  mouseScoping = false;
  touchScoping = false;
  pointerX = window.innerWidth / 2;
  pointerY = window.innerHeight / 2;
  pointerOverCanvas = false;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; mouse: boolean }>();
  private pinchDist = 0;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFiring = false;
    });
    el.addEventListener('pointerdown', this.pointerdown);
    window.addEventListener('pointermove', this.pointermove);
    window.addEventListener('pointerup', this.pointerup);
    window.addEventListener('pointercancel', this.pointerup);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaY;
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerenter', () => (this.pointerOverCanvas = true));
    el.addEventListener('pointerleave', () => (this.pointerOverCanvas = false));
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) {
        this.mouseFiring = false;
        this.mouseScoping = false;
      }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) {
        this.dragX += e.movementX;
        this.dragY += e.movementY;
      }
    });
  }

  get locked() {
    return document.pointerLockElement === this.el;
  }

  lock() {
    if (this.locked || !this.el.requestPointerLock) return;
    try {
      const p = this.el.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
    } catch {
      /* pointer lock unsupported */
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  get scoping() {
    return this.enabled && this.battleMode && (this.mouseScoping || this.touchScoping);
  }

  get firing() {
    return this.enabled && this.battleMode && (this.mouseFiring || performance.now() < this.firePulseUntil || this.touchFiring || this.keys.has('KeyF'));
  }

  private keydown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      if (this.enabled) e.preventDefault();
    }
    this.onKey?.(e.code);
  };

  private pointerdown = (e: PointerEvent) => {
    const mouse = e.pointerType === 'mouse';
    if (mouse && this.battleMode && this.enabled) {
      if (!this.locked) {
        // The click that grabs the mouse also fires, so shooting never feels unresponsive
        // (and it keeps working if the browser refuses the pointer lock).
        this.lock();
        if (e.button === 0) {
          this.mouseFiring = true;
          this.firePulseUntil = performance.now() + 150;
        }
        if (e.button === 2) this.mouseScoping = true;
        return;
      }
      if (e.button === 0) {
        this.mouseFiring = true;
        this.firePulseUntil = performance.now() + 150;
      }
      if (e.button === 2) this.mouseScoping = true;
      if (e.button === 1) {
        e.preventDefault();
        this.onSecondary?.();
      }
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, mouse });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private pointermove = (e: PointerEvent) => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.wheel += (this.pinchDist - d) * 4;
      this.pinchDist = d;
      return;
    }
    if (p.moved) {
      this.dragX += dx;
      this.dragY += dy;
      this.lastDragTime = performance.now() / 1000;
    }
  };

  private pointerup = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button === 0) this.mouseFiring = false;
    if (e.pointerType === 'mouse' && e.button === 2) this.mouseScoping = false;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    const quick = performance.now() - p.t < 350;
    // Click / tap on the ground = walk there (explore mode, or touch in any mode).
    if (!p.moved && quick && this.pointers.size === 0 && (!this.battleMode || !p.mouse) && (e.button === 0 || !p.mouse)) {
      this.onTap?.(e.clientX, e.clientY);
    }
  };

  /** Movement axis: x = right, y = forward. */
  axis() {
    let x = 0, y = 0;
    if (this.enabled) {
      for (const [code, [ax, ay]] of Object.entries(MOVE_KEYS)) {
        if (this.keys.has(code)) {
          x += ax;
          y += ay;
        }
      }
      x += this.joystick.x;
      y += this.joystick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get sprint() {
    return this.enabled && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joystick.x, this.joystick.y) > 0.95);
  }

  get walk() {
    return this.enabled && (this.keys.has('ControlLeft') || this.keys.has('AltLeft'));
  }

  consume(code: string) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had && this.enabled;
  }

  press(code: string) {
    this.pressed.add(code);
  }

  /** Called once a shot has actually been fired, so one click means one shot. */
  clearFirePulse() {
    this.firePulseUntil = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.dragX = 0;
    this.dragY = 0;
    this.wheel = 0;
  }

  get isDragging() {
    for (const p of this.pointers.values()) if (p.moved) return true;
    return false;
  }
}
