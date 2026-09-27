import { handle, body } from '@/lib/api';
import { updateDb } from '@/lib/db';

// Marks a student's in-app notifications as read.
export const POST = handle(async (request) => {
  const b = await body(request);
  return updateDb((db) => {
    for (const n of db.notifications) {
      if ((!b.id || n.id === b.id) && n.deliveries.some((d) => d.studentId === b.studentId) && !n.readBy.includes(b.studentId)) n.readBy.push(b.studentId);
    }
    return { ok: true };
  });
});
