import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDb } from './db';
import { ROOT, submissionDir } from './paths';
import { getChallenge, challengeTestPath } from './challenge';
import { runNodeTests } from './runner';
import { copyProject, listFiles, readFiles, diffDirs, fetchSource } from './workspace';
import { findMutation, applyMutation, studentTestFiles } from './review';
import { templateVivaQuestions } from './missions';
import { aiMissionFix, aiVivaAnswers, aiProvider } from './ai';

// Live Round answer key for one submission, for the company: what to paste into each mission so it clears.
// Every code answer is worked out on a scratch copy of the student's own project and re-run against the
// real mission tests and hidden tests (the same checks the Submit button uses) before it is written down.

const ORDER = ['bug-hunt', 'fix-review', 'plot-twist', 'viva'];
const DEMO = path.resolve(ROOT, '..', 'demo-solutions');
const DEMO_LEVEL = { 'fix-review': 'level-2', 'plot-twist': 'level-3' };
const DEMO_SUMMARY = {
  'fix-review': 'Reject the booking with a 400 unless tickets is a whole number from 1 to 10, before the slot is touched.',
  'plot-twist':
    'Read adults and children (old { tickets } requests count as adults). Adults pay ₹100, children ₹50, 10% off for 5 or more people. ' +
    'A booking needs at least 1 adult and at most 10 people; seats booked and freed are adults + children.',
};

// Bonus for the Bug Hunt: a test in the student's own tests/ that fails if the capacity bug comes back.
const LAST_SEATS_TEST = `const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');

// The last seats of a slot must be bookable: 38 booked + 2 more = exactly 40 (DASARA-1000 has 40 seats).
test('the last seats of a slot can be booked, but not one more', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = \`http://127.0.0.1:\${server.address().port}\`;
  const book = (tickets) =>
    fetch(\`\${base}/bookings\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: 'DASARA-1000', visitorName: 'Asha', tickets }),
    });
  try {
    for (const n of [10, 10, 10, 8]) assert.strictEqual((await book(n)).status, 201);
    assert.strictEqual((await book(2)).status, 201);
    assert.strictEqual((await book(1)).status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
`;

const tidy = (text, dir) =>
  String(text || '')
    .split(dir).join('.')
    .split('\n')
    .filter((l) => !/node:internal|processTicksAndRejections/.test(l))
    .join('\n');

async function grade(challenge, def, dir, baseline) {
  const env = { PA_WORKSPACE: dir };
  const mission = await runNodeTests({ cwd: dir, files: [challengeTestPath(challenge.id, def.testFile)], env });
  const core = await runNodeTests({ cwd: dir, files: [challengeTestPath(challenge.id, challenge.hiddenTests)], env });
  const regressions = baseline.filter((name) => !core.tests.find((t) => t.name === name)?.ok);
  return {
    passed: mission.total > 0 && mission.failed === 0 && regressions.length === 0,
    mission: { passed: mission.passed, total: mission.total },
    core: { passed: core.passed, total: core.total },
    regressions,
    output: tidy(mission.output, dir),
  };
}

async function corePassing(challenge, dir) {
  const r = await runNodeTests({ cwd: dir, files: [challengeTestPath(challenge.id, challenge.hiddenTests)], env: { PA_WORKSPACE: dir } });
  return r.tests.filter((t) => t.ok).map((t) => t.name);
}

/** The student's project as it is now (after the missions they already cleared). */
async function projectCopy(sub, dest) {
  for (const dir of [path.join(submissionDir(sub.id), 'current'), path.join(submissionDir(sub.id), 'original')]) {
    if (listFiles(dir).length) {
      copyProject(dir, dest);
      return dir.endsWith('current') ? 'current' : 'original';
    }
  }
  if (sub.sample) throw new Error('This is a sample submission from the demo data: it has no code to build answers from.');
  try {
    await fetchSource(sub.source, dest);
    return 'source';
  } catch (err) {
    throw new Error(`Could not load ${sub.source}: ${err.message}`);
  }
}

function writeFiles(dir, files) {
  for (const f of files) {
    const rel = String(f.path).replace(/^\.?\//, '');
    if (!/^(src|tests|docs)\/[\w\-./]+\.(js|cjs|mjs|json|md)$/.test(rel) || rel.includes('..')) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), f.content);
  }
}

/** Try candidate fixes in order; the first one that passes the real checks wins. */
async function solveMission({ challenge, def, work, scratch, baseline }) {
  const tries = [];
  const attempt = async (label, summary, files) => {
    const cand = path.join(scratch, `try-${def.id}-${tries.length}`);
    copyProject(work, cand);
    writeFiles(cand, files);
    const result = await grade(challenge, def, cand, baseline);
    tries.push({ label, result });
    return result.passed ? { cand, summary, label, result } : null;
  };

  const demoDir = DEMO_LEVEL[def.id] && path.join(DEMO, DEMO_LEVEL[def.id]);
  if (demoDir && fs.existsSync(demoDir)) {
    const files = Object.entries(readFiles(demoDir)).map(([p, content]) => ({ path: p, content }));
    const ok = await attempt('reference solution', DEMO_SUMMARY[def.id], files);
    if (ok) return ok;
  }

  if (aiProvider()) {
    const testSource = fs.readFileSync(challengeTestPath(challenge.id, def.testFile), 'utf8');
    const src = Object.fromEntries(Object.entries(readFiles(work)).filter(([p]) => p.startsWith('src/')));
    let failure = null;
    for (let i = 0; i < 2; i++) {
      const fix = await aiMissionFix({ mission: def, testSource, files: src, failure });
      if (!fix) break;
      const ok = await attempt(`${aiProvider().label} fix`, fix.summary, fix.files.filter((f) => f.path.replace(/^\.?\//, '').startsWith('src/')));
      if (ok) return ok;
      const last = tries[tries.length - 1].result;
      failure = `${last.mission.passed}/${last.mission.total} mission tests passed. Regressions: ${last.regressions.join(', ') || 'none'}\n${last.output}`;
    }
  }
  return { failed: true, tries };
}

function pasteBlock(line, work, changes) {
  for (const c of changes) {
    line();
    if (c.status === 'deleted') {
      line(`▸ DELETE the file ${c.path}`);
      continue;
    }
    line(`▸ ${c.status === 'added' ? 'CREATE' : 'REPLACE'} the whole file: ${c.path}   (+${c.added} −${c.removed} lines)`);
    line('┌' + '─'.repeat(63));
    line(fs.readFileSync(path.join(work, c.path), 'utf8').replace(/\n$/, ''));
    line('└' + '─'.repeat(63));
  }
}

function templateAnswer(q, notes) {
  const about = notes.find((n) => q.about && (q.q.includes(n.title) || n.files.some((f) => q.about.includes(f) || q.q.includes(f)))) || notes[notes.length - 1];
  if (!about) return 'Explain, in your own words, which files you changed, what each change does and why you put it there.';
  return (
    `In ${about.title} I changed ${about.files.join(' and ')}. ${about.summary} ` +
    `I kept the change in ${about.files[0]} because that is where this rule already lives, so the routes stay thin and the other endpoints did not need to change. ` +
    'I ran the mission tests and the old tests after the change, and all of them pass, so nothing that worked before broke.'
  );
}

/**
 * The submission as the company page shows it. Without a shared store (Redis) each server instance keeps its own
 * data, so this instance may not know it: then the record sent by the page is used, but only for code the server
 * can load itself (a GitHub repo or the bundled demo project), never an arbitrary folder.
 */
function submissionFor(db, submissionId, posted) {
  const known = db.submissions.find((s) => s.id === submissionId);
  if (known) return known;
  if (!posted || posted.id !== submissionId || !Array.isArray(posted.missions)) throw new Error('Submission not found');
  const source = String(posted.source || '').trim();
  const demo = path.resolve(ROOT, '..', 'student-project');
  const allowed = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/.test(source) || path.resolve(source) === demo;
  if (!allowed) throw new Error('Submission not found on this server. Connect Upstash Redis in Vercel so every page shares the same data.');
  return {
    id: posted.id,
    studentId: String(posted.studentId || ''),
    challengeId: String(posted.challengeId || ''),
    track: posted.track,
    source: path.resolve(source) === demo ? demo : source,
    sample: !!posted.sample,
    missions: posted.missions.map((m) => ({ id: String(m.id), status: String(m.status), result: m.result || null })),
    comments: Array.isArray(posted.comments) ? posted.comments : [],
    viva: posted.viva && Array.isArray(posted.viva.questions) ? { questions: posted.viva.questions.map((q, i) => ({ id: String(q.id || `q${i + 1}`), q: String(q.q || ''), about: String(q.about || '') })) } : null,
  };
}

export async function liveRoundAnswers(submissionId, posted) {
  const db = readDb();
  const sub = submissionFor(db, submissionId, posted);
  if (!sub.missions?.length) throw new Error('Publish the review first: the Live Round is created when the review is published.');
  const challenge = getChallenge(sub.challengeId);
  if (!challenge) throw new Error('Challenge not found');
  const student = db.students.find((s) => s.id === sub.studentId) || (posted?.studentName ? { name: String(posted.studentName) } : null);

  const out = [];
  const line = (s = '') => out.push(s);
  const rule = () => line('═'.repeat(64));
  line(`${challenge.title} · Live Round answer key · ${student?.name || sub.studentId}`);
  line(`Submission ${sub.id} · ${sub.source}`);
  line(`Made ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. For the company only. Do not share with students.`);
  line('How to use: in each mission, open the file named below, select all, paste the new content, then Run tests and Submit.');

  const scratch = path.join(os.tmpdir(), 'pa-answers', `${sub.id}-${Date.now()}`);
  const work = path.join(scratch, 'work');
  const notes = []; // per mission: what changed, for the viva answers
  const allChanges = [];
  try {
    const track = challenge.track === 'review' || sub.track === 'review' ? 'review' : 'full';
    const from = await projectCopy(sub, work);
    if (from !== 'current' && sub.missions.some((m) => m.status === 'passed' && m.id !== 'viva')) line(`(Built from the ${from === 'original' ? 'submitted' : 'source'} code; the student's latest mission changes were not found on this server.)`);

    for (const id of ORDER) {
      const m = sub.missions.find((x) => x.id === id);
      if (!m) continue;
      const def = challenge.missions.find((x) => x.id === id) || { id, title: id, level: '' };
      line();
      rule();
      line(`LEVEL ${def.level} · ${def.title.toUpperCase()}${def.story?.headline ? ` · ${def.story.headline}` : ''}`);
      rule();
      if (m.status === 'skipped') {
        line('Skipped for this student (nothing to do).');
        continue;
      }
      if (m.status === 'passed' && id !== 'viva') {
        line(`Already cleared${m.result?.durationSec != null ? ` in ${Math.round(m.result.durationSec / 60)} min` : ''}.`);
        if (m.result?.changes?.length) {
          allChanges.push(...m.result.changes);
          notes.push({ id, title: def.title, files: m.result.changes.map((c) => c.path), summary: '' });
        }
        continue;
      }
      if (def.goal) line(`Goal: ${def.goal}`);

      if (id === 'viva') {
        const questions = sub.viva?.questions?.length
          ? sub.viva.questions
          : templateVivaQuestions({ missions: sub.missions.map((x) => ({ ...x, result: x.result || notes.find((n) => n.id === x.id)?.result })) }).map((q, i) => ({ id: `q${i + 1}`, ...q }));
        if (!sub.viva?.questions?.length) line('The real questions appear after the Plot Twist. These are the likely ones, answered from the changes above.');
        if (m.status === 'passed') line('Viva already scored.');
        let source = allChanges.map((c) => c.patch).join('\n');
        if (!source && track === 'review') {
          source = Object.entries(readFiles(work))
            .filter(([p]) => /\.(c|m)?(js|ts)x?$|\.py$|\.md$/.test(p))
            .map(([p, c]) => `=== ${p} ===\n${c}`)
            .join('\n\n');
        }
        const ai = await aiVivaAnswers({ questions, changes: source });
        line(`Answers: ${ai ? `${aiProvider().label} (from the code changes)` : 'template (from the code changes)'}. Paste each one into its box, then Submit.`);
        questions.forEach((q, i) => {
          line();
          line(`Q${i + 1}. ${q.q}`);
          const a = (ai?.find((x) => x.id === q.id)?.answer || ai?.[i]?.answer || templateAnswer(q, notes)).replace(/\*\*|__/g, '');
          line(`Answer: ${a}`);
        });
        continue;
      }

      const baseline = await corePassing(challenge, work);
      if (id === 'bug-hunt') {
        const mutation = findMutation(challenge, work);
        if (!mutation) {
          line('No planted bug fits this code, so the mission tests only need the capacity rule to be right.');
          continue;
        }
        line(`The planted bug: ${mutation.file}, line ${mutation.line}. ${mutation.describe}.`);
        line(`  In the mission it reads:   ${mutation.mutated.trim()}`);
        line(`  Change it back to:         ${mutation.original.trim()}`);
        // Check: the unmutated code passes; the bonus test passes now and fails once the bug is planted.
        const withTest = path.join(scratch, 'bug-hunt');
        copyProject(work, withTest);
        fs.mkdirSync(path.join(withTest, 'tests'), { recursive: true });
        fs.writeFileSync(path.join(withTest, 'tests', 'last-seats.test.js'), LAST_SEATS_TEST);
        const result = await grade(challenge, def, withTest, baseline);
        const probe = path.join(scratch, 'bug-probe');
        copyProject(withTest, probe);
        applyMutation(probe, mutation);
        const blind = await runNodeTests({ cwd: probe, files: studentTestFiles(probe) });
        const own = await runNodeTests({ cwd: withTest, files: [path.join(withTest, 'tests', 'last-seats.test.js')] });
        const bonus = own.failed === 0 && blind.failed > 0;
        line(result.passed ? `✔ VERIFIED: mission tests ${result.mission.passed}/${result.mission.total}, hidden tests ${result.core.passed}/${result.core.total}, no regressions.` : `✘ Could not verify (${result.mission.passed}/${result.mission.total} mission tests). The fix above is still the planted change.`);
        const changes = diffDirs(work, withTest);
        pasteBlock(line, withTest, [{ path: mutation.file, status: 'modified', added: 1, removed: 1 }]);
        if (bonus) {
          line();
          line('Bonus (+100 XP "Blind spot"): also create this test. ✔ It passes now and fails when the bug is planted.');
          pasteBlock(line, withTest, changes.filter((c) => c.path === 'tests/last-seats.test.js'));
          copyProject(withTest, work);
        }
        allChanges.push({ path: mutation.file, patch: `--- a/${mutation.file}\n+++ b/${mutation.file}\n@@ line ${mutation.line} @@\n-${mutation.mutated}\n+${mutation.original}` });
        notes.push({ id, title: def.title, files: [mutation.file], summary: `The capacity check had to allow booked + tickets to reach capacity exactly: ${mutation.original.trim()}.`, result: { mutation } });
        continue;
      }

      const confirmed = (sub.comments || []).filter((c) => c.status === 'confirmed' && c.mission === id && c.severity !== 'good');
      if (id === 'fix-review' && confirmed.length) {
        line('Review findings to fix:');
        confirmed.forEach((c) => line(`  • ${c.file}${c.line ? `:${c.line}` : ''} ${c.title}`));
      }
      const already = await grade(challenge, def, work, baseline);
      if (already.passed) {
        line('✔ The mission tests already pass on this code: just click Submit.');
        continue;
      }
      const solved = await solveMission({ challenge, def, work, scratch, baseline });
      if (solved.failed) {
        line('✘ Could not build a verified answer automatically for this code.');
        solved.tries.forEach((t) => line(`  ${t.label}: ${t.result.mission.passed}/${t.result.mission.total} mission tests, ${t.result.regressions.length} regressions`));
        (def.hints || []).forEach((h, i) => line(`  Hint ${i + 1}: ${h}`));
        line();
        line('The levels after this one build on this fix, so their answers are not listed.');
        break;
      }
      const changes = diffDirs(work, solved.cand);
      line(`What to change (${solved.label}): ${solved.summary}`);
      line(`✔ VERIFIED: mission tests ${solved.result.mission.passed}/${solved.result.mission.total}, hidden tests ${solved.result.core.passed}/${solved.result.core.total}, no regressions. ${changes.filter((c) => c.path.startsWith('src/')).length} source file(s) changed.`);
      pasteBlock(line, solved.cand, changes);
      allChanges.push(...changes);
      notes.push({ id, title: def.title, files: changes.map((c) => c.path), summary: solved.summary, result: { changes } });
      copyProject(solved.cand, work);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  line();
  const name = `${challenge.title}-${student?.name || sub.studentId}-live-round-answers`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return { text: out.join('\n'), filename: `${name}.txt` };
}
