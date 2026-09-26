import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of ['nature', 'village', 'soldier']) {
  const doc = await io.read(`public/models/${f}.glb`);
  const scene = doc.getRoot().listScenes()[0];
  console.log('==', f, 'textures:', doc.getRoot().listTextures().map(t => `${t.getName()}:${t.getMimeType()}:${t.getSize()}`).join(' '));
  for (const n of scene.listChildren()) {
    const b = getBounds(n);
    console.log(`  ${n.getName().padEnd(16)} size=${b.max.map((v, i) => +(v - b.min[i]).toFixed(2))} min=${b.min.map(v => +v.toFixed(2))}`);
  }
  console.log('  anims:', doc.getRoot().listAnimations().map(a => a.getName()).join(','));
}
