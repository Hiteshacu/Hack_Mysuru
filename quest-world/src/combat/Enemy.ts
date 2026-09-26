import * as THREE from 'three';
import type { AnimatedCharacter } from '../player/Character';
import type { Terrain } from '../world/Terrain';
import type { Colliders } from '../world/Colliders';
import { WATER_LEVEL } from '../world/layout';
import { angleLerp, damp } from '../utils/math';

export type EnemyState = 'patrol' | 'idle' | 'chase' | 'attack' | 'hit' | 'dead';

export interface EnemyContext {
  player: THREE.Vector3;
  playerTargetable: boolean;
  terrain: Terrain;
  colliders: Colliders;
  shoot: (enemy: Enemy, hit: boolean) => void;
}

const MAX_HP = 70;

export class Enemy {
  readonly home: THREE.Vector3;
  readonly position = new THREE.Vector3();
  facing = Math.random() * Math.PI * 2;
  hp = MAX_HP;
  state: EnemyState = 'idle';
  deadTime = 0;
  lastHurt = -10;
  private target = new THREE.Vector3();
  private timer = 1 + Math.random() * 2;
  private fireCooldown = 1;
  private hitTime = 0;
  private alertUntil = 0;
  private hpBar: THREE.Sprite;
  private hpCanvas: HTMLCanvasElement;
  private hpTexture: THREE.CanvasTexture;
  private lastHpDrawn = -1;

  constructor(readonly char: AnimatedCharacter, x: number, z: number, terrain: Terrain, readonly type: 'grunt' | 'hazmat') {
    this.home = new THREE.Vector3(x, terrain.heightAt(x, z), z);
    this.position.copy(this.home);
    this.char.root.position.copy(this.position);
    this.char.play('Idle');

    this.hpCanvas = document.createElement('canvas');
    this.hpCanvas.width = 128;
    this.hpCanvas.height = 20;
    this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
    this.hpTexture.colorSpace = THREE.SRGBColorSpace;
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hpTexture, depthWrite: false, transparent: true, toneMapped: false }));
    this.hpBar.scale.set(1.1, 0.17, 1);
    this.hpBar.position.y = 2.25;
    this.hpBar.renderOrder = 11;
    this.hpBar.visible = false;
    this.char.root.add(this.hpBar);
  }

  get alive() {
    return this.state !== 'dead';
  }

  get maxHp() {
    return MAX_HP;
  }

  /** Chest position for aiming. */
  chest(target = new THREE.Vector3()) {
    return target.copy(this.position).add(new THREE.Vector3(0, 1.25, 0));
  }

  damage(amount: number, time: number) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.lastHurt = time;
    this.char.flash();
    this.alertUntil = time + 12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.deadTime = time;
      this.char.play('Death', { once: true, fade: 0.1 });
      this.hpBar.visible = false;
      return true;
    }
    if (this.state !== 'attack' || Math.random() < 0.35) {
      this.state = 'hit';
      this.hitTime = 0.35;
      this.char.play('HitReact', { once: true, fade: 0.06 });
    }
    return false;
  }

  private drawHp() {
    if (this.lastHpDrawn === this.hp) return;
    this.lastHpDrawn = this.hp;
    const g = this.hpCanvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 20);
    g.fillStyle = 'rgba(15,15,15,0.75)';
    g.beginPath();
    g.roundRect(0, 0, 128, 20, 8);
    g.fill();
    const f = this.hp / MAX_HP;
    g.fillStyle = f > 0.5 ? '#7bd66a' : f > 0.25 ? '#f2b35c' : '#ff5a4a';
    g.beginPath();
    g.roundRect(3, 3, 122 * f, 14, 6);
    g.fill();
    this.hpTexture.needsUpdate = true;
  }

  private moveTowards(tx: number, tz: number, speed: number, dt: number, ctx: EnemyContext) {
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const step = Math.min(d, speed * dt);
    const nx = this.position.x + (dx / d) * step;
    const nz = this.position.z + (dz / d) * step;
    if (ctx.terrain.heightAt(nx, nz) > WATER_LEVEL - 0.3) {
      this.position.x = nx;
      this.position.z = nz;
    }
    ctx.colliders.resolve(this.position, 0.45);
    this.facing = angleLerp(this.facing, Math.atan2(dx, dz), damp(8, dt));
    return d;
  }

  update(dt: number, time: number, ctx: EnemyContext) {
    const c = this.char;
    this.hpBar.visible = this.alive && time - this.lastHurt < 4;
    if (this.hpBar.visible) this.drawHp();

    if (this.state === 'dead') {
      const t = time - this.deadTime;
      if (t > 5) {
        c.setOpacity(Math.max(0, 1 - (t - 5) / 2));
        c.root.position.y = this.position.y - Math.max(0, t - 5) * 0.4;
      }
      c.root.visible = t < 7.2;
      c.update(dt);
      return;
    }

    const toPlayer = Math.hypot(ctx.player.x - this.position.x, ctx.player.z - this.position.z);
    const sees = ctx.playerTargetable && toPlayer < 34 && !ctx.colliders.segmentBlocked(this.position.x, this.position.z, ctx.player.x, ctx.player.z);
    const alerted = ctx.playerTargetable && (sees || time < this.alertUntil) && toPlayer < 55;

    if (this.state === 'hit') {
      this.hitTime -= dt;
      if (this.hitTime <= 0) this.state = alerted ? 'chase' : 'idle';
    } else if (alerted) {
      this.state = toPlayer < 17 && sees ? 'attack' : 'chase';
    } else if (this.state === 'chase' || this.state === 'attack') {
      this.state = 'patrol';
      this.target.copy(this.home);
    }

    switch (this.state) {
      case 'idle':
        c.play('Idle');
        this.timer -= dt;
        if (this.timer <= 0) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.state = 'patrol';
        }
        break;
      case 'patrol': {
        c.play('Walk', { fade: 0.25 });
        const d = this.moveTowards(this.target.x, this.target.z, 1.7, dt, ctx);
        if (d < 0.6) {
          this.state = 'idle';
          this.timer = 2 + Math.random() * 3;
        }
        break;
      }
      case 'chase': {
        c.play('Run_Gun', { fade: 0.2 });
        const keep = 12;
        const dx = ctx.player.x - this.position.x, dz = ctx.player.z - this.position.z;
        this.moveTowards(ctx.player.x - (dx / toPlayer) * keep, ctx.player.z - (dz / toPlayer) * keep, 4.4, dt, ctx);
        this.fireCooldown = Math.min(this.fireCooldown, 0.8);
        break;
      }
      case 'attack': {
        const moving = toPlayer > 12;
        if (moving) {
          c.play('Walk_Shoot', { fade: 0.2 });
          const dx = ctx.player.x - this.position.x, dz = ctx.player.z - this.position.z;
          this.moveTowards(this.position.x + dx * 0.2, this.position.z + dz * 0.2, 1.6, dt, ctx);
        } else {
          c.play('Idle_Shoot', { fade: 0.2 });
        }
        this.facing = angleLerp(this.facing, Math.atan2(ctx.player.x - this.position.x, ctx.player.z - this.position.z), damp(10, dt));
        this.fireCooldown -= dt;
        if (this.fireCooldown <= 0) {
          this.fireCooldown = (this.type === 'hazmat' ? 1.3 : 0.9) + Math.random() * 0.5;
          const chance = Math.max(0.18, Math.min(0.62, 0.72 - toPlayer / 38));
          ctx.shoot(this, Math.random() < chance);
        }
        break;
      }
    }

    const ground = ctx.terrain.heightAt(this.position.x, this.position.z);
    const floor = ctx.colliders.floorAt(this.position.x, this.position.z);
    this.position.y = Math.max(ground, floor);
    c.root.position.copy(this.position);
    c.root.rotation.y = this.facing;
    c.update(dt);
  }

  reset(terrain: Terrain) {
    this.hp = MAX_HP;
    this.state = 'idle';
    this.position.copy(this.home);
    this.position.y = terrain.heightAt(this.home.x, this.home.z);
    this.alertUntil = 0;
    this.lastHurt = -10;
    this.char.root.visible = true;
    this.char.setOpacity(1);
    this.char.play('Idle', { fade: 0.01 });
  }
}
