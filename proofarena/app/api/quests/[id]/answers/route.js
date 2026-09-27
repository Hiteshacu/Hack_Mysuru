import { syncDb, readDb } from '@/lib/db';
import { bugTypeFor, bugLinesFor } from '@/lib/quest';

export const dynamic = 'force-dynamic';

const LETTERS = 'ABCD';
const show = (v) => JSON.stringify(v);
const call = (fn, c) => `${fn}(${(c.args || []).map(show).join(', ')}) → ${show(c.expected)}`;

/** Every answer of one quest (gate quiz, arrow range, snake, debug fix, DSA solution) as a readable text file. */
function answerSheet(quest, company) {
  const out = [];
  const line = (s = '') => out.push(s);
  const rule = () => line('─'.repeat(64));

  line(`${quest.title} · 3D Quest answer key`);
  line(`${company?.name || ''} · generated ${new Date(quest.createdAt || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  line(`Skills: ${(quest.skills || []).join(', ')}`);
  line(`Content: ${Object.entries(quest.source || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  line('For the company only. Do not share with students.');

  line();
  rule();
  line(`STAGE 1 · GATE QUIZ (pass mark ${quest.passMark}/5)`);
  rule();
  (quest.mcq || []).forEach((m, i) => {
    line();
    line(`Q${i + 1}. ${m.q}`);
    m.options.forEach((o, j) => line(`   ${LETTERS[j]}) ${o}${j === m.answer ? '   ✔' : ''}`));
    line(`   Answer: ${LETTERS[m.answer]}) ${m.options[m.answer]}`);
    if (m.explain) line(`   Why: ${m.explain}`);
  });

  line();
  rule();
  line('STAGE 2 · ARROW RANGE (shoot the target with the right answer)');
  rule();
  (quest.arrows || []).forEach((a, i) => {
    line();
    line(`Round ${i + 1}. ${a.prompt}`);
    line(`   Targets: ${a.choices.join(' | ')}`);
    line(`   Shoot: ${a.choices[a.answer]}`);
  });

  const d = quest.debug;
  if (d) {
    line();
    rule();
    line('STAGE 3a · SNAKE DEBUG (eat the apple that names the bug)');
    rule();
    line();
    line(`Eat: ${bugTypeFor(d)}`);
    line(`The bug is on line ${bugLinesFor(d).join(', ')} of the buggy code.`);

    line();
    rule();
    line(`STAGE 3b · DEBUG DEN · ${d.title}`);
    rule();
    line();
    if (d.story) line(d.story);
    line();
    line('Buggy code:');
    line(d.buggyCode);
    line();
    line('Fixed code (answer):');
    line(d.reference);
    line();
    line('Tests:');
    (d.tests || []).forEach((c) => line(`   ${call(d.functionName, c)}`));
    (d.hidden || []).forEach((c) => line(`   ${call(d.functionName, c)}   (hidden)`));
  }

  const s = quest.dsa;
  if (s) {
    line();
    rule();
    line(`STAGE 4 · ALGORITHM GROVE · ${s.title}`);
    rule();
    line();
    if (s.statement) line(s.statement);
    line();
    line('Solution (answer):');
    line(s.reference);
    line();
    line('Tests:');
    (s.examples || []).forEach((c) => line(`   ${call(s.functionName, c)}`));
    (s.hidden || []).forEach((c) => line(`   ${call(s.functionName, c)}   (hidden)`));
  }
  line();
  return out.join('\n');
}

// GET → downloads the quest's full answer key. Only the company that made the quest can download it.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    await syncDb();
    const db = readDb();
    const quest = db.quests.find((q) => q.id === id);
    if (!quest) throw new Error('Quest not found');
    if (quest.companyId !== db.activeCompanyId) throw new Error('Only the company that made this quest can download its answers');
    const company = db.companies.find((c) => c.id === quest.companyId);
    const name = `${quest.title}-answers`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return new Response(answerSheet(quest, company), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.txt"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[answers]', err);
    return Response.json({ error: err.message }, { status: 400 });
  }
}
