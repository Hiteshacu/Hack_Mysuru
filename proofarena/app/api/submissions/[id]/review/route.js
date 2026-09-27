import { handle, body } from '@/lib/api';
import { updateDb, uid, inBackground } from '@/lib/db';
import { after } from 'next/server';
import { publishReview, prepareCodeViva } from '@/lib/missions';

// Company reviewer actions: confirm/reject AI comments, add comments, publish the review.
export const POST = handle(async (request, { params }) => {
  const { id } = await params;
  const b = await body(request);
  return updateDb((db) => {
    const sub = db.submissions.find((s) => s.id === id);
    if (!sub) throw new Error('Submission not found');
    if (b.action === 'comment') {
      const c = sub.comments.find((x) => x.id === b.commentId);
      c.status = b.status;
    } else if (b.action === 'add') {
      if (!b.title?.trim()) throw new Error('Give the comment a title');
      sub.comments.push({
        id: uid('c'),
        file: b.file,
        line: Number(b.line) || 1,
        severity: b.severity || 'medium',
        category: b.category || 'Reviewer',
        title: b.title.trim(),
        body: (b.body || '').trim(),
        source: 'reviewer',
        status: 'confirmed',
      });
    } else if (b.action === 'publish') {
      const r = b.rubric || {};
      const rubric = { design: r.design, code: r.code, testing: r.testing, docs: r.docs };
      if (Object.values(rubric).some((v) => typeof v !== 'number')) throw new Error('Score all four rubric items');
      if (sub.comments.some((c) => c.status === 'draft')) throw new Error('Confirm or reject every AI draft comment first');
      publishReview(db, sub, { rubric, note: b.note });
      if (sub.track === 'review') after(() => inBackground(() => prepareCodeViva(sub.id)));
    } else {
      throw new Error('Unknown action');
    }
    return { ok: true };
  });
});
