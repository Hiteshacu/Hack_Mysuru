// HTML for the station panels. Each station shows its stage: locked, ready (with a start button) or cleared.

import { esc, quest, stage, stageDone, STAGE_ORDER, type Stage } from './api';

const STAGES: { id: Stage; name: string; where: string; reward: string; icon: string }[] = [
  { id: 'mcq', name: 'Gate Quiz', where: 'Loading screen', reward: 'Entry to the world', icon: '📝' },
  { id: 'arrow', name: 'Arrow Range', where: 'Arrow Range (east)', reward: 'Your rifle', icon: '🏹' },
  { id: 'debug', name: 'Debug Den', where: 'The cabin (west)', reward: 'Key to the grove', icon: '🐞' },
  { id: 'dsa', name: 'Algorithm Grove', where: 'The grove (south)', reward: 'Community access', icon: '🧠' },
];

export const STATION_OF: Record<Exclude<Stage, 'mcq' | 'done'>, string> = { arrow: 'skills', debug: 'about', dsa: 'projects' };

function status(id: Stage) {
  if (stageDone(id)) return 'done';
  if (stage() === id) return 'ready';
  return 'locked';
}

export function trackerHTML() {
  return STAGES.map((s) => {
    const st = status(s.id);
    return `<li class="${st}"><span class="tr-icon">${st === 'done' ? '✔' : st === 'locked' ? '🔒' : s.icon}</span><span class="tr-name">${s.name}</span></li>`;
  }).join('') + `<li class="${stage() === 'done' ? 'ready' : 'locked'}"><span class="tr-icon">${stage() === 'done' ? '🏕' : '🔒'}</span><span class="tr-name">Community</span></li>`;
}

function locked(needed: string) {
  return `<div class="q-locked"><span>🔒</span><div><strong>Locked</strong><p>Finish <b>${needed}</b> first. Follow the golden arrow at the top of the screen.</p></div></div>`;
}

function cleared(text: string) {
  return `<div class="q-cleared"><span>✔</span><div><strong>Cleared</strong><p>${text}</p></div></div>`;
}

const chips = (xs: string[]) => `<div class="chips">${xs.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;

export const panels: Record<string, { eyebrow: string; title: () => string; render: () => string }> = {
  welcome: {
    eyebrow: 'Quest Gate',
    title: () => quest.view?.quest.title || 'The Quest',
    render: () => {
      const q = quest.view!.quest;
      return `
      <p class="lead">${esc(q.company?.name || 'A company')} is hiring. Prove your skills in four stages and enter the Community Camp, where their job links and HR emails are waiting.</p>
      ${chips(q.skills)}
      <p class="muted">${esc(q.jobDescription)}</p>
      <ol class="q-stages">${STAGES.map((s, i) => `<li class="${status(s.id)}"><b>${i + 1}</b><span>${s.icon} ${s.name}<small>${s.where} · reward: ${s.reward}</small></span></li>`).join('')}</ol>
      <p class="muted">Controls: <kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · <kbd>E</kbd> use a station · <kbd>M</kbd> map · <kbd>B</kbd> battle (after you earn the rifle)</p>`;
    },
  },
  skills: {
    eyebrow: 'Stage 2',
    title: () => 'Arrow Range',
    render: () => {
      const st = status('arrow');
      const q = quest.view!.quest;
      if (st === 'locked') return locked('the Gate Quiz');
      if (st === 'done') return cleared(`You hit ${quest.view?.run?.arrowScore?.correct ?? 3}/5 correct targets and earned your rifle. Press <kbd>B</kbd> to start a battle, or head to the Debug Den.`);
      return `
      <p class="lead">Each round asks a question about <b>${esc(q.skills.slice(0, 3).join(', '))}</b>. The answers are painted on three targets. Shoot the right one.</p>
      <ul class="q-rules"><li>🎯 5 rounds, 2 arrows each</li><li>💨 Mind the wind and gravity</li><li>⌨ Aim with the mouse or <kbd>↑</kbd> <kbd>↓</kbd>, hold to draw, release to shoot</li><li>🏆 3 correct targets win your <b>rifle</b></li></ul>
      <button class="btn btn-primary btn-lg q-start" data-quest="arrow">🏹 Step up to the range</button>`;
    },
  },
  about: {
    eyebrow: 'Stage 3',
    title: () => 'Debug Den',
    render: () => {
      const st = status('debug');
      const d = quest.view!.quest.debug;
      if (st === 'locked') return locked('the Arrow Range');
      if (st === 'done') return cleared('You fixed the bug. The Algorithm Grove to the south is open.');
      return `
      <p class="cs-kicker">🚨 Incoming bug report</p>
      <p class="lead">${esc(d.story)}</p>
      <p class="muted">Sit at the laptop, find the bug in <code>${esc(d.functionName)}</code> and make all ${d.tests.length} tests pass.</p>
      <button class="btn btn-primary btn-lg q-start" data-quest="debug">🐞 Open the laptop</button>`;
    },
  },
  projects: {
    eyebrow: 'Stage 4',
    title: () => 'Algorithm Grove',
    render: () => {
      const st = status('dsa');
      const s = quest.view!.quest.dsa;
      if (st === 'locked') return locked('the Debug Den');
      if (st === 'done') return cleared('You solved the final problem. The Community Camp by the lake is open!');
      return `
      <p class="cs-kicker">Final challenge · ${esc(s.title)}</p>
      <p class="lead">${esc(s.statement)}</p>
      <p class="muted">${s.examples.length} examples to try, ${s.hiddenCount} hidden tests on submit.</p>
      <button class="btn btn-primary btn-lg q-start" data-quest="dsa">🧠 Enter the grove</button>`;
    },
  },
  contact: {
    eyebrow: 'Finale',
    title: () => 'Community Camp',
    render: () => {
      const jobs = quest.view?.community;
      if (!jobs) return locked('all four stages');
      return `
      <p class="lead">🎉 Welcome to the community! You proved it. Here is every open role with its application link and HR email.</p>
      <div class="q-jobs">${jobs
        .map(
          (j) => `<div class="q-job" style="--c:${esc(j.color)}">
            <div><small>${esc(j.company)}</small><strong>${esc(j.title)}</strong><span class="muted">${esc(j.location)} · ${esc(j.pay)}</span></div>
            <div class="q-job-actions">
              ${j.applyUrl ? `<a class="btn btn-primary btn-sm" href="${esc(j.applyUrl)}" target="_blank" rel="noopener noreferrer">Apply</a>` : ''}
              ${j.hrEmail ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(j.hrEmail)}">✉ ${esc(j.hrEmail)}</button>` : ''}
            </div>
          </div>`,
        )
        .join('')}</div>
      <button class="btn btn-ghost" data-quest="home">Back to ProofArena</button>`;
    },
  },
  achievements: {
    eyebrow: 'Hall of Champions',
    title: () => 'Quest leaderboard',
    render: () => {
      const hall = quest.view?.hall || [];
      if (!hall.length) return `<p class="lead">No champions yet. Finish all four stages to be the first name on the wall.</p>`;
      return `<ol class="q-hall">${hall.map((h, i) => `<li><b>${['🥇', '🥈', '🥉'][i] || i + 1}</b><span>${esc(h.name)}<small>${esc(h.college)}</small></span><em>${h.points} pts</em></li>`).join('')}</ol>`;
    },
  },
  certifications: {
    eyebrow: 'Recruiter Ridge',
    title: () => 'Companies hiring',
    render: () => {
      const r = quest.view?.recruiters || [];
      return `<p class="lead">These companies hire through ProofArena. Finish the quest to reach their HRs in the Community Camp.</p>
      <div class="q-jobs">${r.map((c) => `<div class="q-job" style="--c:${esc(c.color)}"><div><strong>${esc(c.name)}</strong><span class="muted">${c.openings.length ? esc(c.openings.join(' · ')) : 'No open roles yet'}</span></div></div>`).join('')}</div>`;
    },
  },
};

/** Which stage the player should do next and where it is. */
export function objective(): { zone: string; label: string } | null {
  const s = stage();
  if (s === 'mcq') return { zone: 'welcome', label: 'Gate Quiz' };
  if (s === 'done') return { zone: 'contact', label: 'Community Camp' };
  const idx = STAGE_ORDER.indexOf(s);
  return { zone: STATION_OF[s as 'arrow' | 'debug' | 'dsa'], label: STAGES[idx].name };
}
