import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readDb, updateDb, logActivity, uid } from './db';
import { submissionDir } from './paths';
import { getChallenge, challengeTestPath } from './challenge';
import { runNodeTests } from './runner';
import { fetchSource, copyProject, readFiles, listFiles, countLines, isPlatformFile } from './workspace';
import { checkClaims, checkDocs, ruleComments } from './reviewRules';
import { aiReview, aiProvider } from './ai';
import { awardXp } from './scoring';

export const PIPELINE = [
  { key: 'fetch', label: 'Fetch code and freeze the commit' },
  { key: 'structure', label: 'Check the project contract' },
  { key: 'hidden', label: 'Run the hidden tests' },
  { key: 'own', label: "Run the student's own tests" },
  { key: 'docs', label: 'Check docs and README claims' },
  { key: 'mutation', label: 'Mutation probe: test the tests' },
  { key: 'ai', label: 'AI reviewer drafts comments' },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function patchSub(id, fn) {
  updateDb((db) => {
    const sub = db.submissions.find((s) => s.id === id);
    if (sub) fn(sub, db);
  });
}

async function step(id, key, fn) {
  patchSub(id, (s) => {
    s.pipeline.find((p) => p.key === key).status = 'running';
  });
  const t0 = Date.now();
  const detail = await fn();
  await wait(Math.max(0, 700 - (Date.now() - t0)));
  patchSub(id, (s) => {
    Object.assign(s.pipeline.find((p) => p.key === key), { status: 'done', detail });
  });
}

export function studentTestFiles(dir) {
  return listFiles(dir)
    .filter((p) => p.startsWith('tests/') && /\.test\.(c|m)?js$/.test(p) && !isPlatformFile(p))
    .map((p) => path.join(dir, p));
}

function exportsCreateServer(dir) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['-e', "const m=require('./src/server.js');process.exit(typeof m.createServer==='function'?0:1)"],
      { cwd: dir, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } },
    );
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

// Applies the first challenge mutation that matches the student's source code.
export function findMutation(challenge, dir) {
  const sources = listFiles(dir).filter((p) => /\.(c|m)?js$/.test(p) && !/^(tests?|node_modules|\.)/.test(p) && !/\.(test|spec|config)\./.test(p));
  sources.sort((a, b) => (b.startsWith('src/') ? 1 : 0) - (a.startsWith('src/') ? 1 : 0));
  for (const m of challenge.mutations || []) {
    const re = new RegExp(m.find);
    for (const rel of sources) {
      const content = fs.readFileSync(path.join(dir, rel), 'utf8');
      const lines = content.split('\n');
      const idx = lines.findIndex((l) => re.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
      if (idx === -1) continue;
      const mutatedLine = lines[idx].replace(re, m.replace);
      return { id: m.id, describe: m.describe, file: rel, line: idx + 1, original: lines[idx], mutated: mutatedLine };
    }
  }
  return null;
}

export function applyMutation(dir, mutation) {
  const file = path.join(dir, mutation.file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l === mutation.original);
  if (idx === -1) return false;
  lines[idx] = mutation.mutated;
  fs.writeFileSync(file, lines.join('\n'));
  return true;
}

export async function runReviewPipeline(id) {
  const sub = readDb().submissions.find((s) => s.id === id);
  const challenge = getChallenge(sub.challengeId);
  const base = submissionDir(id);
  const original = path.join(base, 'original');
  const current = path.join(base, 'current');
  const checks = {};

  try {
    await step(id, 'fetch', async () => {
      const r = await fetchSource(sub.source, original);
      copyProject(original, current);
      patchSub(id, (s) => Object.assign(s, { commit: r.commit, sourceKind: r.kind }));
      return `${r.kind === 'github' ? 'Cloned from GitHub' : 'Copied from local folder'} · commit ${r.commit}`;
    });

    const reviewTrack = challenge.track === 'review';

    await step(id, 'structure', async () => {
      const all = listFiles(original);
      if (reviewTrack) {
        const code = all.filter((p) => /\.(c|m)?(js|ts)x?$|\.py$/.test(p) && !p.startsWith('tests/'));
        checks.structure = { ok: code.length > 0, files: all.length, lines: countLines(original, '') };
        if (!code.length) throw new Error('No source code found in the project folder.');
        return `${all.length} files · ${code.length} source files · review track (company challenge)`;
      }
      const ok = await exportsCreateServer(original);
      checks.structure = { ok, files: all.length, lines: countLines(original) };
      if (!ok) throw new Error('src/server.js must export createServer(). See the challenge contract.');
      return `${checks.structure.files} files · ${checks.structure.lines} lines of source · contract OK`;
    });

    await step(id, 'hidden', async () => {
      if (reviewTrack) {
        checks.hiddenTests = null;
        return 'Skipped: company-written challenge, no hidden tests yet (review track)';
      }
      const r = await runNodeTests({ cwd: original, files: [challengeTestPath(challenge.id, challenge.hiddenTests)], env: { PA_WORKSPACE: original } });
      checks.hiddenTests = { passed: r.passed, total: r.total, tests: r.tests.map(({ name, ok }) => ({ name, ok })) };
      return `${r.passed}/${r.total} passed`;
    });

    await step(id, 'own', async () => {
      const r = await runNodeTests({ cwd: original, files: studentTestFiles(original) });
      checks.studentTests = { passed: r.passed, total: r.total };
      return r.total ? `${r.passed}/${r.total} of their tests pass` : 'No tests found in tests/';
    });

    let files;
    await step(id, 'docs', async () => {
      files = readFiles(original);
      checks.docs = checkDocs(files);
      checks.claims = checkClaims(files);
      const present = Object.values(checks.docs).filter(Boolean).length;
      const bad = checks.claims.filter((c) => !c.verified).length;
      return `${present}/4 docs present · ${checks.claims.length} claims checked${bad ? ` · ${bad} not backed by code` : ''}`;
    });

    await step(id, 'mutation', async () => {
      const mutation = findMutation(challenge, original);
      if (!mutation) {
        checks.mutation = null;
        return 'No matching mutation for this code';
      }
      const mutantDir = path.join(base, 'mutant');
      copyProject(original, mutantDir);
      applyMutation(mutantDir, mutation);
      const r = await runNodeTests({ cwd: mutantDir, files: studentTestFiles(mutantDir) });
      fs.rmSync(mutantDir, { recursive: true, force: true });
      checks.mutation = { ...mutation, survived: r.total > 0 && r.failed === 0 };
      return checks.mutation.survived
        ? `Planted bug in ${mutation.file}:${mutation.line} was NOT caught by their tests`
        : `Their tests caught the planted bug in ${mutation.file}`;
    });

    await step(id, 'ai', async () => {
      const rules = ruleComments(files, checks);
      const provider = aiProvider();
      const ai = await aiReview({ challenge, files, checks, ruleComments: rules });
      const comments = [
        ...rules.map((c) => ({ ...c, source: 'rules' })),
        ...(ai?.comments || []).filter((c) => files[c.file]).map((c) => ({ ...c, source: provider.id })),
      ].map((c) => ({ id: uid('c'), status: 'draft', ...c }));
      const hidden = checks.hiddenTests;
      const counts = `${comments.filter((c) => c.severity === 'good').length} strengths and ${comments.filter((c) => c.severity !== 'good').length} issues found for the reviewer to confirm.`;
      const summary =
        ai?.summary ||
        (hidden ? `${hidden.passed} of ${hidden.total} hidden tests pass. ${counts}` : `${checks.studentTests.passed} of ${checks.studentTests.total} of their own tests pass. ${counts}`);
      const engine = ai ? `${provider.label} + rules` : 'Rule engine';
      patchSub(id, (s) => Object.assign(s, { comments, aiSummary: summary, aiEngine: engine }));
      return `${comments.length} draft comments (${ai ? engine : provider ? `rules; ${provider.label} unavailable, see server log` : 'rule engine'})`;
    });

    updateDb((db) => {
      const s = db.submissions.find((x) => x.id === id);
      s.checks = checks;
      s.status = 'awaiting_review';
      s.checkedAt = new Date().toISOString();
      const student = db.students.find((x) => x.id === s.studentId);
      awardXp(student, 100, 'first-submit');
      const result = checks.hiddenTests ? `${checks.hiddenTests.passed}/${checks.hiddenTests.total} hidden tests pass` : `${checks.studentTests.passed}/${checks.studentTests.total} own tests pass`;
      logActivity(db, `${student.name} submitted ${challenge.title}: ${result}`, student.id);
    });
  } catch (err) {
    patchSub(id, (s) => {
      const running = s.pipeline.find((p) => p.status === 'running');
      if (running) Object.assign(running, { status: 'failed', detail: err.message });
      s.status = 'failed';
      s.error = err.message;
    });
  }
}
