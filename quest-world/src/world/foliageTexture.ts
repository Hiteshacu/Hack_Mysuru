import * as THREE from 'three';

/*
 * Alpha-tested foliage disappears in the distance: leaf atlases are mostly transparent, so each
 * mipmap level averages the alpha down until nothing clears the alpha-test cutoff any more and only
 * the bare trunk is left. The fix (as used by Unity's "Mip Maps Preserve Coverage" and described in
 * Ben Golus' "Anti-aliased alpha test" article) is to build the mip chain ourselves and rescale the
 * alpha of every level so that the share of texels passing the cutoff stays the same as level 0.
 */

const patched = new WeakSet<THREE.Texture>();

function coverage(data: Uint8ClampedArray, cutoff: number, scale: number) {
  let hit = 0;
  for (let i = 3; i < data.length; i += 4) if (Math.min(255, data[i] * scale) >= cutoff * 255) hit++;
  return hit / (data.length / 4);
}

/** Rebuilds `texture`'s mipmaps so alpha-tested coverage is preserved at every level. */
export function preserveAlphaCoverage(texture: THREE.Texture, cutoff: number, maxAnisotropy = 1) {
  const source = texture.image as CanvasImageSource & { width?: number; height?: number };
  if (!source || patched.has(texture)) return;
  const w0 = (source.width as number) | 0, h0 = (source.height as number) | 0;
  if (!w0 || !h0) return;
  patched.add(texture);

  const draw = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas: c, ctx };
  };

  try {
    const base = draw(w0, h0);
    const target = coverage(base.ctx.getImageData(0, 0, w0, h0).data, cutoff, 1);
    // Fully opaque textures (bark, stone) gain nothing from this.
    if (target > 0.995) return;

    const mipmaps: HTMLCanvasElement[] = [base.canvas];
    let w = w0, h = h0;
    while (w > 1 || h > 1) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      const level = draw(w, h);
      const img = level.ctx.getImageData(0, 0, w, h);
      // Find the alpha multiplier that restores level 0's coverage (bisection is plenty here).
      let lo = 1, hi = 12;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (coverage(img.data, cutoff, mid) < target) lo = mid;
        else hi = mid;
      }
      const scale = (lo + hi) / 2;
      if (scale > 1.001) {
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.min(255, img.data[i] * scale);
        level.ctx.putImageData(img, 0, 0);
      }
      mipmaps.push(level.canvas);
    }

    texture.mipmaps = mipmaps as unknown as THREE.Texture['mipmaps'];
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, maxAnisotropy);
    texture.needsUpdate = true;
  } catch {
    /* tainted canvas or an image that cannot be read: keep the default mipmaps */
  }
}
