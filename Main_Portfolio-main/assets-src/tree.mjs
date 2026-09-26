import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(`raw/${f}.glb`);
  const scene = doc.getRoot().listScenes()[0];
  console.log('==', f);
  const walk = (n, d) => {
    if (d > 4) return;
    const m = n.getMesh();
    console.log(`${'  '.repeat(d)}${n.getName()}${m ? ' [mesh:' + m.getName() + ' ' + m.listPrimitives().map(p => p.getMaterial()?.getName()).join('/') + ']' : ''}${n.getSkin() ? ' [skin]' : ''} t=${n.getTranslation().map(v=>+v.toFixed(2))} s=${n.getScale().map(v=>+v.toFixed(2))}`);
    n.listChildren().forEach((c) => { if (!/^(Hips|Root|Bone|mixamorig|Spine|Neck|Head|Shoulder|Arm|Hand|Leg|Foot|Toe|Thumb|Index|Middle|Ring|Pinky|Upper|Lower|Fore|Shin|Thigh|Body|Abdomen|Torso|Chest|Pelvis|Wrist|Elbow|Knee|Ankle|Clavicle|Finger)/i.test(c.getName())) walk(c, d + 1); });
  };
  scene.listChildren().forEach((n) => walk(n, 0));
}
