import { readDb, updateDb, uid, logActivity } from './db';
import { publicQuest, BUG_TYPES, bugTypeFor, bugLinesFor } from './quest';
import { runFunctionTests } from './codeRunner';
import { awardXp } from './scoring';

const XP = { mcq: 100, arrow: 200, debug: 250, dsa: 400 };
const NEXT = { mcq: 'arrow', arrow: 'debug', debug: 'dsa', dsa: 'done' };

function findRun(db, questId, studentId) {
  return db.questRuns.find((r) => r.questId === questId && r.studentId === studentId);
}

// Community Camp: the quest's own role first, then every opening on the platform, with apply links and HR emails.
function communityFor(db, quest) {
  const host = db.companies.find((x) => x.id === quest.companyId);
  const own = {
    company: host?.name,
    color: host?.color,
    title: `${quest.title} · this quest`,
    location: host?.city || 'See the job description',
    pay: 'Fast-tracked for quest finishers',
    applyUrl: quest.applyUrl || '',
    hrName: host?.hr?.name || 'Hiring Team',
    hrEmail: host?.hr?.email || '',
  };
  const others = db.openings.map((o) => {
    const c = db.companies.find((x) => x.id === o.companyId);
    return {
      company: c?.name,
      color: c?.color,
      title: o.title,
      location: o.location,
      pay: o.pay,
      applyUrl: o.applyUrl || '',
      hrName: c?.hr?.name || 'Hiring Team',
      hrEmail: c?.hr?.email || '',
    };
  });
  return [own, ...others];
}

function hallFor(db, questId) {
  return db.questRuns
    .filter((r) => r.questId === questId && r.stage === 'done')
    .sort((a, b) => b.points - a.points || a.finishedAt.localeCompare(b.finishedAt))
    .slice(0, 10)
    .map((r) => {
      const s = db.students.find((x) => x.id === r.studentId);
      return { name: s?.name, college: s?.college, points: r.points, color: s?.color };
    });
}

// Everything the 3D world needs for one student.
export function questView(questId, studentId) {
  const db = readDb();
  const quest = db.quests.find((q) => q.id === questId);
  if (!quest) throw new Error('Quest not found');
  const company = db.companies.find((c) => c.id === quest.companyId);
  const run = findRun(db, questId, studentId) || null;
  const student = db.students.find((s) => s.id === studentId);
  return {
    quest: publicQuest(quest, company),
    student: student ? { id: student.id, name: student.name, initials: student.initials, color: student.color, xp: student.xp } : null,
    run,
    hall: hallFor(db, questId),
    recruiters: db.companies.map((c) => ({ name: c.name, color: c.color, openings: db.openings.filter((o) => o.companyId === c.id).map((o) => o.title) })),
    community: run?.stage === 'done' ? communityFor(db, quest) : null,
    // Battle rewards: each outpost guards one hiring-team profile. Locked slots only reveal the company and role;
    // names, emails and LinkedIn links are sent only once the student has unlocked that profile.
    guards: profilesFor(db, quest).map((p, slot) => ({ slot, company: p.company, color: p.color, role: p.role })),
    unlocked: (run?.unlocked || []).map((id) => profilesFor(db, quest).find((p) => p.id === id)).filter(Boolean),
    // Snake Debug (the Debug Den's opening game): the 9 apple labels, and once solved, which lines hold the bug.
    snake: {
      options: BUG_TYPES,
      done: !!run?.snake?.done,
      bugLines: run?.snake?.done ? bugLinesFor(quest.debug) : [],
    },
  };
}

// Everyone a student can unlock in battle: the quest company's HR and team first, then other hiring companies.
export function profilesFor(db, quest) {
  const companies = [...db.companies].sort((a, b) => (a.id === quest.companyId ? -1 : b.id === quest.companyId ? 1 : 0));
  const out = [];
  for (const c of companies) {
    const hiringFor = [...new Set(db.quests.filter((q) => q.companyId === c.id).flatMap((q) => q.skills))].slice(0, 4);
    const base = { companyId: c.id, company: c.name, color: c.color, city: c.city, hiringFor };
    if (c.hr) out.push({ ...base, id: `${c.id}:hr`, name: c.hr.name, role: c.hr.role, email: c.hr.email, linkedin: c.hr.linkedin || '' });
    (c.team || []).forEach((m, i) => out.push({ ...base, id: `${c.id}:team${i}`, name: m.name, role: m.role, email: '', linkedin: m.linkedin || '' }));
  }
  return out;
}

function ensureRun(db, quest, studentId) {
  let run = findRun(db, quest.id, studentId);
  if (!run) {
    run = { id: uid('run'), questId: quest.id, studentId, stage: 'mcq', attempts: {}, points: 0, rifle: false, startedAt: new Date().toISOString(), finishedAt: null, log: [] };
    db.questRuns.push(run);
  }
  return run;
}

function advance(db, run, stage, points, text) {
  run.points += points;
  run.stage = NEXT[stage];
  run.log.push({ stage, at: new Date().toISOString(), points });
  const student = db.students.find((s) => s.id === run.studentId);
  awardXp(student, XP[stage], stage === 'dsa' ? 'quest-champion' : null);
  if (stage === 'arrow') run.rifle = true;
  if (run.stage === 'done') run.finishedAt = new Date().toISOString();
  logActivity(db, `${student.name} ${text}`, student.id);
}

// Grades one stage. Stages must be played in order: mcq → arrow → debug → dsa.
export async function playStage(questId, studentId, action, payload) {
  const db0 = readDb();
  const quest = db0.quests.find((q) => q.id === questId);
  if (!quest) throw new Error('Quest not found');
  const current = findRun(db0, questId, studentId)?.stage || 'mcq';
  if (action === 'community') {
    return updateDb((db) => {
      const run = findRun(db, questId, studentId);
      if (run?.stage !== 'done') throw new Error('Finish all four stages to join the community');
      run.joinedAt ||= new Date().toISOString();
      return { ok: true };
    });
  }
  if (action === 'snake') {
    // The snake ate an apple: is it the right kind of bug? The answer never leaves the server; a correct pick
    // unlocks the Debug Den's editor and reveals which lines hold the bug (the snake circles them).
    if (current !== 'debug') throw new Error(current === 'done' ? 'You already finished this quest' : `Finish the ${current} stage first`);
    const pick = String(payload.pick || '');
    if (!BUG_TYPES.includes(pick)) throw new Error('Unknown apple');
    const correct = pick === bugTypeFor(quest.debug);
    return updateDb((db) => {
      const run = findRun(db, questId, studentId);
      run.snake ||= { done: false, wrong: 0, games: 0 };
      if (payload.newGame) run.snake.games++;
      if (!correct) {
        run.snake.wrong++;
        return { correct: false };
      }
      if (!run.snake.done) {
        run.snake.done = true;
        run.points += Math.max(10, 40 - run.snake.wrong * 5);
      }
      return { correct: true, bugType: pick, bugLines: bugLinesFor(quest.debug) };
    });
  }
  if (action === 'unlock') {
    // Defeating an outpost in battle unlocks the profile it guards. Battle needs the rifle from the Arrow Range.
    return updateDb((db) => {
      const run = findRun(db, questId, studentId);
      if (!run?.rifle) throw new Error('Win the rifle at the Arrow Range first');
      const profile = profilesFor(db, quest)[Number(payload.slot)];
      if (!profile) return { profile: null, bonus: true };
      run.unlocked ||= [];
      const fresh = !run.unlocked.includes(profile.id);
      if (fresh) {
        run.unlocked.push(profile.id);
        run.points += 15;
        const student = db.students.find((s) => s.id === studentId);
        awardXp(student, 25, null);
        logActivity(db, `${student.name} unlocked ${profile.name}'s profile (${profile.company}) in battle`, student.id);
      }
      return { profile, fresh, total: profilesFor(db, quest).length, count: run.unlocked.length };
    });
  }
  if (action !== current) throw new Error(current === 'done' ? 'You already finished this quest' : `Finish the ${current} stage first`);

  if (action === 'mcq') {
    const answers = payload.answers || [];
    const review = quest.mcq.map((m, i) => ({ correct: answers[i] === m.answer, answer: m.answer, explain: m.explain }));
    const correct = review.filter((r) => r.correct).length;
    const passed = correct >= quest.passMark;
    let attempt = 1;
    updateDb((db) => {
      const run = ensureRun(db, quest, studentId);
      attempt = run.attempts.mcq = (run.attempts.mcq || 0) + 1;
      run.mcqScore = correct;
      if (passed) advance(db, run, 'mcq', Math.max(20, correct * 20 - (attempt - 1) * 15), `passed the ${quest.title} gate quiz (${correct}/${quest.mcq.length}, attempt ${attempt})`);
    });
    // Anti-gaming: a failed attempt only learns its score. Answers and explanations are shown once the gate is passed,
    // otherwise a retry could simply copy them.
    return { correct, total: quest.mcq.length, passed, passMark: quest.passMark, attempt, review: passed ? review : null };
  }

  if (action === 'arrow') {
    const picks = payload.picks || [];
    const rounds = quest.arrows.map((a, i) => ({ correct: picks[i] === a.answer, answer: a.answer }));
    const correct = rounds.filter((r) => r.correct).length;
    const passed = correct >= 3;
    const accuracy = Math.max(0, Math.min(100, Number(payload.accuracy) || 0));
    let attempt = 1;
    updateDb((db) => {
      const run = ensureRun(db, quest, studentId);
      attempt = run.attempts.arrow = (run.attempts.arrow || 0) + 1;
      run.arrowScore = { correct, accuracy };
      if (passed) {
        advance(db, run, 'arrow', Math.max(20, correct * 20 + Math.round(accuracy / 5) - (attempt - 1) * 10), `won the Arrow Range (${correct}/5) and earned a rifle`);
        if (correct === 5) awardXp(db.students.find((s) => s.id === studentId), 0, 'sharpshooter');
      }
    });
    return { correct, total: quest.arrows.length, passed, attempt, rounds: passed ? rounds : null };
  }

  if (action === 'debug') {
    const visible = quest.debug.tests;
    const result = await runFunctionTests({ code: payload.code || '', functionName: quest.debug.functionName, tests: [...visible, ...(quest.debug.hidden || [])], visibleCount: visible.length });
    const passed = !result.error && result.passed === result.total;
    result.results = result.results.map((r, i) => (i < visible.length ? r : { ok: r.ok, hidden: true, error: r.ok ? undefined : /Time limit/.test(r.error || '') ? 'Time limit exceeded' : 'Wrong answer' }));
    updateDb((db) => {
      const run = ensureRun(db, quest, studentId);
      run.attempts.debug = (run.attempts.debug || 0) + 1;
      if (passed) advance(db, run, 'debug', Math.max(40, 100 - (run.attempts.debug - 1) * 15), `fixed the bug in the Debug Den`);
    });
    return { ...result, passed };
  }

  if (action === 'dsa' && payload.mode === 'custom') {
    // "Run custom input": the student's code and the reference both run on the student's input,
    // so they see the expected answer without the reference ever leaving the server.
    let args;
    try {
      args = JSON.parse(String(payload.args || ''));
    } catch {
      throw new Error('Custom input must be a JSON array of arguments, e.g. [[2,7,11,15], 9]');
    }
    if (!Array.isArray(args)) throw new Error('Custom input must be a JSON array of arguments, e.g. [[2,7,11,15], 9]');
    if (JSON.stringify(args).length > 5000) throw new Error('Custom input is too large (5,000 characters max)');
    const [mine, ref] = await Promise.all([
      runFunctionTests({ code: payload.code || '', functionName: quest.dsa.functionName, tests: [{ args }] }),
      runFunctionTests({ code: quest.dsa.reference, functionName: quest.dsa.functionName, tests: [{ args }] }),
    ]);
    const expected = ref.error || ref.results[0]?.error ? null : ref.results[0]?.got;
    const got = mine.results[0];
    return {
      mode: 'custom',
      passed: false,
      total: 1,
      error: mine.error,
      logs: mine.logs,
      results: got ? [{ ...got, expected: expected ?? 'not defined for this input', ok: expected !== null && !got.error && got.got === expected, error: got.error === 'Wrong answer' ? undefined : got.error }] : [],
    };
  }

  if (action === 'dsa') {
    const submit = payload.mode === 'submit';
    const tests = submit ? [...quest.dsa.examples, ...quest.dsa.hidden] : quest.dsa.examples;
    const result = await runFunctionTests({ code: payload.code || '', functionName: quest.dsa.functionName, tests, visibleCount: quest.dsa.examples.length });
    const passed = submit && !result.error && result.passed === result.total;
    // Hidden test inputs stay hidden: only report pass/fail for them.
    if (submit) result.results = result.results.map((r, i) => (i < quest.dsa.examples.length ? r : { ok: r.ok, hidden: true, error: r.ok ? undefined : /Time limit/.test(r.error || '') ? 'Time limit exceeded' : 'Wrong answer' }));
    if (submit) {
      updateDb((db) => {
        const run = ensureRun(db, quest, studentId);
        run.attempts.dsa = (run.attempts.dsa || 0) + 1;
        if (passed) advance(db, run, 'dsa', Math.max(60, 150 - (run.attempts.dsa - 1) * 20), `solved ${quest.dsa.title} and finished the ${quest.title} quest`);
      });
    }
    return { ...result, passed, mode: submit ? 'submit' : 'run' };
  }
  throw new Error('Unknown action');
}
