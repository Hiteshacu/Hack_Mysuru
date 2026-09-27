// Plays one Live Round mission for Hitesh's current submission, using the answers in ../demo-solutions.
// Handy for rehearsals or if you run short of time on stage.
// Usage: node scripts/autoplay.mjs bug-hunt | fix-review | plot-twist
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const SOLUTIONS = path.resolve(import.meta.dirname, '..', '..', 'demo-solutions');
const missionId = process.argv[2];

async function call(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

const EDITS = {
  'bug-hunt': (files) => {
    const f = files.find((x) => x.path === 'src/services/bookingService.js');
    return { [f.path]: f.content.replace('>= slot.capacity', '> slot.capacity') };
  },
  'fix-review': () => ({ 'src/services/bookingService.js': fs.readFileSync(path.join(SOLUTIONS, 'level-2/src/services/bookingService.js'), 'utf8') }),
  'plot-twist': () => ({
    'src/services/bookingService.js': fs.readFileSync(path.join(SOLUTIONS, 'level-3/src/services/bookingService.js'), 'utf8'),
    'src/services/pricing.js': fs.readFileSync(path.join(SOLUTIONS, 'level-3/src/services/pricing.js'), 'utf8'),
  }),
};

if (!EDITS[missionId]) {
  console.log('Usage: node scripts/autoplay.mjs bug-hunt | fix-review | plot-twist');
  process.exit(1);
}
const state = await call('GET', '/api/state');
const sub = state.submissions.filter((s) => s.studentId === 'hitesh').at(-1);
const { sessionId } = await call('POST', '/api/arena/start', { submissionId: sub.id, missionId });
const view = await call('GET', `/api/arena/${sessionId}`);
for (const [p, content] of Object.entries(EDITS[missionId](view.files))) {
  await call('POST', `/api/arena/${sessionId}`, { action: 'save', path: p, content });
}
await call('POST', `/api/arena/${sessionId}`, { action: 'run' });
const r = await call('POST', `/api/arena/${sessionId}`, { action: 'submit' });
console.log(r.passed ? `✔ ${missionId} cleared: +${r.xp.total} XP, ${r.srcFilesChanged} source file(s) changed` : `✖ not passed: ${JSON.stringify(r.missionTests.tests.filter((t) => !t.ok))}`);
