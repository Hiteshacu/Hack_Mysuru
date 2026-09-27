import path from 'node:path';
import { readDb } from './db';
import { ROOT } from './paths';
import { computeScore, levelFor } from './scoring';
import { listLibrary } from './challenge';
import { aiEnabled, aiProvider } from './ai';
import { smsProvider } from './sms';
import { PIPELINE } from './review';
import { suggestVivaScore } from './missions';

// Everything the UI needs in one response. Small enough for a demo.
export function buildState() {
  const db = readDb();
  const submissions = db.submissions.map((s) => ({
    ...s,
    score: computeScore(s),
    pipelineLabels: PIPELINE,
    viva: s.viva
      ? { ...s.viva, suggested: Object.fromEntries(Object.entries(s.viva.answers || {}).map(([k, a]) => [k, suggestVivaScore(a, s)])) }
      : null,
  }));
  const students = db.students.map((st) => {
    const subs = submissions.filter((s) => s.studentId === st.id && !s.archived && s.status !== 'failed');
    const best = subs.reduce((b, s) => (!b || s.score.total > b.score.total ? s : b), null);
    return { ...st, level: levelFor(st.xp), bestSubmissionId: best?.id || null };
  });
  return {
    ...db,
    sessions: db.sessions.map(({ mutation, baselinePassing, ...rest }) => rest),
    // Quest answers, reference solutions and hidden tests stay on the server (the 3D world gets publicQuest).
    quests: db.quests.map(({ mcq, arrows, debug, dsa, ...rest }) => rest),
    submissions,
    students,
    activeCompany: db.companies.find((c) => c.id === db.activeCompanyId) || null,
    library: listLibrary(),
    aiEnabled: aiEnabled(),
    aiProvider: aiProvider()?.label || null,
    smsProvider: smsProvider(),
    demoProjectPath: path.resolve(ROOT, '..', 'student-project'),
  };
}
