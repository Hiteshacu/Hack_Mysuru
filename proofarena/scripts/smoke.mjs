// End-to-end rehearsal of the whole demo through the API.
// Usage: npm run dev (in another terminal), then: node scripts/smoke.mjs
// It RESETS the demo data first.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOLUTIONS = path.join(ROOT, 'demo-solutions');

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${json.error}`);
  return json;
}
const state = () => call('GET', '/api/state');
const hitesh = async () => (await state()).submissions.find((s) => s.studentId === 'hitesh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (msg) => console.log(`  ✔ ${msg}`);

async function playMission(subId, missionId, edit) {
  const { sessionId } = await call('POST', '/api/arena/start', { submissionId: subId, missionId });
  const view = await call('GET', `/api/arena/${sessionId}`);
  const before = await call('POST', `/api/arena/${sessionId}`, { action: 'run' });
  ok(`${missionId}: mission tests before fix ${before.mission.passed}/${before.mission.total}`);
  for (const [p, content] of Object.entries(edit(view.files))) {
    await call('POST', `/api/arena/${sessionId}`, { action: 'save', path: p, content });
  }
  const result = await call('POST', `/api/arena/${sessionId}`, { action: 'submit' });
  if (!result.passed) throw new Error(`${missionId} failed: ${JSON.stringify({ tests: result.missionTests, regressions: result.regressions })}`);
  ok(`${missionId}: passed, ${result.srcFilesChanged} source file(s) changed, +${result.xp.total} XP`);
}

console.log('Resetting demo…');
await call('POST', '/api/reset');
await call('POST', '/api/company', { name: 'Kaveri Softworks', city: 'Mysuru', industry: 'SaaS', size: '51–200', hrName: 'Priya Nair', hrRole: 'Talent Acquisition Lead' });
const opening = await call('POST', '/api/openings', { title: 'Backend Intern', type: 'Internship', location: 'Mysuru', challengeId: 'palace-pass', skills: ['Node.js'] });
ok('company + opening created');

await call('POST', '/api/submissions', { studentId: 'hitesh', openingId: opening.id, source: path.join(ROOT, 'student-project') });
let sub;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  sub = await hitesh();
  if (sub.status !== 'checking') break;
}
if (sub.status !== 'awaiting_review') throw new Error(`Review pipeline: ${sub.status} ${sub.error || ''}`);
ok(`phase 1: ${sub.checks.hiddenTests.passed}/${sub.checks.hiddenTests.total} hidden tests, ${sub.comments.length} draft comments`);

for (const c of sub.comments) {
  await call('POST', `/api/submissions/${sub.id}/review`, { action: 'comment', commentId: c.id, status: 'confirmed' });
}
await call('POST', `/api/submissions/${sub.id}/review`, { action: 'publish', rubric: { design: 8, code: 7, testing: 6, docs: 8 } });
ok('review published');

await playMission(sub.id, 'bug-hunt', (files) => {
  const f = files.find((x) => x.path === 'src/services/bookingService.js');
  return { [f.path]: f.content.replace('>= slot.capacity', '> slot.capacity') };
});
const read = (p) => fs.readFileSync(path.join(SOLUTIONS, p), 'utf8');
await playMission(sub.id, 'fix-review', () => ({
  'src/services/bookingService.js': read('level-2/src/services/bookingService.js'),
}));
await playMission(sub.id, 'plot-twist', () => ({
  'src/services/bookingService.js': read('level-3/src/services/bookingService.js'),
  'src/services/pricing.js': read('level-3/src/services/pricing.js'),
}));

sub = await hitesh();
const answers = Object.fromEntries(sub.viva.questions.map((q) => [q.id, 'I changed calculatePrice in pricing.js to take adults and children, then bookingService counts people for capacity.']));
await call('POST', `/api/viva/${sub.id}`, { action: 'answer', answers });
await call('POST', `/api/viva/${sub.id}`, { action: 'score', scores: Object.fromEntries(sub.viva.questions.map((q) => [q.id, 4])) });
sub = await hitesh();
ok(`viva scored. Verified score ${sub.score.total}/100, confidence ${sub.score.confidence}%`);
console.log('\nAll good. Reset the demo from the home page before presenting.');
