import { after } from 'next/server';
import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity, inBackground } from '@/lib/db';
import { runReviewPipeline, PIPELINE } from '@/lib/review';
import { getChallenge } from '@/lib/challenge';

// Creates a submission and starts the Phase 1 checks in the background.
// retake: true archives the student's earlier attempt at the same challenge and starts fresh.
export const POST = handle(async (request) => {
  const b = await body(request);
  required(b, ['studentId', 'openingId', 'source']);
  const sub = updateDb((db) => {
    const opening = db.openings.find((o) => o.id === b.openingId);
    if (!opening) throw new Error('Opening not found');
    const challenge = getChallenge(opening.challengeId);
    if (!challenge) throw new Error('This opening has no challenge');
    const previous = db.submissions.filter((s) => s.studentId === b.studentId && s.challengeId === opening.challengeId && !s.archived && s.status !== 'failed');
    if (previous.length && !b.retake) {
      throw new Error(`You already have a ${challenge.title} submission. One proof counts for every company. Choose "Retake" to start again.`);
    }
    for (const p of previous) p.archived = true;
    for (const f of db.submissions.filter((s) => s.studentId === b.studentId && s.status === 'failed')) f.archived = true;
    const s = {
      id: uid('sub'),
      studentId: b.studentId,
      challengeId: opening.challengeId,
      openingId: opening.id,
      track: challenge.track || 'full',
      attempt: previous.length + 1,
      source: b.source.trim(),
      sourceKind: null,
      commit: null,
      deployUrl: (b.deployUrl || '').trim(),
      createdAt: new Date().toISOString(),
      status: 'checking',
      pipeline: PIPELINE.map((p) => ({ key: p.key, status: 'pending' })),
      checks: {},
      comments: [],
      aiSummary: '',
      rubric: null,
      reviewedAt: null,
      missions: [],
      viva: null,
    };
    db.submissions.push(s);
    const student = db.students.find((x) => x.id === b.studentId);
    logActivity(db, `${student.name} ${previous.length ? 'retook' : 'submitted'} ${challenge.title}`, student.id);
    return s;
  });
  after(() => inBackground(() => runReviewPipeline(sub.id)));
  return sub;
});
