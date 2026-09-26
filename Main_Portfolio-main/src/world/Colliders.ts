import type * as THREE from 'three';

interface Circle {
  x: number;
  z: number;
  r: number;
}
interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

/** Tiny 2D collision world (XZ plane) — the player is a circle. */
interface Floor extends Box {
  y: number;
}

export class Colliders {
  circles: Circle[] = [];
  boxes: Box[] = [];
  floors: Floor[] = [];

  /** A walkable raised rectangle (porches, cabin floors). */
  addFloor(x: number, z: number, width: number, depth: number, y: number, rot = 0) {
    this.floors.push({ x, z, hw: width / 2, hd: depth / 2, rot, y });
  }

  /** Highest floor under the point, or -Infinity. */
  floorAt(x: number, z: number) {
    let best = -Infinity;
    for (const f of this.floors) {
      const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
      const lx = (x - f.x) * cos - (z - f.z) * sin;
      const lz = (x - f.x) * sin + (z - f.z) * cos;
      if (Math.abs(lx) <= f.hw && Math.abs(lz) <= f.hd && f.y > best) best = f.y;
    }
    return best;
  }

  /** Inside a building-sized obstacle (used to keep grass out of houses). */
  insideSolid(x: number, z: number, margin = 0) {
    for (const c of this.circles) if (c.r > 1 && Math.hypot(c.x - x, c.z - z) < c.r + margin) return true;
    for (const b of [...this.boxes, ...this.floors]) {
      const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
      const lx = (x - b.x) * cos - (z - b.z) * sin;
      const lz = (x - b.x) * sin + (z - b.z) * cos;
      if (Math.abs(lx) <= b.hw + margin && Math.abs(lz) <= b.hd + margin) return true;
    }
    return false;
  }

  /** Segment (x0,z0)->(x1,z1) blocked by a solid box or large circle — used for simple line of sight. */
  segmentBlocked(x0: number, z0: number, x1: number, z1: number) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const b of this.boxes) {
        const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
        const lx = (x - b.x) * cos - (z - b.z) * sin;
        const lz = (x - b.x) * sin + (z - b.z) * cos;
        if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) return true;
      }
    }
    return false;
  }

  addCircle(x: number, z: number, r: number) {
    this.circles.push({ x, z, r });
  }

  addBox(x: number, z: number, width: number, depth: number, rot = 0) {
    this.boxes.push({ x, z, hw: width / 2, hd: depth / 2, rot });
  }

  /** Is there anything within `r` of the point (used by scatter placement). */
  blocked(x: number, z: number, r: number) {
    for (const c of this.circles) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return true;
    for (const b of this.boxes) if (Math.hypot(b.x - x, b.z - z) < Math.hypot(b.hw, b.hd) + r) return true;
    return false;
  }

  resolve(p: THREE.Vector3, radius: number) {
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const b of this.boxes) {
      const cos = Math.cos(-b.rot), sin = Math.sin(-b.rot);
      const lx = (p.x - b.x) * cos - (p.z - b.z) * sin;
      const lz = (p.x - b.x) * sin + (p.z - b.z) * cos;
      if (Math.abs(lx) > b.hw + radius || Math.abs(lz) > b.hd + radius) continue;
      const cx = Math.max(-b.hw, Math.min(b.hw, lx));
      const cz = Math.max(-b.hd, Math.min(b.hd, lz));
      let nx = lx - cx, nz = lz - cz;
      let d = Math.hypot(nx, nz);
      let ox = lx, oz = lz;
      if (d < 1e-6) {
        // Centre is inside the box: push out along the shallowest axis.
        const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
        if (px < pz) ox = Math.sign(lx || 1) * (b.hw + radius);
        else oz = Math.sign(lz || 1) * (b.hd + radius);
      } else if (d < radius) {
        nx /= d;
        nz /= d;
        ox = cx + nx * radius;
        oz = cz + nz * radius;
      } else continue;
      const c2 = Math.cos(b.rot), s2 = Math.sin(b.rot);
      p.x = b.x + ox * c2 - oz * s2;
      p.z = b.z + ox * s2 + oz * c2;
    }
  }
}
