MIXAMO PLAYER (optional)
========================
Put Mixamo FBX files in this folder with exactly these names, then run `npm run build` in quest-world.
If player.fbx is missing, the game uses the built-in Quaternius "Hoodie Character".

1. Go to https://www.mixamo.com and sign in with your (free) Adobe ID.
2. Characters tab -> pick a character (e.g. "Remy" or "Ty" for a student look).
   Download: Format = FBX Binary (.fbx), Pose = T-pose  ->  save as  player.fbx
3. Animations tab (with the same character selected). For each row: search, open it,
   tick "In Place" when the option exists, then Download with
   Format = FBX Binary (.fbx), Skin = WITHOUT Skin, Frames per second = 30.

   File name               Mixamo search            Used for
   ----------------------  -----------------------  ---------------------------------
   idle.fbx                Breathing Idle           standing, no gun   (required)
   walk.fbx                Walking                  walking, no gun
   run.fbx                 Running                  running, no gun
   rifle-idle.fbx          Rifle Aiming Idle        battle: aiming
   rifle-run.fbx           Rifle Run                battle: running with the gun up
   rifle-fire.fbx          Firing Rifle             battle: shooting (left click)
   rifle-strafe-left.fbx   Strafe Left (rifle)      battle: strafing   (optional)
   rifle-strafe-right.fbx  Strafe Right (rifle)     battle: strafing   (optional)
   rifle-run-back.fbx      Run Backward (rifle)     battle: backpedal  (optional)
   hit.fbx                 Hit Reaction             taking damage      (optional)
   death.fbx               Dying                    defeated           (optional)
   wave.fbx                Waving                   greeting           (optional)
   interact.fbx            Button Pushing           using a station    (optional)

The rifle is attached to Mixamo's right hand (mixamorigRightHand) and is shown only in battle mode (B).
Missing optional clips fall back to the closest one (e.g. strafes use Rifle Run).
License: Mixamo characters and animations are free to use in your game, but the raw files must not be
redistributed on their own (so don't publish this folder as an asset pack).
