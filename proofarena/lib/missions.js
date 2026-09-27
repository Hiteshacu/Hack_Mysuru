import fs from 'node:fs';
import path from 'node:path';
import { diffLines } from 'diff';
import { readDb, updateDb, uid, logActivity } from './db';
import { submissionDir, sessionDir } from './paths';
import { getChallenge, getMissionDef, challengeTestPath } from './challenge';
import { runNodeTests } from './runner';
import { copyProject, listFiles, safeJoin, diffDirs, isPlatformFile } from './workspace';
import { findMutation, applyMutation, studentTestFiles } from './review';
import { awardXp, BADGES } from './scoring';
import { aiVivaQuestions, aiCodeVivaQuestions, aiProvider } from './ai';
import { ensureSubmissionFiles, snapshotOf } from './restore';

const ORDER = ['bug-hunt', 'fix-review', 'plot-twist', 'viva'];
const MISSION_TEST = 'tests/proofarena-mission.test.js';
const MISSION_HELPER = 'tests/proofarena-helper.js';

export function unlockNext(sub) {
  for (const id of ORDER) {
    const m = sub.missions.find((x) => x.id === id);
    if (!m || m.status === 'passed' || m.status === 'skipped') continue;
    if (m.status === 'locked') m.status = 'ready';
    return;
  }
}

// Company publishes the review: rubric is saved and the Live Round missions are created.
export function publishReview(db, sub, { rubric, note }) {
  sub.rubric = rubric;
  sub.reviewerNote = note || '';
  sub.reviewedAt = new Date().toISOString();
  sub.status = 'in_arena';
  const student = db.students.find((s) => s.id === sub.studentId);
  awardXp(student, 50);
  if (sub.track === 'review') {
    // Company-written challenge: no hidden tests to build missions from, so the Live Round is the viva.
    sub.missions = [{ id: 'viva', status: 'ready', attempts: 0, result: null }];
    sub.viva = null;
    logActivity(db, `Review published for ${student.name}. The viva is being prepared.`, 'company');
    return;
  }
  const confirmed = sub.comments.filter((c) => c.status === 'confirmed');
  const hasFix = confirmed.some((c) => c.mission === 'fix-review') || sub.checks.hiddenTests.passed < sub.checks.hiddenTests.total;
  sub.missions = [
    { id: 'bug-hunt', status: sub.checks.mutation ? 'locked' : 'skipped', attempts: 0, result: null },
    { id: 'fix-review', status: hasFix ? 'locked' : 'skipped', attempts: 0, result: null },
    { id: 'plot-twist', status: 'locked', attempts: 0, result: null },
    { id: 'viva', status: 'locked', attempts: 0, result: null },
  ];
  unlockNext(sub);
  logActivity(db, `Review published for ${student.name}. The Live Round is unlocked.`, 'company');
}

function templateCodeViva(files) {
  const code = Object.keys(files).filter((p) => /\.(c|m)?(js|ts)x?$|\.py$/.test(p) && !p.startsWith('tests/') && !/config/.test(p));
  const main = code.find((p) => /service|controller|handler|app|server|index|main/i.test(p)) || code[0] || 'your main file';
  const decisions = files['docs/decisions.md'] || '';
  const firstDecision = decisions.match(/^##\s+(.+)$/m)?.[1];
  return [
    { q: `Walk us through what happens, step by step, when a request reaches ${main}. Which function handles it and where can it fail?`, about: main },
    firstDecision
      ? { q: `Your decision log says "${firstDecision}". What was the alternative, and what would make you change this decision?`, about: 'docs/decisions.md' }
      : { q: 'Name one design decision you made in this project and the trade-off you accepted.', about: 'design' },
    { q: 'If traffic grew 10× tomorrow, what part of your code would break first, and what would you change?', about: 'scaling' },
  ];
}

// Review track: after the review is published, prepare viva questions from the submitted code.
export async function prepareCodeViva(submissionId) {
  const sub = readDb().submissions.find((s) => s.id === submissionId);
  const challenge = getChallenge(sub.challengeId);
  const files = {};
  const { original } = await ensureSubmissionFiles(sub);
  for (const rel of listFiles(original)) files[rel] = fs.readFileSync(path.join(original, rel), 'utf8');
  const aiQs = await aiCodeVivaQuestions({ challenge, files });
  const questions = (aiQs || templateCodeViva(files)).map((q, i) => ({ id: `q${i + 1}`, ...q }));
  updateDb((db) => {
    db.submissions.find((x) => x.id === submissionId).viva = { questions, answers: {}, source: aiQs ? aiProvider().id : 'templates', submittedAt: null, scores: {}, scoredAt: null };
  });
}

function secondsSince(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 1000);
}

export async function startSession(submissionId, missionId) {
  const db = readDb();
  const sub = db.submissions.find((s) => s.id === submissionId);
  if (!sub) throw new Error('Submission not found');
  const mission = sub.missions.find((m) => m.id === missionId);
  if (!mission || mission.status !== 'ready') throw new Error('This mission is not unlocked yet');
  const existing = db.sessions.find((s) => s.submissionId === submissionId && s.missionId === missionId && s.status === 'active');
  if (existing) return existing.id;

  const challenge = getChallenge(sub.challengeId);
  const def = getMissionDef(sub.challengeId, missionId);
  const id = uid('ses');
  const dir = sessionDir(submissionId, id);
  const { current } = await ensureSubmissionFiles(sub);
  const mutation = prepareWorkspace({ challenge, def, current, dir, missionId });

  const baseline = await runNodeTests({
    cwd: current,
    files: [challengeTestPath(challenge.id, challenge.hiddenTests)],
    env: { PA_WORKSPACE: current },
  });

  updateDb((d) => {
    d.sessions.push({
      id,
      submissionId,
      missionId,
      status: 'active',
      startedAt: new Date().toISOString(),
      mutation,
      baselinePassing: baseline.tests.filter((t) => t.ok).map((t) => t.name),
      events: [{ t: 0, type: 'start', text: 'Mission started' }],
      runs: 0,
      hintsUsed: 0,
      lastResult: null,
    });
    const s = d.submissions.find((x) => x.id === submissionId);
    const student = d.students.find((x) => x.id === s.studentId);
    logActivity(d, `${student.name} started ${def.title}`, student.id);
  });
  return id;
}

// The mission's working copy: the student's current code, the planted bug (Bug Hunt) and the mission tests.
// `mutation` is passed when rebuilding a session, so the same bug is planted again.
function prepareWorkspace({ challenge, def, current, dir, missionId, mutation }) {
  const work = path.join(dir, 'work');
  copyProject(current, work);
  if (mutation) applyMutation(work, mutation);
  else if (missionId === 'bug-hunt') {
    mutation = findMutation(challenge, work);
    if (mutation) applyMutation(work, mutation);
  }
  const testsDir = path.dirname(challengeTestPath(challenge.id, '_helper.js'));
  fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(testsDir, '_helper.js'), path.join(work, MISSION_HELPER));
  const testSource = fs.readFileSync(path.join(testsDir, def.testFile), 'utf8').replace("require('./_helper')", "require('./proofarena-helper')");
  fs.writeFileSync(path.join(work, MISSION_TEST), testSource);
  copyProject(work, path.join(dir, 'base'));
  return mutation || null;
}

async function loadSession(id) {
  const db = readDb();
  const session = db.sessions.find((s) => s.id === id);
  if (!session) throw new Error('Session not found');
  const sub = db.submissions.find((s) => s.id === session.submissionId);
  if (!sub) throw new Error('Submission not found');
  const dir = sessionDir(sub.id, id);
  const work = path.join(dir, 'work');
  if (!listFiles(work).length) {
    // This server instance never saw the session: rebuild it, then replay the student's saved edits.
    const { current } = await ensureSubmissionFiles(sub);
    prepareWorkspace({ challenge: getChallenge(sub.challengeId), def: getMissionDef(sub.challengeId, session.missionId), current, dir, missionId: session.missionId, mutation: session.mutation });
    for (const [rel, content] of Object.entries(session.files || {})) {
      const full = safeJoin(work, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
  return { db, session, sub, work, dir };
}

export async function sessionView(id) {
  const { db, session, sub, work } = await loadSession(id);
  const def = getMissionDef(sub.challengeId, session.missionId);
  const files = listFiles(work)
    .filter((p) => p !== MISSION_HELPER)
    .map((p) => ({ path: p, content: fs.readFileSync(path.join(work, p), 'utf8'), readOnly: isPlatformFile(p) }));
  const student = db.students.find((s) => s.id === sub.studentId);
  const { mutation, baselinePassing, files: _edits, ...safe } = session;
  return {
    session: { ...safe, elapsedSec: secondsSince(session.startedAt) },
    mission: { ...def, hints: undefined, hintCount: def.hints?.length || 0, hintsShown: (def.hints || []).slice(0, session.hintsUsed) },
    files,
    student: { id: student.id, name: student.name, xp: student.xp },
    submissionId: sub.id,
  };
}

function pushEvent(session, event) {
  session.events.push({ t: secondsSince(session.startedAt), ...event });
}

export async function saveFile(id, rel, content) {
  const { work } = await loadSession(id);
  if (isPlatformFile(rel)) throw new Error('Mission test files are read-only');
  if (!/^(src|tests|docs)\/[\w\-./]+\.(js|cjs|mjs|json|md)$/.test(rel)) throw new Error('You can only edit .js, .json or .md files in src/, tests/ or docs/');
  const full = safeJoin(work, rel);
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (before === content) return;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  let added = 0;
  let removed = 0;
  for (const part of diffLines(before, content)) {
    if (part.added) added += part.count;
    if (part.removed) removed += part.count;
  }
  updateDb((db) => {
    const session = db.sessions.find((s) => s.id === id);
    (session.files ||= {})[rel] = content; // so another server instance can rebuild this workspace
    const last = session.events[session.events.length - 1];
    const now = secondsSince(session.startedAt);
    if (last && last.type === 'edit' && last.file === rel && now - last.t < 20) {
      last.added += added;
      last.removed += removed;
      last.t = now;
    } else {
      pushEvent(session, { type: 'edit', file: rel, added, removed, created: before === '' || undefined });
    }
  });
}

export async function runSession(id) {
  const { work } = await loadSession(id);
  const env = { PA_WORKSPACE: work };
  const mission = await runNodeTests({ cwd: work, files: [path.join(work, MISSION_TEST)], env });
  const own = await runNodeTests({ cwd: work, files: studentTestFiles(work), env });
  updateDb((db) => {
    const session = db.sessions.find((s) => s.id === id);
    session.runs += 1;
    pushEvent(session, { type: 'run', passed: mission.passed, failed: mission.failed, ownPassed: own.passed, ownFailed: own.failed });
  });
  const tidy = (text) =>
    text
      .split(work).join('.')
      .split('\n')
      .filter((l) => !/node:internal|processTicksAndRejections/.test(l))
      .join('\n');
  return {
    output: `── Mission tests ──\n${tidy(mission.output)}\n\n── Your own tests ──\n${tidy(own.output)}`,
    mission: { passed: mission.passed, total: mission.total, tests: mission.tests },
    own: { passed: own.passed, total: own.total, tests: own.tests },
  };
}

export function takeHint(id) {
  return updateDb((db) => {
    const session = db.sessions.find((s) => s.id === id);
    const sub = db.submissions.find((s) => s.id === session.submissionId);
    const def = getMissionDef(sub.challengeId, session.missionId);
    if (session.hintsUsed >= def.hints.length) return { hints: def.hints, remaining: 0 };
    session.hintsUsed += 1;
    pushEvent(session, { type: 'hint', index: session.hintsUsed });
    return { hints: def.hints.slice(0, session.hintsUsed), remaining: def.hints.length - session.hintsUsed };
  });
}

function xpFor(def, { durationSec, hintsUsed, blindSpotClosed, srcFilesChanged, missionId }) {
  const lines = [{ label: `${def.title} cleared`, xp: def.xp }];
  const badges = [];
  if (durationSec < def.minutes * 30) {
    lines.push({ label: 'Speed bonus (under half the time)', xp: 50 });
    badges.push('speed-runner');
  }
  if (hintsUsed) lines.push({ label: `${hintsUsed} hint${hintsUsed > 1 ? 's' : ''} used`, xp: -50 * hintsUsed });
  if (missionId === 'bug-hunt') {
    badges.push('bug-hunter');
    if (blindSpotClosed) {
      lines.push({ label: 'Your new test catches the bug', xp: 100 });
      badges.push('blind-spot');
    }
  }
  if (missionId === 'fix-review') badges.push('clean-fixer');
  if (missionId === 'plot-twist') {
    badges.push('twist-tamer');
    if (srcFilesChanged <= 2) {
      lines.push({ label: 'Small footprint (≤ 2 source files)', xp: 100 });
      badges.push('small-footprint');
    }
  }
  return { lines, total: lines.reduce((n, l) => n + l.xp, 0), badges };
}

export function templateVivaQuestions(sub) {
  const res = (id) => sub.missions.find((m) => m.id === id)?.result;
  const twistFiles = (res('plot-twist')?.changes || []).filter((c) => c.path.startsWith('src/')).map((c) => c.path);
  const bug = res('bug-hunt');
  const questions = [
    {
      q: `In the Plot Twist you changed ${twistFiles.join(', ') || 'your code'}. Walk us through how a booking of 3 adults and 2 children ends up with a total of ₹360 in your code.`,
      about: twistFiles[0] || 'plot twist',
    },
  ];
  if (bug) {
    questions.push({
      q: `The planted bug was in ${bug.mutation?.file || 'your capacity check'}${bug.mutation ? ` (line ${bug.mutation.line})` : ''}. How did you find it, and what test would stop it from coming back?`,
      about: bug.mutation?.file || 'bug hunt',
    });
  }
  questions.push({
    q: 'Where does your code now check that a booking has at least 1 adult and at most 10 people? Why did you put the check there and not somewhere else?',
    about: 'validation',
  });
  return questions;
}

export async function submitSession(id) {
  const { session, sub, work, dir } = await loadSession(id);
  if (session.status !== 'active') throw new Error('This mission is already finished');
  const challenge = getChallenge(sub.challengeId);
  const def = getMissionDef(sub.challengeId, session.missionId);

  // Grade a clean copy with fresh official tests, so edits to test files can't fake a pass.
  const grade = path.join(dir, 'grade');
  copyProject(work, grade);
  for (const p of listFiles(grade).filter(isPlatformFile)) fs.rmSync(path.join(grade, p));
  const env = { PA_WORKSPACE: grade };
  const missionRun = await runNodeTests({ cwd: grade, files: [challengeTestPath(challenge.id, def.testFile)], env });
  const coreRun = await runNodeTests({ cwd: grade, files: [challengeTestPath(challenge.id, challenge.hiddenTests)], env });
  const regressions = session.baselinePassing.filter((name) => !coreRun.tests.find((t) => t.name === name)?.ok);
  const passed = missionRun.total > 0 && missionRun.failed === 0 && regressions.length === 0;
  const changes = diffDirs(path.join(dir, 'base'), work);
  const srcFilesChanged = changes.filter((c) => c.path.startsWith('src/')).length;
  const durationSec = secondsSince(session.startedAt);

  let blindSpotClosed = false;
  if (passed && session.missionId === 'bug-hunt' && session.mutation) {
    const probe = path.join(dir, 'probe');
    copyProject(grade, probe);
    const again = findMutation(challenge, probe);
    if (again) {
      applyMutation(probe, again);
      const r = await runNodeTests({ cwd: probe, files: studentTestFiles(probe) });
      blindSpotClosed = r.failed > 0;
    }
    fs.rmSync(probe, { recursive: true, force: true });
  }

  const report = {
    passed,
    missionTests: { passed: missionRun.passed, total: missionRun.total, tests: missionRun.tests },
    hiddenTests: { passed: coreRun.passed, total: coreRun.total },
    regressions,
    changes,
    srcFilesChanged,
    durationSec,
    blindSpotClosed,
  };

  if (!passed) {
    updateDb((db) => {
      const s = db.sessions.find((x) => x.id === id);
      s.lastResult = { ...report, changes: undefined };
      pushEvent(s, { type: 'submit', ok: false, text: `${missionRun.passed}/${missionRun.total} mission tests, ${regressions.length} regressions` });
      db.submissions.find((x) => x.id === sub.id).missions.find((m) => m.id === session.missionId).attempts += 1;
    });
    return { ...report, xp: null, newBadges: [] };
  }

  const xp = xpFor(def, { ...report, hintsUsed: session.hintsUsed, missionId: session.missionId });
  copyProject(grade, path.join(submissionDir(sub.id), 'current'));

  let newBadges = [];
  updateDb((db) => {
    const s = db.sessions.find((x) => x.id === id);
    s.status = 'passed';
    pushEvent(s, { type: 'submit', ok: true, text: 'All mission tests pass, no regressions' });
    const liveSub = db.submissions.find((x) => x.id === sub.id);
    liveSub.snapshot = snapshotOf(grade); // the project after this mission, for any server instance
    const m = liveSub.missions.find((x) => x.id === session.missionId);
    m.attempts += 1;
    m.status = 'passed';
    m.result = {
      ...report,
      hintsUsed: s.hintsUsed,
      runs: s.runs,
      events: s.events,
      mutation: s.mutation ? { file: s.mutation.file, line: s.mutation.line, original: s.mutation.original.trim(), mutated: s.mutation.mutated.trim() } : null,
      xp: xp.total,
      finishedAt: new Date().toISOString(),
    };
    unlockNext(liveSub);
    const student = db.students.find((x) => x.id === liveSub.studentId);
    awardXp(student, xp.total);
    newBadges = xp.badges.map((b) => awardXp(student, 0, b)).filter(Boolean);
    logActivity(db, `${student.name} cleared ${def.title}${session.missionId === 'plot-twist' ? ` changing ${srcFilesChanged} source file${srcFilesChanged === 1 ? '' : 's'}` : ''}`, student.id);
  });

  if (session.missionId === 'plot-twist') {
    const fresh = readDb().submissions.find((x) => x.id === sub.id);
    const changesByMission = fresh.missions
      .filter((m) => m.result?.changes)
      .map((m) => ({ mission: getMissionDef(sub.challengeId, m.id).title, changes: m.result.changes }));
    const aiQs = await aiVivaQuestions({ changesByMission });
    const questions = (aiQs || templateVivaQuestions(fresh)).map((q, i) => ({ id: `q${i + 1}`, ...q }));
    updateDb((db) => {
      db.submissions.find((x) => x.id === sub.id).viva = { questions, answers: {}, source: aiQs ? aiProvider().id : 'templates', submittedAt: null, scores: {}, scoredAt: null };
    });
  }

  return { ...report, xp, newBadges: newBadges.map((b) => ({ id: b, ...BADGES[b] })) };
}

export function submitViva(submissionId, answers) {
  updateDb((db) => {
    const sub = db.submissions.find((s) => s.id === submissionId);
    sub.viva.answers = answers;
    sub.viva.submittedAt = new Date().toISOString();
    sub.missions.find((m) => m.id === 'viva').status = 'submitted';
    const student = db.students.find((s) => s.id === sub.studentId);
    logActivity(db, `${student.name} submitted viva answers. Waiting for the company to score.`, student.id);
  });
}

export function scoreViva(submissionId, scores) {
  updateDb((db) => {
    const sub = db.submissions.find((s) => s.id === submissionId);
    sub.viva.scores = scores;
    sub.viva.scoredAt = new Date().toISOString();
    sub.missions.find((m) => m.id === 'viva').status = 'passed';
    sub.status = 'complete';
    const student = db.students.find((s) => s.id === sub.studentId);
    const values = Object.values(scores);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    awardXp(student, 150, avg >= 4 ? 'clear-thinker' : null);
    logActivity(db, `${student.name}'s profile is fully verified`, student.id);
  });
}

// A rough suggestion for the reviewer: longer answers that name real files and functions score higher.
export function suggestVivaScore(answer, sub) {
  const words = (answer || '').trim().split(/\s+/).filter(Boolean).length;
  const identifiers = new Set();
  for (const m of sub.missions) {
    for (const c of m.result?.changes || []) {
      identifiers.add(path.basename(c.path, path.extname(c.path)));
      for (const match of c.patch.matchAll(/function\s+(\w+)|(\w+)\s*\(/g)) identifiers.add(match[1] || match[2]);
    }
  }
  const mentions = [...identifiers].filter((id) => id && id.length > 3 && answer?.includes(id)).length;
  if (words >= 30 && mentions >= 1) return 4;
  if (words >= 15) return 3;
  if (words >= 5) return 2;
  return 1;
}
