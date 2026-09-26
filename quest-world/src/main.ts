import '@fontsource-variable/fraunces';
import '@fontsource-variable/manrope';
import './styles/main.css';
import './styles/quest.css';

import { UI } from './ui/UI';
import { detectQuality } from './core/Quality';
import { loadQuest } from './quest/api';

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

  // The quest (questions, skills, company) must be known before the world is built:
  // the 3D signs, crystals and banners are painted from it.
  try {
    await loadQuest();
  } catch (err) {
    ui.showError((err as Error).message || 'Could not load the quest. Is ProofArena running?');
    return;
  }
  ui.onQuestLoaded();

  if (!webglAvailable()) {
    ui.showError('3D is not supported on this device. Try Chrome or Edge on a laptop.');
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
    onKill: (alive, total, outpost) => ui.onKill(alive, total, outpost),
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
      // Reload once on the lightest settings; if the GPU keeps failing, say so.
      let losses = 99;
      try {
        losses = Number(sessionStorage.getItem('quest-context-lost') || 0) + 1;
        sessionStorage.setItem('quest-context-lost', String(losses));
        sessionStorage.setItem('quest-safe-mode', '1');
      } catch {
        /* storage unavailable */
      }
      if (losses <= 2) {
        ui.showNotice('The graphics driver reset the 3D view - reloading in safe mode...');
        setTimeout(() => location.reload(), 1600);
      } else {
        ui.showNotice('3D graphics are unstable on this device. Close other tabs or try another browser.');
      }
    },
    onFatal: () => ui.showNotice('The 3D world stopped unexpectedly. Reload the page to continue your quest.'),
  });
  ui.attach(exp);
  if (import.meta.env.DEV) (window as unknown as { __exp: unknown }).__exp = exp;

  try {
    const params = new URLSearchParams(location.search);
    const forced = params.get('quality');
    await exp.load(forced === 'high' || forced === 'medium' || forced === 'low' ? forced : detectQuality());
    ui.onLoaded();
  } catch (err) {
    console.error(err);
    ui.showError('Something went wrong while building the world. Reload the page to try again.');
  }
}

boot();
