# Hitesh A — 3D Portfolio World

An explorable, fully procedural 3D portfolio built with **Three.js**, **GSAP** and **TypeScript** (Vite).
Visitors walk a stylised valley where every landmark is a portfolio section — or use the top bar,
the world map, or the classic scrolling page to jump straight to the content.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, **Add New → Project**, import the repo. The framework (Vite), build command
   (`npm run build`) and output directory (`dist`) are picked up from `vercel.json`.
3. Deploy. Or use the CLI: `npx vercel --prod`.

## Editing content

All text, projects, links and achievements live in **`src/data/portfolio.ts`**.
Replace `public/Hitesh_A_Resume.pdf` to update the résumé download.

## Features

| Area | What's inside |
| --- | --- |
| World | Procedural terrain with baked path/plaza masks, dense two-layer grass (lazy chunks + GPU near-field) with wind and player push, textured model trees plus colour-tinted seasonal groves, flowers, ferns, a village, two lakes with depth-aware water, clouds, sky with stars |
| Stations | The Gate (welcome), The Cabin (about/education), Crystal Circle (skills), Project Grove (4 holographic project pedestals), Hall of Trophies (hackathons), Banner Ridge (certifications), Lakeside Camp (contact, campfire) |
| Player | Animated Adventurer (walk/jog/sprint, strafing, shooting, hit & death clips) with an attached rifle in battle; click/tap-to-move; touch joystick |
| Camera | Cinematic intro, orbit drag with gentle auto-follow, zoom, indoor mode (stays inside the cabin walls), over-the-shoulder pointer-lock aiming and a 4x scope in battle |
| UI | Top-bar fast travel, discovery tracker, interaction prompts, animated info panels, satellite minimap + zoomable world map (compass, scale bar, live enemy dots), settings (quality, time of day, camera, volume), classic portfolio view |
| Atmosphere | Physically based Preetham sky with animated clouds, stars & moon at night, sky-derived image-based lighting, distant mountain ranges with aerial perspective, N8AO ambient occlusion, bloom, sharpening |
| Audio | 100% generated with Web Audio: ambient music, wind, birds, crickets, water, fire crackle, footsteps, UI chimes |
| Foliage | Leaf atlases get coverage-preserving mipmaps, so canopies stay full at any distance instead of thinning out into bare trunks |
| Performance | Lazy-loaded 3D engine, background shader compilation, lazily generated grass, BatchedMesh foliage, two-sided adaptive quality (steps down under 30 fps, climbs back above 52 with hysteresis so quality never ratchets away), GPU/memory-aware defaults, WebGL context-loss recovery, retrying model loads |
| Accessibility & SEO | Classic HTML view, keyboard controls, reduced-motion support, noscript fallback, Open Graph image, JSON-LD |

### World map

The map is a real render of the world, not a drawing: after the shaders compile, the scene is rendered
once from straight above with an orthographic camera (trees, buildings, water, shadows), tone-mapped to a
canvas and given topographic contour lines. The minimap and the travel map both draw from that image;
the travel map can be zoomed (wheel / pinch / buttons) and panned, with a compass, a metric scale bar and
live enemy markers. Zooming in re-renders the visible patch at full resolution rather than magnifying the
overview, so the map stays sharp, and map renders always use a fixed high sun so they read the same at any
time of day. The world itself opens in the morning.

### Your photo

Drop a headshot at `public/profile.jpg` (`.png`, `.jpeg` and `.webp` work too) and it appears in three places: on the loading screen (fading
and scaling in, then flying up into the top bar when you enter), as the profile picture in the top bar,
and at the top of the classic portfolio page. Without that file everything falls back to the "HA"
monogram, so the site works either way. A square-ish crop of about 800x800 and under ~200 KB is plenty.

### Browser notes

Chrome-family browsers compile shaders on a background thread (`KHR_parallel_shader_compile`); Firefox
compiles them on the main thread instead. So on Firefox the world skips the aerial fly-in, warms its
shaders up in small steps behind an animated progress bar, and runs without the ambient-occlusion pass
(which alone took ~5 s to compile there and cost roughly a third of the frame rate). Everything else —
grass, shadows, sky lighting, bloom, anti-aliasing, the satellite map — is identical.

### Deep links

- `/?zone=projects` or `/#contact` — enter the world and travel straight to a station
- `/?time=night` — start at a given time of day (`morning`, `day`, `sunset`, `night`)
- `/?quality=low` — force a graphics preset

## Controls

`WASD` / arrows jog · `Shift` sprint · `Ctrl` walk · `Space` jump · `E` interact · drag to look · scroll to zoom ·
click ground to walk · `R` reload · `B` battle on/off · `M` map · `T` time of day · `P` classic portfolio · `Esc` close

## Explore & Battle modes

The site always opens in **Explore** mode (the battle is never on by default): WASD/arrows to jog (Shift sprint, Ctrl walk), Space to jump, drag to look,
click the ground to walk there, E to open a station. The **Start battle** button (top-right, or `B`) turns on the
shooting game — seven enemy outposts appear (red dots on the minimap/world map). Click the world to lock the
mouse: move to aim, **left-click** shoots, **hold right-click** to look through the 4× scope (tighter aim, more damage),
**G / middle-click** throws a grenade, **R** reloads, **Esc** frees the mouse. The rifle is shouldered and
ready the whole time in battle, each shot kicks the aim up, the crosshair flashes a tick when a shot lands
(red on a kill) and the HUD tracks the 30-round magazine (it reloads automatically when it runs dry).
**Stop game** removes every enemy again. Stations and the cabin are safe zones; at 0 HP the explorer becomes a
translucent spirit who can still explore. The chosen mode is remembered per visitor.

## 3D models

All models are **CC0** packs by [Quaternius](https://quaternius.com), downloaded from
[poly.pizza](https://poly.pizza/u/Quaternius): Ultimate Modular Men Pack (Adventurer player), Toon Shooter Game Kit (enemies, AK rifle, props),
Stylized Nature MegaKit + Ultimate Stylized Nature Pack (trees, flowers, bushes, ferns), Medieval Village Pack
and Furniture Pack. Raw files live in `assets-src/raw`; `node assets-src/build.mjs` optimises them
(WebP textures, meshopt compression, unused weapons removed) into `public/models` (~4 MB total).

## Credits

Grass shading approach inspired by [FluffyGrass](https://github.com/thebenezer/FluffyGrass) (MIT);
water cell highlights and firefly glow inspired by Ebenezer's
[AnimeWaterShader](https://github.com/thebenezer/AnimeWaterShader) and
[threejs-fireflies](https://github.com/thebenezer/threejs-fireflies). Terrain, water, sky, landmarks and all
sounds are generated in code; 3D models are the CC0 Quaternius packs listed above.
