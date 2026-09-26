// Optimises the CC0 Quaternius models (poly.pizza) in assets-src/raw into public/models.
// Run: node assets-src/build.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const RAW = new URL('./raw/', import.meta.url);
const OUT = new URL('../public/models/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const p = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const read = (name) => io.read(p(new URL(`${name}.glb`, RAW)));

async function finish(doc, outName, { textures = true, size = 1024 } = {}) {
  const transforms = [dedup(), prune(), weld(), resample()];
  if (textures) {
    transforms.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
  }
  transforms.push(unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...transforms);
  const file = p(new URL(outName, OUT));
  await io.write(file, doc);
  console.log(`${outName.padEnd(16)} ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

/** Merge several raw files into one document with a single scene of named top-level nodes. */
async function combine(entries) {
  const target = await read(entries[0].file);
  const targetScene = target.getRoot().listScenes()[0];
  // Drop the first doc's scene children; we re-add everything uniformly below.
  const collected = [];
  const collect = (doc, entry, scene) => {
    for (const root of scene.listChildren()) {
      const kids = entry.split ? root.listChildren() : [root];
      for (const node of kids) {
        if (entry.split) {
          const t = node.getTranslation();
          node.setTranslation([0, t[1], 0]);
          root.removeChild(node);
        }
        node.setName(entry.split ? node.getName() : entry.name);
        collected.push(node);
      }
    }
  };
  collect(target, entries[0], targetScene);
  for (const entry of entries.slice(1)) {
    const src = await read(entry.file);
    const map = mergeDocuments(target, src);
    const scene = map.get(src.getRoot().listScenes()[0]);
    collect(target, entry, scene);
    scene.dispose();
  }
  for (const child of targetScene.listChildren()) targetScene.removeChild(child);
  for (const node of collected) targetScene.addChild(node);
  return target;
}

// ---------------------------------------------------------------- characters
// The soldier is no longer the player (only its AK is exported below as rifle.glb).
const WEAPON_KEEP = { 'enemy-grunt': ['SMG', 'Pistol'], 'enemy-hazmat': ['Shotgun', 'Pistol'] };
const WEAPONS = ['Revolver', 'Sniper', 'Revolver_Small', 'Pistol', 'SMG', 'GrenadeLauncher', 'ShortCannon', 'Shotgun', 'Sniper_2', 'RocketLauncher', 'AK', 'Shovel', 'Knife_2', 'Knife_1'];
for (const [file, keep] of Object.entries(WEAPON_KEEP)) {
  const doc = await read(file);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (WEAPONS.includes(n.getName()) && !keep.includes(n.getName())) n.dispose();
  const seen = new Set();
  for (const a of root.listAnimations()) {
    const clean = a.getName().replace('CharacterArmature|', '');
    if (seen.has(clean)) a.dispose();
    else {
      seen.add(clean);
      a.setName(clean);
    }
  }
  await finish(doc, `${file.replace('player-', '').replace('enemy-', '')}.glb`, { textures: false });
}

// ---------------------------------------------------------------- player (Ultimate Modular Men Pack "Adventurer")
{
  const doc = await read('adventurer');
  for (const a of doc.getRoot().listAnimations()) a.setName(a.getName().replace('CharacterArmature|', ''));
  await finish(doc, 'adventurer.glb', { textures: false });
}

// ---------------------------------------------------------------- rifle: the AK exactly as the soldier holds it
{
  const doc = await read('player-soldier');
  const root = doc.getRoot();
  const ak = root.listNodes().find((n) => n.getName() === 'AK');
  const scene = root.listScenes()[0];
  for (const child of scene.listChildren()) scene.removeChild(child);
  ak.getParentNode()?.removeChild(ak);
  scene.addChild(ak);
  for (const n of root.listNodes()) if (n !== ak && !ak.listChildren().includes(n)) n.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const a of root.listAnimations()) a.dispose();
  await finish(doc, 'rifle.glb', { textures: false });
}

// ---------------------------------------------------------------- nature
const nature = await combine([
  { file: 'tree-1', name: 'Tree_1' },
  { file: 'tree-2', name: 'Tree_2' },
  { file: 'tree-3', name: 'Tree_3' },
  { file: 'tree-4', name: 'Tree_4' },
  { file: 'tree-5', name: 'Tree_5' },
  { file: 'twisted-tree-bundle-birch', split: true },
  { file: 'maple-trees', split: true },
  { file: 'flower-single', name: 'Flower_1' },
  { file: 'flower-single-2', name: 'Flower_2' },
  { file: 'flower-group', name: 'FlowerGroup_1' },
  { file: 'flower-group-2', name: 'FlowerGroup_2' },
  { file: 'bush-flowers', name: 'BushFlowers' },
  { file: 'bush', name: 'Bush' },
  { file: 'fern', name: 'Fern' },
  { file: 'mushroom', name: 'Mushroom' },
  { file: 'grass-wispy', name: 'GrassWispy' },
]);
await finish(nature, 'nature.glb', { size: 1024 });

// ---------------------------------------------------------------- village, props & furniture
const village = await combine([
  { file: 'house-1', name: 'House_1' },
  { file: 'house-2', name: 'House_2' },
  { file: 'house-3', name: 'House_3' },
  { file: 'inn', name: 'Inn' },
  { file: 'bell-tower', name: 'BellTower' },
  { file: 'well', name: 'Well' },
  { file: 'market-stand', name: 'MarketStand' },
  { file: 'cart', name: 'Cart' },
  { file: 'bench', name: 'Bench' },
  { file: 'barrel', name: 'Barrel' },
  { file: 'barrel-explode', name: 'ExplodingBarrel' },
  { file: 'sack-trench', name: 'SackTrench' },
  { file: 'grenade', name: 'Grenade' },
  { file: 'health', name: 'Health' },
  { file: 'bed-double', name: 'Bed' },
  { file: 'desk', name: 'Desk' },
  { file: 'office-chair', name: 'OfficeChair' },
  { file: 'bookcase', name: 'Bookcase' },
  { file: 'sofa', name: 'Sofa' },
  { file: 'table', name: 'Table' },
  { file: 'chair', name: 'Chair' },
]);
await finish(village, 'village.glb', { textures: false });
