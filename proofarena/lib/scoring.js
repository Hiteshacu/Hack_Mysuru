// Turns a submission's evidence into the Verified Score, skill bars, XP levels and badges.

export const LEVELS = [
  { min: 0, name: 'Rookie' },
  { min: 300, name: 'Builder' },
  { min: 800, name: 'Debugger' },
  { min: 1500, name: 'Engineer' },
  { min: 2500, name: 'Architect' },
];

export function levelFor(xp = 0) {
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  return { number: index + 1, name: current.name, next, progress, xp };
}

export const BADGES = {
  'first-submit': { name: 'First Submit', icon: 'Rocket', desc: 'Submitted a project for review' },
  'bug-hunter': { name: 'Bug Hunter', icon: 'Bug', desc: 'Found and fixed a planted bug' },
  'blind-spot': { name: 'Blind Spot Closed', icon: 'Eye', desc: 'Wrote a test that catches the planted bug' },
  'clean-fixer': { name: 'Clean Fixer', icon: 'Wrench', desc: 'Fixed a review finding without breaking anything' },
  'twist-tamer': { name: 'Twist Tamer', icon: 'Crown', desc: 'Beat the Plot Twist boss' },
  'small-footprint': { name: 'Small Footprint', icon: 'Layers', desc: 'Handled the Plot Twist by changing 2 source files or fewer' },
  'speed-runner': { name: 'Speed Runner', icon: 'Zap', desc: 'Finished a mission in under half the time' },
  'clear-thinker': { name: 'Clear Thinker', icon: 'MessageCircle', desc: 'Averaged 4 or more in the viva' },
  sharpshooter: { name: 'Sharpshooter', icon: 'Zap', desc: 'Hit all 5 correct targets in the Arrow Range' },
  'quest-champion': { name: 'Quest Champion', icon: 'Crown', desc: 'Finished a 3D Quest and joined the community' },
};

// Adds XP and an optional badge. Returns the badge id if it was newly earned.
export function awardXp(student, amount, badge) {
  student.xp = Math.max(0, (student.xp || 0) + amount);
  if (badge && !student.badges.includes(badge)) {
    student.badges.push(badge);
    return badge;
  }
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function missionById(sub, id) {
  return (sub.missions || []).find((m) => m.id === id);
}

function attemptPenalty(m) {
  const extraAttempts = Math.max(0, (m.attempts || 1) - 1);
  return extraAttempts * 2 + (m.result?.hintsUsed || 0);
}

export function footprintPoints(srcFilesChanged) {
  if (srcFilesChanged <= 2) return 5;
  if (srcFilesChanged <= 4) return 3;
  return 1;
}

export function computeScore(sub) {
  const c = sub.checks || {};
  const parts = [];
  const add = (group, key, label, points, max, machine) => parts.push({ group, key, label, points, max, machine });

  if (c.hiddenTests) add('review', 'hidden', 'Hidden tests', (15 * c.hiddenTests.passed) / c.hiddenTests.total, 15, true);
  if (c.docs) {
    const present = Object.values(c.docs).filter(Boolean).length;
    add('review', 'docs', 'Docs present', (5 * present) / Object.keys(c.docs).length, 5, true);
  }
  if (c.claims) {
    const unverified = c.claims.filter((cl) => !cl.verified).length;
    add('review', 'claims', 'Claims match code', Math.max(0, 5 - 2.5 * unverified), 5, true);
  }
  const reviewTrack = sub.track === 'review';
  if (reviewTrack && c.studentTests) {
    const t = c.studentTests;
    add('review', 'own', 'Their own tests pass', t.total ? (10 * t.passed) / t.total : 0, 10, true);
  }
  if (reviewTrack && 'mutation' in c) add('review', 'mutation', 'Tests catch the planted bug', !c.mutation || !c.mutation.survived ? 5 : 0, 5, true);
  const rubricVals = sub.rubric ? Object.values(sub.rubric).filter((v) => typeof v === 'number') : [];
  if (sub.reviewedAt && rubricVals.length) add('review', 'rubric', 'Reviewer rubric', (15 * avg(rubricVals)) / 10, 15, false);

  const bug = missionById(sub, 'bug-hunt');
  if (bug?.status === 'passed') add('arena', 'bug-hunt', 'Bug Hunt', Math.max(5, 10 - attemptPenalty(bug)), 10, true);
  const fix = missionById(sub, 'fix-review');
  if (fix?.status === 'passed') add('arena', 'fix-review', 'Customer Complaint', Math.max(5, 10 - attemptPenalty(fix)), 10, true);
  if (fix?.status === 'skipped') add('arena', 'fix-review', 'Customer Complaint (nothing to fix)', 10, 10, true);
  const twist = missionById(sub, 'plot-twist');
  if (twist?.status === 'passed') {
    const pts = 20 + footprintPoints(twist.result.srcFilesChanged) - attemptPenalty(twist);
    add('arena', 'plot-twist', 'Plot Twist (boss)', Math.max(12, pts), 25, true);
  }
  const vivaScores = sub.viva?.scores ? Object.values(sub.viva.scores).filter((v) => typeof v === 'number') : [];
  if (sub.viva?.scoredAt && vivaScores.length) add('viva', 'viva', 'Viva', (15 * avg(vivaScores)) / 5, 15, false);

  // Review-track challenges (company-written) have 55 points in total, scaled to 100.
  const scale = reviewTrack ? 100 / 55 : 1;
  const maxes = reviewTrack ? { review: 40, arena: 0, viva: 15 } : { review: 40, arena: 45, viva: 15 };
  const raw = parts.reduce((n, p) => n + p.points, 0);
  const total = raw * scale;
  const machine = parts.filter((p) => p.machine).reduce((n, p) => n + p.points, 0);
  const possible = Math.round(parts.reduce((n, p) => n + p.max, 0) * scale);
  const groups = {};
  for (const g of ['review', 'arena', 'viva']) {
    const ps = parts.filter((p) => p.group === g);
    groups[g] = { points: round1(ps.reduce((n, p) => n + p.points, 0)), max: maxes[g], parts: ps.map((p) => ({ ...p, points: round1(p.points) })) };
  }

  return {
    total: Math.round(total),
    possible,
    track: reviewTrack ? 'review' : 'full',
    complete: reviewTrack ? sub.status === 'complete' : possible >= 99.9,
    confidence: raw ? Math.round((machine / raw) * 100) : 0,
    groups,
    skills: computeSkills(sub),
  };
}

function computeSkills(sub) {
  const c = sub.checks || {};
  const r = sub.rubric || {};
  const skills = {};
  if (c.hiddenTests) skills.Correctness = Math.round((100 * c.hiddenTests.passed) / c.hiddenTests.total);
  else if (sub.track === 'review' && c.studentTests?.total) skills.Correctness = Math.round((100 * c.studentTests.passed) / c.studentTests.total);
  const fix = missionById(sub, 'fix-review');
  if (skills.Correctness != null && (fix?.status === 'passed' || fix?.status === 'skipped')) {
    skills.Correctness = Math.round((skills.Correctness + 100) / 2);
  }
  const bug = missionById(sub, 'bug-hunt');
  if (bug?.status === 'passed') {
    const def = 20 * 60;
    const slow = bug.result.durationSec > def ? 10 : 0;
    skills.Debugging = Math.max(40, 100 - 10 * (bug.attempts - 1) - 8 * (bug.result.hintsUsed || 0) - slow);
  }
  const design = [];
  if (typeof r.design === 'number' && sub.reviewedAt) design.push(r.design * 10);
  const twist = missionById(sub, 'plot-twist');
  if (twist?.status === 'passed') design.push({ 5: 100, 3: 75, 1: 50 }[footprintPoints(twist.result.srcFilesChanged)]);
  if (design.length) skills.Design = Math.round(avg(design));
  const testing = [];
  if (typeof r.testing === 'number' && sub.reviewedAt) testing.push(r.testing * 10);
  if (c.mutation) testing.push(c.mutation.survived ? 55 : 95);
  if (bug?.status === 'passed') testing.push(bug.result.blindSpotClosed ? 100 : 60);
  if (testing.length) skills.Testing = Math.round(avg(testing));
  const comm = [];
  if (typeof r.docs === 'number' && sub.reviewedAt) comm.push(r.docs * 10);
  const vivaScores = sub.viva?.scores ? Object.values(sub.viva.scores).filter((v) => typeof v === 'number') : [];
  if (sub.viva?.scoredAt && vivaScores.length) comm.push(avg(vivaScores) * 20);
  if (comm.length) skills.Communication = Math.round(avg(comm));
  return skills;
}
