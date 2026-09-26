import * as THREE from 'three';

/** Converts quantized (meshopt) attributes to plain Float32 so geometries can be batched together. */
function toFloatGeometry(src: THREE.BufferGeometry, bake: THREE.Matrix4) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    const size = name === 'uv' ? 2 : 3;
    const out = new Float32Array(src.getAttribute('position').count * size);
    if (a) {
      for (let i = 0; i < a.count; i++) {
        out[i * size] = a.getX(i);
        out[i * size + 1] = a.getY(i);
        if (size === 3) out[i * size + 2] = a.getZ(i);
      }
    } else if (name === 'normal') {
      for (let i = 1; i < out.length; i += 3) out[i] = 1;
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  const index = src.getIndex();
  if (index) g.setIndex(Array.from(index.array as ArrayLike<number>));
  else g.setIndex([...Array(src.getAttribute('position').count).keys()]);
  g.applyMatrix4(bake);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface Placement {
  matrix: THREE.Matrix4;
  x: number;
  z: number;
  color?: THREE.Color;
}

interface Kind {
  parts: Part[];
  placements: Placement[];
  maxDistance: number;
  castShadow: boolean;
  /** Foliage variant key (e.g. "color" → tinted leaves via per-instance colour). */
  variant?: string;
}

/**
 * Scatters many copies of glTF templates with BatchedMesh: one draw call per material,
 * per-instance frustum culling, and distance-based visibility for small props.
 */
export class ModelScatter {
  readonly group = new THREE.Group();
  private kinds = new Map<string, Kind>();
  private batches: { mesh: THREE.BatchedMesh; entries: { id: number; x: number; z: number; max: number }[] }[] = [];
  private lastUpdate = new THREE.Vector2(1e9, 1e9);
  onMaterial?: (material: THREE.Material, variant?: string) => THREE.Material;

  define(name: string, template: THREE.Object3D, opts: { maxDistance?: number; castShadow?: boolean; variant?: string } = {}) {
    const parts: Part[] = [];
    // Bake relative to the template's parent so the template's own rotation/scale is kept
    // (the birch/maple roots carry a -90° X rotation from their FBX source).
    template.updateWorldMatrix(true, true);
    const rootInverse = template.parent ? new THREE.Matrix4().copy(template.parent.matrixWorld).invert() : new THREE.Matrix4();
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const bake = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const grp of groups) {
        const geo = toFloatGeometry(mesh.geometry, bake);
        if (mesh.geometry.groups.length) {
          const idx = geo.getIndex()!.array;
          geo.setIndex(Array.from(idx).slice(grp.start, grp.start + grp.count));
        }
        parts.push({ geometry: geo, material: materials[grp.materialIndex ?? 0] });
      }
    });
    this.kinds.set(name, { parts, placements: [], maxDistance: opts.maxDistance ?? Infinity, castShadow: opts.castShadow ?? true, variant: opts.variant });
  }

  add(name: string, x: number, y: number, z: number, rotY: number, scale: number | THREE.Vector3, color?: THREE.Color) {
    const kind = this.kinds.get(name)!;
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), s);
    kind.placements.push({ matrix, x, z, color });
  }

  /** Builds the BatchedMeshes once every placement is known. */
  build() {
    const byMaterial = new Map<string, { material: THREE.Material; variant?: string; parts: { part: Part; kind: Kind }[] }>();
    for (const kind of this.kinds.values()) {
      if (!kind.placements.length) continue;
      for (const part of kind.parts) {
        // Variants only apply to leaves; bark etc. keeps sharing the normal batch.
        const variant = kind.variant && /Leaves/.test(part.material.name) ? kind.variant : undefined;
        const key = `${part.material.uuid}|${variant ?? ''}`;
        if (!byMaterial.has(key)) byMaterial.set(key, { material: part.material, variant, parts: [] });
        byMaterial.get(key)!.parts.push({ part, kind });
      }
    }
    for (const { material, variant, parts } of byMaterial.values()) {
      let verts = 0, indices = 0, instances = 0;
      for (const { part, kind } of parts) {
        verts += part.geometry.getAttribute('position').count;
        indices += part.geometry.getIndex()!.count;
        instances += kind.placements.length;
      }
      const mat = this.onMaterial ? this.onMaterial(material, variant) : material;
      const mesh = new THREE.BatchedMesh(instances, verts, indices, mat);
      mesh.perObjectFrustumCulled = true;
      mesh.sortObjects = false;
      const entries: { id: number; x: number; z: number; max: number }[] = [];
      let shadow = false;
      for (const { part, kind } of parts) {
        const geoId = mesh.addGeometry(part.geometry);
        for (const pl of kind.placements) {
          const id = mesh.addInstance(geoId);
          mesh.setMatrixAt(id, pl.matrix);
          if (variant) mesh.setColorAt(id, pl.color ?? new THREE.Color(1, 1, 1));
          entries.push({ id, x: pl.x, z: pl.z, max: kind.maxDistance });
        }
        shadow ||= kind.castShadow;
      }
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.batches.push({ mesh, entries: entries.filter((e) => e.max < Infinity) });
    }
  }

  /** Hide far-away small props (flowers, ferns); cheap and only re-run when the player moves. */
  update(player: THREE.Vector3) {
    if (this.lastUpdate.distanceTo(new THREE.Vector2(player.x, player.z)) < 4) return;
    this.lastUpdate.set(player.x, player.z);
    for (const b of this.batches) {
      for (const e of b.entries) {
        const d = Math.hypot(e.x - player.x, e.z - player.z);
        b.mesh.setVisibleAt(e.id, d < e.max);
      }
    }
  }

  get materials() {
    return this.batches.map((b) => b.mesh.material as THREE.Material);
  }
}
