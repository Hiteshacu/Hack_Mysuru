import { handle, body } from '@/lib/api';
import { generateQuestContent } from '@/lib/quest';

// Company preview: AI (Groq) writes MCQs, arrow rounds, a debugging task and a DSA task from the skills.
export const POST = handle(async (request) => {
  const b = await body(request);
  if (!b.title?.trim()) throw new Error('Give the quest a role title');
  if (!b.skills?.length) throw new Error('Pick at least one skill');
  return generateQuestContent({ title: b.title.trim(), jobDescription: (b.jobDescription || '').trim(), skills: b.skills });
});
