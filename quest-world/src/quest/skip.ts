// The "Skip" button every stage shows on the right of its top bar. Skipping unlocks the next game with 0 points
// for this one. It takes two clicks (the first one asks to confirm) so a stray click can't skip a game.

import { play, refreshQuest } from './api';

export type SkipStage = 'mcq' | 'arrow' | 'snake' | 'debug' | 'dsa';

const LABEL = 'Skip ⏭';

export function skipButtonHTML(): string {
  return `<button type="button" class="q-skip" title="Skip this game: the next one unlocks, but this one gives 0 points">${LABEL}</button>`;
}

/** Asks the server to skip the stage, then reloads the quest progress. */
export async function skipStage(stage: SkipStage) {
  await play('skip', { stage });
  await refreshQuest();
}

/** Makes the .q-skip button inside `root` work: first click asks to confirm, the second runs `onSkip`. */
export function wireSkip(root: HTMLElement, onSkip: () => Promise<void>) {
  const btn = root.querySelector<HTMLButtonElement>('.q-skip');
  if (!btn) return;
  let armed = 0;
  const reset = () => {
    window.clearTimeout(armed);
    armed = 0;
    btn.classList.remove('armed');
    btn.textContent = LABEL;
  };
  // Keep the click away from the game underneath (the bow, the snake's pointer).
  for (const type of ['pointerdown', 'mousedown', 'touchstart'] as const) btn.addEventListener(type, (e) => e.stopPropagation());
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.blur(); // so Space / Enter in the game can't press it again
    if (btn.disabled) return;
    if (!armed) {
      btn.classList.add('armed');
      btn.textContent = 'Skip? 0 pts · click again';
      armed = window.setTimeout(reset, 4000);
      return;
    }
    window.clearTimeout(armed);
    btn.disabled = true;
    btn.textContent = 'Skipping…';
    try {
      await onSkip();
    } finally {
      btn.disabled = false;
      reset();
    }
  });
}
