// Prints a compact summary of every GLB in assets-src/raw: bounds, meshes, textures, animations.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { readdirSync } from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir = new URL('./raw/', import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb')).sort()) {
  const doc = await io.read(new URL(f, dir).pathname.replace(/^\/([A-Z]:)/, '$1'));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(2));
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  const tex = root.listTextures().map((t) => `${t.getName() || '?'}:${t.getSize()?.join('x')}`);
  const anims = root.listAnimations().map((a) => a.getName());
  const mats = root.listMaterials().map((m) => m.getName());
  console.log(`${f.padEnd(30)} size=${JSON.stringify(size)} min=${JSON.stringify(b.min.map((v) => +v.toFixed(2)))} tris=${Math.round(tris)} skins=${root.listSkins().length}`);
  if (tex.length) console.log(`   tex: ${tex.join(', ')}`);
  console.log(`   mats: ${mats.join(', ')}`);
  if (anims.length) console.log(`   anims: ${anims.join(', ')}`);
}
