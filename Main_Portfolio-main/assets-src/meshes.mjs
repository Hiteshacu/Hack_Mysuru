import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(`raw/${f}.glb`);
  console.log('==', f);
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh();
    if (!m) continue;
    const parents = []; let p = n.getParentNode(); while (p) { parents.push(p.getName()); p = p.getParentNode(); }
    console.log(`  ${n.getName()} <- ${parents.slice(0,3).join(' <- ')} mats=${m.listPrimitives().map(pr => pr.getMaterial()?.getName()).join('/')} skin=${!!n.getSkin()} verts=${m.listPrimitives().reduce((s,pr)=>s+pr.getAttribute('POSITION').getCount(),0)}`);
  }
}
