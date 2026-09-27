import { handle, body } from '@/lib/api';
import { sessionView, saveFile, runSession, takeHint, submitSession } from '@/lib/missions';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request, { params }) => {
  const { sid } = await params;
  return sessionView(sid);
});

// One endpoint for workspace actions: save, run, hint, submit.
export const POST = handle(async (request, { params }) => {
  const { sid } = await params;
  const b = await body(request);
  switch (b.action) {
    case 'save':
      saveFile(sid, b.path, b.content);
      return { ok: true };
    case 'run':
      return runSession(sid);
    case 'hint':
      return takeHint(sid);
    case 'submit':
      return submitSession(sid);
    default:
      throw new Error('Unknown action');
  }
});
