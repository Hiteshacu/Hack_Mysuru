import { handle, body } from '@/lib/api';
import { startSession } from '@/lib/missions';

export const POST = handle(async (request) => {
  const b = await body(request);
  const sessionId = await startSession(b.submissionId, b.missionId);
  return { sessionId };
});
