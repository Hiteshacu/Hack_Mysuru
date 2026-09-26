import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import type { AudioEngine } from '../core/Audio';
import type { Terrain } from '../world/Terrain';
import type { Colliders } from '../world/Colliders';
import type { Village } from '../world/Village';
import { AnimatedCharacter } from '../player/Character';
import { Effects } from './Effects';
import { Enemy } from './Enemy';
import { enemySpawns, healthPickups, WATER_LEVEL } from '../world/layout';

export interface CombatEvents {
  onPlayerHealth: (hp: number, max: number) => void;
  onGrenades: (count: number) => void;
  onEnemies: (alive: number, total: number) => void;
  onKill: (alive: number, total: number) => void;
  onPlayerHurt: () => void;
  onPlayerDeath: () => void;
  onPickup: (kind: 'health' | 'grenade') => void;
  onAllCleared: () => void;
  onAmmo: (ammo: number, magazine: number, reloading: boolean) => void;
  /** A shot landed (or did not) — used for the hit marker and recoil. */
  onShot: (hit: 'enemy' | 'kill' | 'barrel' | 'miss') => void;
}

interface Pickup {
  kind: 'health' | 'grenade';
  obj: THREE.Object3D;
  x: number;
  z: number;
  y: number;
  active: boolean;
  respawnAt: number;
  temporary?: boolean;
}

interface Grenade {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  fuse: number;
}

const PLAYER_MAX_HP = 100;
const MAGAZINE = 30;
const RELOAD_TIME = 1.6;
const FIRE_INTERVAL = 0.11;
const BULLET_DAMAGE = 14;
const RANGE = 80;
const GRAVITY = 20;

export class Combat {
  readonly group = new THREE.Group();
  readonly effects = new Effects();
  readonly enemies: Enemy[] = [];
  hp = PLAYER_MAX_HP;
  grenades = 3;
  ammo = MAGAZINE;
  readonly magazine = MAGAZINE;
  reloading = 0;
  playerAlive = true;
  enabled = true;
  private pickups: Pickup[] = [];
  private flying: Grenade[] = [];
  private cooldown = 0;
  private deathTime = -1;
  private cleared = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    private assets: Assets,
    private terrain: Terrain,
    private colliders: Colliders,
    private village: Village,
    private audio: AudioEngine,
    private events: CombatEvents,
    private player: { position: THREE.Vector3; char: AnimatedCharacter },
  ) {
    this.group.add(this.effects.group);
    enemySpawns.forEach((s, i) => {
      const gltf = s.type === 'grunt' ? assets.gltf.grunt : assets.gltf.hazmat;
      const char = new AnimatedCharacter(gltf, { weapon: s.type === 'grunt' ? 'SMG' : 'Shotgun', height: 1.85 });
      const enemy = new Enemy(char, s.x + (i % 2 ? 1.5 : -1.5), s.z, terrain, s.type);
      this.enemies.push(enemy);
      this.group.add(char.root);
    });
    for (const [x, z] of healthPickups) this.addPickup('health', x, z);
    enemySpawns.filter((_, i) => i % 2 === 0).forEach((s) => this.addPickup('grenade', s.x - 6, s.z + 5));
  }

  /** Battle on/off: when off, enemies, pickups and projectiles disappear and nothing can fire. */
  setEnabled(on: boolean) {
    this.enabled = on;
    for (const e of this.enemies) e.char.root.visible = on && e.alive;
    for (const p of this.pickups) p.obj.visible = on && p.active;
    for (const g of this.flying) this.group.remove(g.obj);
    this.flying.length = 0;
    if (!on && this.player.char.ghost) {
      // Leaving the battle revives the explorer.
      this.hp = PLAYER_MAX_HP;
      this.playerAlive = true;
      this.player.char.setGhost(false);
      this.player.char.play('Idle', { fade: 0.1 });
      this.events.onPlayerHealth(this.hp, PLAYER_MAX_HP);
    }
  }

  get total() {
    return this.enemies.length;
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }

  private addPickup(kind: 'health' | 'grenade', x: number, z: number, temporary = false) {
    const obj = this.assets.instance(kind === 'health' ? 'Health' : 'Grenade', false);
    obj.scale.setScalar(kind === 'health' ? 0.9 : 0.75);
    const y = Math.max(this.terrain.heightAt(x, z), WATER_LEVEL) + 0.35;
    obj.position.set(x, y, z);
    // A soft glow ring so pickups are easy to spot in the grass.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: kind === 'health' ? new THREE.Color(0.6, 2.2, 0.8) : new THREE.Color(2.2, 1.8, 0.6), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    ring.position.y = -0.3;
    obj.add(ring);
    this.group.add(obj);
    this.pickups.push({ kind, obj, x, z, y, active: true, respawnAt: 0, temporary });
  }

  // ---------------------------------------------------------------- aiming helpers

  /** Nearest enemy hit by a ray (vertical capsule approximation). */
  rayEnemy(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = RANGE, pad = 0.55) {
    let best: Enemy | null = null;
    let bestT = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = this.tmp.copy(e.position).add(new THREE.Vector3(0, 1, 0));
      const t = this.tmp2.copy(c).sub(origin).dot(dir);
      if (t <= 0 || t > bestT) continue;
      const p = this.tmp2.copy(origin).addScaledVector(dir, t);
      if (Math.hypot(p.x - c.x, p.z - c.z) < pad && p.y > e.position.y - 0.05 && p.y < e.position.y + 2.0) {
        best = e;
        bestT = t;
      }
    }
    return best ? { enemy: best, t: bestT } : null;
  }

  /** Enemy closest to the given direction within a cone (aim assist / keyboard & touch firing). */
  autoTarget(from: THREE.Vector3, dir: THREE.Vector3, maxAngle = 0.35, maxDist = 45) {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = this.tmp.copy(e.position).sub(from).setY(0);
      const d = to.length();
      if (d > maxDist || d < 0.5) continue;
      const ang = Math.acos(Math.min(1, Math.max(-1, to.normalize().dot(flat))));
      if (ang > maxAngle) continue;
      if (this.colliders.segmentBlocked(from.x, from.z, e.position.x, e.position.z)) continue;
      const score = ang * 30 + d;
      if (score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private terrainHit(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    for (let t = 1; t < maxDist; t += 0.8) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < this.terrain.heightAt(x, z)) return t;
    }
    return Infinity;
  }

  // ---------------------------------------------------------------- player actions

  /** Fires one shot towards `aim` if the weapon is ready. Returns the facing yaw used, or null. */
  /** Slots a fresh magazine in (also triggered automatically when the last round is fired). */
  reload() {
    if (!this.enabled || !this.playerAlive || this.reloading > 0 || this.ammo >= MAGAZINE) return false;
    this.reloading = RELOAD_TIME;
    this.audio.reload();
    this.events.onAmmo(this.ammo, MAGAZINE, true);
    return true;
  }

  fire(aim: THREE.Vector3, time: number, scoped = false): number | null {
    if (!this.enabled || !this.playerAlive || this.cooldown > 0 || this.reloading > 0) return null;
    if (this.ammo <= 0) {
      this.reload();
      return null;
    }
    this.cooldown = scoped ? FIRE_INTERVAL * 2.2 : FIRE_INTERVAL;
    this.ammo--;
    this.events.onAmmo(this.ammo, MAGAZINE, false);
    const muzzle = this.player.char.muzzleWorld(new THREE.Vector3());
    const chestOrigin = this.player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = aim.clone().sub(chestOrigin).normalize();
    const spread = scoped ? 0.004 : 0.025;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.8;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    let end = chestOrigin.clone().addScaledVector(dir, RANGE);
    const hitE = this.rayEnemy(chestOrigin, dir);
    let bestT = hitE?.t ?? RANGE;
    let barrel: (typeof this.village.barrels)[number] | null = null;
    for (const b of this.village.barrels) {
      if (!b.alive) continue;
      const c = new THREE.Vector3(b.x, this.terrain.heightAt(b.x, b.z) + 0.5, b.z);
      const t = c.clone().sub(chestOrigin).dot(dir);
      if (t > 0 && t < bestT && chestOrigin.clone().addScaledVector(dir, t).distanceTo(c) < 0.65) {
        bestT = t;
        barrel = b;
      }
    }
    const tt = this.terrainHit(chestOrigin, dir, bestT);
    if (tt < bestT) {
      end = chestOrigin.clone().addScaledVector(dir, tt);
      this.effects.sparks(end, new THREE.Vector3(0, 1, 0), 6, new THREE.Color(1.6, 1.3, 0.9));
      this.effects.dust(end, 3, 0.6);
      this.events.onShot('miss');
    } else if (barrel) {
      end = chestOrigin.clone().addScaledVector(dir, bestT);
      this.explodeBarrel(barrel, time);
      this.events.onShot('barrel');
    } else if (hitE) {
      end = chestOrigin.clone().addScaledVector(dir, hitE.t);
      this.effects.sparks(end, dir.clone().negate(), 10);
      const killed = hitE.enemy.damage(BULLET_DAMAGE * (scoped ? 1.8 : 1), time);
      this.audio.hit();
      if (killed) this.onEnemyKilled(hitE.enemy, time);
      this.events.onShot(killed ? 'kill' : 'enemy');
    } else {
      this.events.onShot('miss');
    }
    this.effects.tracer(muzzle, end);
    this.effects.muzzle(muzzle);
    this.audio.gunshot(0);
    return Math.atan2(dir.x, dir.z);
  }

  throwGrenade(aim: THREE.Vector3): number | null {
    if (!this.enabled || !this.playerAlive || this.grenades <= 0) return null;
    this.grenades--;
    this.events.onGrenades(this.grenades);
    const from = this.player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const flat = aim.clone().sub(from).setY(0);
    const dist = Math.min(24, flat.length());
    flat.normalize();
    const target = from.clone().addScaledVector(flat, dist);
    target.y = this.terrain.heightAt(target.x, target.z);
    const T = Math.max(0.55, Math.min(1.2, dist / 16));
    const vel = new THREE.Vector3((target.x - from.x) / T, (target.y - from.y + 0.5 * GRAVITY * T * T) / T, (target.z - from.z) / T);
    const obj = this.assets.instance('Grenade');
    obj.scale.setScalar(0.4);
    obj.position.copy(from);
    this.group.add(obj);
    this.flying.push({ obj, vel, fuse: 1.8 });
    this.audio.throwWhoosh();
    return Math.atan2(flat.x, flat.z);
  }

  private explode(at: THREE.Vector3, radius: number, maxDamage: number, time: number) {
    this.effects.explosion(at, radius);
    const dPlayer = this.player.position.distanceTo(at);
    this.audio.explosion(dPlayer);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(at);
      if (d < radius) {
        const killed = e.damage(maxDamage * (1 - d / radius) + 10, time);
        if (killed) this.onEnemyKilled(e, time);
      }
    }
    if (dPlayer < radius * 0.7) this.hurtPlayer(Math.round(28 * (1 - dPlayer / (radius * 0.7))), time);
    for (const b of this.village.barrels) {
      if (b.alive && Math.hypot(b.x - at.x, b.z - at.z) < radius * 0.8 && Math.hypot(b.x - at.x, b.z - at.z) > 0.3) {
        window.setTimeout(() => this.explodeBarrel(b, time), 180);
      }
    }
  }

  private explodeBarrel(b: Combat['village']['barrels'][number], time: number) {
    if (!b.alive) return;
    b.alive = false;
    b.mesh.visible = false;
    this.explode(new THREE.Vector3(b.x, this.terrain.heightAt(b.x, b.z), b.z), 6.5, 120, time);
  }

  private onEnemyKilled(enemy: Enemy, _time: number) {
    const alive = this.aliveCount;
    this.events.onKill(alive, this.total);
    this.audio.enemyDown();
    if (Math.random() < 0.6) this.addPickup('health', enemy.position.x + 0.8, enemy.position.z + 0.8, true);
    if (alive === 0 && !this.cleared) {
      this.cleared = true;
      this.events.onAllCleared();
    }
  }

  hurtPlayer(amount: number, time: number) {
    if (!this.playerAlive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.player.char.flash();
    this.audio.hurt();
    this.events.onPlayerHurt();
    this.events.onPlayerHealth(this.hp, PLAYER_MAX_HP);
    if (this.hp <= 0) {
      this.playerAlive = false;
      this.deathTime = time;
      this.player.char.play('Death', { once: true, fade: 0.1 });
      this.events.onPlayerDeath();
    }
  }

  /** True while the death animation is still playing (the player can't move yet). */
  get dying() {
    return !this.playerAlive && !this.player.char.ghost;
  }

  // ---------------------------------------------------------------- update

  update(dt: number, time: number, safe: boolean) {
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = MAGAZINE;
        this.events.onAmmo(this.ammo, MAGAZINE, false);
      }
    }
    this.cooldown -= dt;
    if (!this.enabled) {
      this.effects.update(dt, time);
      return;
    }
    const targetable = this.playerAlive && !safe;

    for (const e of this.enemies) {
      e.update(dt, time, {
        player: this.player.position,
        playerTargetable: targetable,
        terrain: this.terrain,
        colliders: this.colliders,
        shoot: (enemy, hit) => {
          const muzzle = enemy.char.muzzleWorld(new THREE.Vector3());
          const chest = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          if (!hit) chest.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 3));
          this.effects.tracer(muzzle, chest, true);
          this.effects.muzzle(muzzle, false);
          this.audio.gunshot(muzzle.distanceTo(this.player.position));
          if (hit) this.hurtPlayer(enemy.type === 'hazmat' ? 11 : 7, time);
          else this.effects.sparks(chest, new THREE.Vector3(0, 1, 0), 4, new THREE.Color(1.4, 1.2, 0.9));
        },
      });
    }

    // Death → spirit mode after the animation
    if (!this.playerAlive && !this.player.char.ghost && time - this.deathTime > 2.4) {
      this.player.char.setGhost(true);
      this.audio.ghost();
    }

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const g = this.flying[i];
      g.vel.y -= GRAVITY * dt;
      g.obj.position.addScaledVector(g.vel, dt);
      g.obj.rotation.x += dt * 8;
      g.obj.rotation.z += dt * 5;
      const ground = this.terrain.heightAt(g.obj.position.x, g.obj.position.z) + 0.12;
      if (g.obj.position.y < ground) {
        g.obj.position.y = ground;
        g.vel.y = Math.abs(g.vel.y) * 0.3;
        g.vel.x *= 0.55;
        g.vel.z *= 0.55;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.group.remove(g.obj);
        this.flying.splice(i, 1);
        this.explode(g.obj.position.clone().setY(ground - 0.12), 7.5, 110, time);
      }
    }

    for (const p of this.pickups) {
      if (!p.active) {
        if (!p.temporary && time > p.respawnAt) {
          p.active = true;
          p.obj.visible = true;
        }
        continue;
      }
      p.obj.rotation.y = time * 1.6;
      p.obj.position.y = p.y + Math.sin(time * 2 + p.x) * 0.12;
      if (!this.playerAlive) continue;
      if (Math.hypot(this.player.position.x - p.x, this.player.position.z - p.z) < 1.4) {
        if (p.kind === 'health' && this.hp >= PLAYER_MAX_HP) continue;
        p.active = false;
        p.obj.visible = false;
        p.respawnAt = time + 45;
        if (p.kind === 'health') {
          this.hp = Math.min(PLAYER_MAX_HP, this.hp + 40);
          this.events.onPlayerHealth(this.hp, PLAYER_MAX_HP);
        } else {
          this.grenades = Math.min(9, this.grenades + 2);
          this.events.onGrenades(this.grenades);
        }
        this.audio.chime('open');
        this.events.onPickup(p.kind);
      }
    }

    this.effects.update(dt, time);
  }

  reset() {
    this.hp = PLAYER_MAX_HP;
    this.grenades = 3;
    this.ammo = MAGAZINE;
    this.reloading = 0;
    this.events.onAmmo(this.ammo, MAGAZINE, false);
    this.playerAlive = true;
    this.cleared = false;
    this.player.char.setGhost(false);
    this.player.char.play('Idle', { fade: 0.1 });
    for (const e of this.enemies) e.reset(this.terrain);
    for (const b of this.village.barrels) {
      b.alive = true;
      b.mesh.visible = true;
    }
    for (const p of this.pickups) {
      if (p.temporary) {
        p.active = false;
        p.obj.visible = false;
      } else {
        p.active = true;
        p.obj.visible = true;
      }
    }
    this.events.onPlayerHealth(this.hp, PLAYER_MAX_HP);
    this.events.onGrenades(this.grenades);
    this.events.onEnemies(this.aliveCount, this.total);
  }
}
