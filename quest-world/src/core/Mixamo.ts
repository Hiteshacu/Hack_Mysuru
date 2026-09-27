// Optional Mixamo player. Drop FBX files from mixamo.com into public/models/mixamo/ (names below) and the game uses
// that character instead of the built-in one. Nothing there → the built-in Quaternius character is used.
//
// The game's animation states stay the same: unarmed Idle / Walk / Run while exploring, and the rifle poses
// (aim, run with the gun up, strafe, fire) only in battle mode, where the rifle is put in Mixamo's right-hand bone.
// Mixamo files are free to use in a game but may not be redistributed as raw files (see mixamo.com FAQ).

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/** File in public/models/mixamo/ → the clip name the game plays. */
export const MIXAMO_FILES: Record<string, string> = {
  'idle.fbx': 'Idle',
  'walk.fbx': 'Walk',
  'run.fbx': 'Run',
  'rifle-idle.fbx': 'Idle_Gun_Pointing',
  'rifle-run.fbx': 'Run_Shoot',
  'rifle-fire.fbx': 'Idle_Gun_Shoot',
  'rifle-strafe-left.fbx': 'Run_Left',
  'rifle-strafe-right.fbx': 'Run_Right',
  'rifle-run-back.fbx': 'Run_Back',
  'hit.fbx': 'HitRecieve',
  'death.fbx': 'Death',
  'wave.fbx': 'Wave',
  'interact.fbx': 'Interact',
};

/** When a clip was not downloaded, reuse the closest one so the character never freezes. */
const FALLBACKS: Record<string, string[]> = {
  Walk: ['Run'],
  Run: ['Walk'],
  Idle_Gun_Pointing: ['Idle'],
  Idle_Gun: ['Idle_Gun_Pointing', 'Idle'],
  Idle_Gun_Shoot: ['Idle_Gun_Pointing', 'Idle'],
  Gun_Shoot: ['Idle_Gun_Shoot', 'Idle_Gun_Pointing'],
  Run_Shoot: ['Run'],
  Run_Left: ['Run_Shoot', 'Run'],
  Run_Right: ['Run_Shoot', 'Run'],
  Run_Back: ['Run_Shoot', 'Run'],
  HitRecieve: ['Idle'],
  HitRecieve_2: ['HitRecieve', 'Idle'],
  Death: ['Idle'],
  Wave: ['Idle'],
  Interact: ['Idle'],
};

/** Keep animations in place: the hips may bob up and down but never drift across the ground. */
function inPlace(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return clip;
}

export async function loadMixamo(base: string): Promise<GLTF | null> {
  const loader = new FBXLoader();
  let model: THREE.Group;
  try {
    model = await loader.loadAsync(`${base}player.fbx`);
  } catch {
    return null; // no Mixamo character downloaded (or not an FBX): use the built-in one
  }
  let skinned = false;
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  if (!skinned) return null;
  // Mixamo FBX files are in centimetres.
  model.scale.setScalar(0.01);

  const clips: THREE.AnimationClip[] = [];
  await Promise.all(
    Object.entries(MIXAMO_FILES).map(async ([file, name]) => {
      try {
        const g = await loader.loadAsync(`${base}${file}`);
        const clip = g.animations[0];
        if (!clip) return;
        clip.name = name;
        clips.push(inPlace(clip));
      } catch {
        /* optional clip not downloaded */
      }
    }),
  );
  // A character downloaded "with skin" from an animation page carries that animation: use it as Idle if needed.
  if (!clips.some((c) => c.name === 'Idle') && model.animations[0]) {
    const c = model.animations[0].clone();
    c.name = 'Idle';
    clips.push(inPlace(c));
  }
  if (!clips.some((c) => c.name === 'Idle')) return null;
  for (const [name, options] of Object.entries(FALLBACKS)) {
    if (clips.some((c) => c.name === name)) continue;
    const from = options.map((o) => clips.find((c) => c.name === o)).find(Boolean);
    if (from) {
      const c = from.clone();
      c.name = name;
      clips.push(c);
    }
  }
  return { scene: model, animations: clips } as unknown as GLTF;
}
