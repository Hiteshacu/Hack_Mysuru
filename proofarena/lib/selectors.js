// Small helpers for reading the shared state on the client.

export const live = (s) => !s.archived && s.status !== 'failed';

export function pendingReviews(state) {
  return state.submissions.filter((s) => !s.archived && (s.status === 'awaiting_review' || (s.viva?.submittedAt && !s.viva?.scoredAt)));
}

export const byId = (list, id) => list.find((x) => x.id === id);

export function challengeOf(state, id) {
  return state.library.find((c) => c.id === id);
}

export function missionDef(state, challengeId, missionId) {
  return challengeOf(state, challengeId)?.missions?.find((m) => m.id === missionId);
}

// One row per candidate with their best submission.
export function candidates(state) {
  return state.students
    .map((st) => {
      const sub = state.submissions.find((s) => s.id === st.bestSubmissionId);
      return sub ? { student: st, sub } : null;
    })
    .filter(Boolean)
    .filter(({ sub }) => sub.reviewedAt)
    .sort((a, b) => b.sub.score.total - a.sub.score.total);
}

export function isRising({ sub }) {
  return !sub.score.complete;
}

// Bug-bounty style report number, e.g. PA-4F2K.
export function reportId(sub) {
  return `PA-${sub.id.replace(/^sub-/, '').slice(0, 4).toUpperCase()}`;
}

// Bugcrowd-style priority labels for review findings.
export const PRIORITY = {
  high: { p: 'P2', label: 'P2 · High', points: 20 },
  medium: { p: 'P3', label: 'P3 · Medium', points: 10 },
  low: { p: 'P4', label: 'P4 · Low', points: 5 },
  good: { p: '★', label: 'Strength', points: 0 },
};

function hoursBetween(a, b) {
  return (new Date(b) - new Date(a)) / 3600000;
}

export function formatHours(h) {
  if (h == null) return '–';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

// HackerOne-style program stats for one challenge.
export function challengeStats(state, challengeId) {
  const subs = state.submissions.filter((s) => s.challengeId === challengeId && !s.archived);
  const verified = subs.filter((s) => s.status === 'complete');
  const reviewed = subs.filter((s) => s.reviewedAt);
  const toReview = reviewed.map((s) => hoursBetween(s.createdAt, s.reviewedAt));
  const hall = candidates(state).filter((c) => c.sub.challengeId === challengeId && c.sub.score.complete).slice(0, 5);
  return {
    submissions: subs.length,
    verified: verified.length,
    avgScore: verified.length ? Math.round(verified.reduce((n, s) => n + s.score.total, 0) / verified.length) : null,
    topScore: verified.length ? Math.max(...verified.map((s) => s.score.total)) : null,
    timeToReview: toReview.length ? toReview.reduce((a, b) => a + b, 0) / toReview.length : null,
    hall,
  };
}

// HackerOne-style response efficiency for a company.
export function companyResponse(state, companyId) {
  const openingIds = new Set(state.openings.filter((o) => o.companyId === companyId).map((o) => o.id));
  const subs = state.submissions.filter((s) => openingIds.has(s.openingId) && !s.archived);
  const reviewed = subs.filter((s) => s.reviewedAt);
  const times = reviewed.map((s) => hoursBetween(s.createdAt, s.reviewedAt));
  const within48 = times.filter((h) => h <= 48).length;
  const vivaTimes = subs.filter((s) => s.viva?.scoredAt && s.viva?.submittedAt).map((s) => hoursBetween(s.viva.submittedAt, s.viva.scoredAt));
  const findings = { high: 0, medium: 0, low: 0, good: 0 };
  for (const s of state.submissions.filter((x) => !x.archived)) for (const c of s.comments.filter((x) => x.status === 'confirmed')) findings[c.severity] = (findings[c.severity] || 0) + 1;
  return {
    reviewed: reviewed.length,
    pending: subs.filter((s) => s.status === 'awaiting_review').length,
    avgTimeToReview: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    avgTimeToViva: vivaTimes.length ? vivaTimes.reduce((a, b) => a + b, 0) / vivaTimes.length : null,
    efficiency: times.length ? Math.round((within48 / times.length) * 100) : null,
    findings,
  };
}

// Researcher-profile stats (HackerOne reputation / signal, Bugcrowd rank).
export function profileStats(state, student) {
  const ranked = candidates(state);
  const rank = ranked.findIndex((c) => c.student.id === student.id);
  const sub = state.submissions.find((s) => s.id === student.bestSubmissionId);
  const played = (sub?.missions || []).filter((m) => m.status === 'passed' && m.id !== 'viva');
  const firstTry = played.filter((m) => m.attempts <= 1).length;
  return {
    reputation: student.xp,
    rank: rank >= 0 ? rank + 1 : null,
    of: ranked.length,
    signal: played.length ? Math.round((firstTry / played.length) * 100) : null,
    confidence: sub?.score.confidence ?? null,
  };
}

// Where a student is in the loop, and what they should do next.
export function journey(state, studentId) {
  const subs = state.submissions.filter((s) => s.studentId === studentId && !s.archived);
  const sub = subs.filter((s) => s.status !== 'failed').at(-1) || null;
  const failed = subs.filter((s) => s.status === 'failed').at(-1) || null;
  const m = (id) => sub?.missions.find((x) => x.id === id);
  const done = (id) => ['passed', 'skipped'].includes(m(id)?.status);
  const reviewTrack = sub?.track === 'review';
  const all = [
    { key: 'pick', label: 'Pick a challenge', done: Boolean(sub) },
    { key: 'submit', label: 'Build & submit', done: Boolean(sub) },
    { key: 'review', label: 'Code review', done: Boolean(sub?.reviewedAt) },
    { key: 'bug-hunt', label: 'Bug Hunt', done: done('bug-hunt'), level: true },
    { key: 'fix-review', label: 'Complaint', done: done('fix-review'), level: true },
    { key: 'plot-twist', label: 'Boss: Plot Twist', done: done('plot-twist'), level: true, boss: true },
    { key: 'viva', label: 'Viva', done: m('viva')?.status === 'passed' || m('viva')?.status === 'submitted', level: true },
    { key: 'verified', label: 'Verified', done: sub?.status === 'complete' },
  ];
  const steps = reviewTrack ? all.filter((s) => !['bug-hunt', 'fix-review', 'plot-twist'].includes(s.key)) : all;
  const current = steps.findIndex((s) => !s.done);

  let next;
  if (!sub) {
    next = failed
      ? { title: 'Your last submission needs a fix', body: failed.error, href: '/student/opportunities', cta: 'Try again' }
      : { title: 'Pick your first challenge', body: 'Companies attach challenges to their openings. Solve one and your proof counts for all of them.', href: '/student/opportunities', cta: 'See opportunities' };
  } else if (sub.status === 'checking') {
    next = { title: 'Your code is being checked', body: 'Tests, a mutation probe and an AI review are running right now.', href: `/student/submission/${sub.id}`, cta: 'Watch live' };
  } else if (sub.status === 'awaiting_review') {
    next = { title: 'A company engineer is reviewing your code', body: 'The machine checks are done. You will get line-by-line feedback, and the next round unlocks after that.', href: `/student/submission/${sub.id}`, cta: 'See your report' };
  } else if (sub.viva?.questions && !sub.viva.submittedAt) {
    next = { title: 'Final level: the viva', body: reviewTrack ? '3 questions about your own code.' : '3 questions about the exact changes you made in the Live Round.', href: `/student/viva/${sub.id}`, cta: 'Answer the viva' };
  } else if (sub.viva?.submittedAt && !sub.viva.scoredAt) {
    next = { title: 'Viva submitted', body: 'The company engineer is scoring your answers. Your profile is verified after that.', href: '/student/profile', cta: 'View my proof' };
  } else if (sub.status === 'complete') {
    next = { title: `You're verified: ${sub.score.total}/100`, body: 'Every company using this challenge can see your proof. Watch for invites.', href: '/student/profile', cta: 'View my proof' };
  } else if (reviewTrack) {
    next = { title: 'Final level: the viva', body: 'Your questions are being prepared from your code. This takes a few seconds.', href: `/student/viva/${sub.id}`, cta: 'Open the viva' };
  } else {
    const ready = sub.missions.find((x) => x.status === 'ready');
    const def = ready && missionDef(state, sub.challengeId, ready.id);
    next = { title: def ? `Level ${def.level}: ${def.title}${def.boss ? ' (Boss)' : ''}` : 'Live Round', body: def?.story?.headline || 'Your next mission is ready.', href: `/student/arena/${sub.id}`, cta: 'Enter the Live Round' };
  }
  return { sub, steps, current, next };
}

export const STATUS_LABEL = {
  checking: { label: 'Checking', color: 'sky' },
  awaiting_review: { label: 'Needs review', color: 'amber' },
  in_arena: { label: 'In Live Round', color: 'violet' },
  complete: { label: 'Verified', color: 'green' },
  failed: { label: 'Failed', color: 'rose' },
};

// Everyone with a published review on a challenge, best score first.
export function challengeRanking(state, challengeId) {
  return state.submissions
    .filter((s) => s.challengeId === challengeId && !s.archived && s.reviewedAt)
    .sort((a, b) => b.score.total - a.score.total || a.createdAt.localeCompare(b.createdAt))
    .map((sub, i) => ({ rank: i + 1, sub, student: state.students.find((st) => st.id === sub.studentId) }));
}

export const TOP_N = 3;

// Where a student stands on their current challenge, and whether HR Connect is unlocked.
export function standing(state, studentId) {
  const sub = state.submissions.filter((s) => s.studentId === studentId && !s.archived && s.status !== 'failed').at(-1);
  if (!sub) return null;
  const ranking = challengeRanking(state, sub.challengeId);
  const me = ranking.find((r) => r.sub.id === sub.id);
  const third = ranking[TOP_N - 1];
  const rank = me?.rank ?? null;
  return {
    sub,
    challenge: state.library.find((c) => c.id === sub.challengeId),
    ranking,
    rank,
    total: ranking.length,
    reviewed: Boolean(sub.reviewedAt),
    unlocked: rank != null && rank <= TOP_N,
    gap: rank != null && rank > TOP_N && third ? Math.max(1, third.sub.score.total - sub.score.total + 1) : 0,
    remaining: 100 - (sub.score.possible || 0),
  };
}

// Companies whose openings use a challenge: the HRs a top-3 student can reach.
export function hrsForChallenge(state, challengeId) {
  const ids = [...new Set(state.openings.filter((o) => o.challengeId === challengeId).map((o) => o.companyId))];
  return ids.map((id) => {
    const company = state.companies.find((c) => c.id === id);
    return { company, hr: company?.hr || { name: 'Hiring Team', role: 'Talent Acquisition', slots: ['Mon 5:00 PM', 'Wed 11:00 AM'] }, openings: state.openings.filter((o) => o.companyId === id && o.challengeId === challengeId) };
  }).filter((x) => x.company);
}

// Mysuru-themed weekly leagues (TryHackMe / Duolingo style). XP decides the tier.
export const LEAGUES = [
  { name: 'Sandalwood', min: 0, color: 'from-amber-700 to-amber-900' },
  { name: 'Rosewood', min: 400, color: 'from-rose-500 to-rose-800' },
  { name: 'Silk', min: 900, color: 'from-fuchsia-500 to-violet-700' },
  { name: 'Gold', min: 1600, color: 'from-amber-300 to-amber-600' },
  { name: 'Palace', min: 2600, color: 'from-sky-400 to-indigo-700' },
];

export function leagueFor(xp = 0) {
  let i = 0;
  LEAGUES.forEach((l, j) => {
    if (xp >= l.min) i = j;
  });
  return { ...LEAGUES[i], index: i, next: LEAGUES[i + 1] || null };
}

// Other students in this week's league group (from nearby colleges) so the board feels alive.
export const LEAGUE_PEERS = [
  { id: 'peer-1', name: 'Kiran Gowda', initials: 'KG', college: 'JSS STU', xp: 1420, color: '#0F766E' },
  { id: 'peer-2', name: 'Sneha Patil', initials: 'SP', college: 'NIE Mysuru', xp: 1090, color: '#9333EA' },
  { id: 'peer-3', name: 'Farhan Ali', initials: 'FA', college: 'VVCE Mysuru', xp: 760, color: '#2563EB' },
  { id: 'peer-4', name: 'Divya Shetty', initials: 'DS', college: 'ATME Mysuru', xp: 520, color: '#DB2777' },
  { id: 'peer-5', name: 'Rohan Jain', initials: 'RJ', college: 'SJCE Mysuru', xp: 240, color: '#CA8A04' },
];

// Bug-bounty style report states, in order.
export const REPORT_STATES = [
  { key: 'new', label: 'New' },
  { key: 'checks', label: 'Auto-checked' },
  { key: 'triaged', label: 'Triaged' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'defended', label: 'Defended' },
  { key: 'verified', label: 'Verified' },
];

export function reportState(sub) {
  if (sub.status === 'complete') return 'verified';
  if (sub.viva?.submittedAt) return 'defended';
  if (sub.reviewedAt) return 'accepted';
  if (sub.status === 'awaiting_review') return 'triaged';
  if (sub.status === 'checking') return 'checks';
  return 'new';
}
