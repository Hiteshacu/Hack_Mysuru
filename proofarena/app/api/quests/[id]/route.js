import { handle, body } from '@/lib/api';
import { questView, playStage } from '@/lib/questRun';
import { updateDb, logActivity } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET ?student=hitesh → quest (no answers), the student's progress, hall of champions, community links.
export const GET = handle(async (request, { params }) => {
  const { id } = await params;
  const student = request.nextUrl.searchParams.get('student') || 'hitesh';
  return questView(id, student);
});

// DELETE → company resets everyone's progress on this quest (so the demo can be played again).
export const DELETE = handle(async (request, { params }) => {
  const { id } = await params;
  return updateDb((db) => {
    const quest = db.quests.find((q) => q.id === id);
    if (!quest) throw new Error('Quest not found');
    if (quest.companyId !== db.activeCompanyId) throw new Error('Only the company that made this quest can reset it');
    const before = db.questRuns.length;
    db.questRuns = db.questRuns.filter((r) => r.questId !== id);
    logActivity(db, `Progress on the ${quest.title} quest was reset`, 'company');
    return { removed: before - db.questRuns.length };
  });
});

// POST { studentId, action: "mcq" | "arrow" | "debug" | "dsa" | "community", ... }
export const POST = handle(async (request, { params }) => {
  const { id } = await params;
  const b = await body(request);
  return playStage(id, b.studentId || 'hitesh', b.action, b);
});
