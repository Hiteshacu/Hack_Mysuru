import path from 'node:path';
import { handle } from '@/lib/api';
import { readFiles } from '@/lib/workspace';
import { submissionDir } from '@/lib/paths';

// Files of the submission as it was frozen (what the reviewer reviews).
export const GET = handle(async (request, { params }) => {
  const { id } = await params;
  return { files: readFiles(path.join(submissionDir(id), 'original')) };
});
