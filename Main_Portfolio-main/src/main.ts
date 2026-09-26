import '@fontsource-variable/fraunces';
import '@fontsource-variable/manrope';
import './styles/main.css';

import { UI } from './ui/UI';
import { detectQuality } from './core/Quality';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('webgl') as HTMLCanvasElement;
  const ui = new UI(root);

  if (!webglAvailable()) {
    ui.showError('3D is not supported on this device — opening the classic portfolio.');
    ui.openClassic();
    return;
  }

  // Load fonts before canvas labels are drawn so 3D signs use the right typefaces.
  await Promise.race([
    Promise.all([document.fonts.load('600 48px "Fraunces Variable"'), document.fonts.load('700 20px "Manrope Variable"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  const { Experience } = await import('./core/Experience');
  const exp = new Experience(canvas, {
    onProgress: (p, label) => ui.setProgress(p, label),
    onInteractable: (item) => ui.onInteractable(item),
    onDiscover: (zone, n, total) => ui.onDiscover(zone, n, total),
    onZone: (zone) => ui.onZone(zone),
    onFirstMove: () => ui.onFirstMove(),
    onQualityChange: (level, reason) => ui.onQualityChange(level, reason),
    onKey: (code) => ui.onKey(code),
    onCombatState: (s) => ui.onCombatState(s),
    onPlayerHealth: (hp, max) => ui.onPlayerHealth(hp, max),
    onGrenades: (n) => ui.onGrenades(n),
    onEnemies: (alive) => ui.onEnemies(alive),
    onKill: (alive, total) => ui.onKill(alive, total),
    onPlayerHurt: () => ui.onPlayerHurt(),
    onPlayerDeath: () => ui.onPlayerDeath(),
    onPickup: (kind) => ui.onPickup(kind),
    onAllCleared: () => ui.onAllCleared(),
    onBattle: (on) => ui.onBattle(on),
    onPointerLock: (locked) => ui.onPointerLock(locked),
    onScope: (on) => ui.onScope(on),
    onAmmo: (ammo, magazine, reloading) => ui.onAmmo(ammo, magazine, reloading),
    onShot: (hit) => ui.onShot(hit),
    onContextLost: () => {
      // Reload once on the lightest settings; if the GPU keeps failing, fall back to the classic page.
      let losses = 99;
      try {
        losses = Number(sessionStorage.getItem('hitesh-context-lost') || 0) + 1;
        sessionStorage.setItem('hitesh-context-lost', String(losses));
        sessionStorage.setItem('hitesh-safe-mode', '1');
      } catch {
        /* storage unavailable */
      }
      if (losses <= 2) {
        ui.showNotice('The graphics driver reset the 3D view - reloading in safe mode...');
        setTimeout(() => location.reload(), 1600);
      } else {
        ui.showNotice('3D graphics are unstable on this device - opening the classic portfolio.');
        ui.openClassic();
      }
    },
    onFatal: () => {
      ui.showNotice('The 3D world stopped unexpectedly - opening the classic portfolio.');
      ui.openClassic();
    },
  });
  ui.attach(exp);
  if (import.meta.env.DEV) (window as unknown as { __exp: unknown }).__exp = exp;

  try {
    const params = new URLSearchParams(location.search);
    const forced = params.get('quality');
    await exp.load(forced === 'high' || forced === 'medium' || forced === 'low' ? forced : detectQuality());
    ui.onLoaded();
    if (params.has('autostart')) ui.enter(false, true);
  } catch (err) {
    console.error(err);
    ui.showError('Something went wrong while building the world — opening the classic portfolio.');
    ui.openClassic();
  }
}

boot();
