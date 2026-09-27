import { handle, body } from '@/lib/api';
import { submitViva, scoreViva } from '@/lib/missions';

// action "answer" comes from the student, action "score" from the company reviewer.
export const POST = handle(async (request, { params }) => {
  const { id } = await params;
  const b = await body(request);
  if (b.action === 'answer') {
    const answers = b.answers || {};
    if (Object.values(answers).some((a) => !a || a.trim().split(/\s+/).length < 5)) {
      throw new Error('Answer every question in at least one full sentence');
    }
    submitViva(id, answers);
  } else if (b.action === 'score') {
    const scores = b.scores || {};
    if (!Object.keys(scores).length || Object.values(scores).some((v) => typeof v !== 'number')) {
      throw new Error('Score every answer from 1 to 5');
    }
    scoreViva(id, scores);
  } else {
    throw new Error('Unknown action');
  }
  return { ok: true };
});
