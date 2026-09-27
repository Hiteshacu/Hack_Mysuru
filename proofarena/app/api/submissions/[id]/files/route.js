import { handle } from '@/lib/api';
import { readDb } from '@/lib/db';
import { readFiles } from '@/lib/workspace';
import { ensureSubmissionFiles } from '@/lib/restore';

// Files of the submission as it was frozen (what the reviewer reviews).
export const GET = handle(async (request, { params }) => {
  const { id } = await params;
  const sub = readDb().submissions.find((s) => s.id === id);
  if (!sub) throw new Error('Submission not found');
  if (sub.files) return { files: sub.files };
  const { original } = await ensureSubmissionFiles(sub);
  return { files: readFiles(original) };
});
