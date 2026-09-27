import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';

// POST without id: company sends an invite. POST with id + status: student or company moves it along.
export const POST = handle(async (request) => {
  const b = await body(request);
  return updateDb((db) => {
    if (b.id) {
      const inv = db.invites.find((i) => i.id === b.id);
      if (!inv) throw new Error('Invite not found');
      inv.status = b.status;
      const student = db.students.find((s) => s.id === inv.studentId);
      const company = db.companies.find((c) => c.id === inv.companyId);
      const text = {
        accepted: `${student.name} accepted ${company.name}'s interview invite`,
        declined: `${student.name} declined ${company.name}'s invite`,
        interview: `${company.name} scheduled an interview with ${student.name}`,
        offer: `${company.name} made an offer to ${student.name}`,
      }[b.status];
      if (text) logActivity(db, text, 'company');
      return inv;
    }
    required(b, ['studentId', 'openingId']);
    if (!db.activeCompanyId) throw new Error('Create your company profile first');
    const dupe = db.invites.find((i) => i.studentId === b.studentId && i.openingId === b.openingId);
    if (dupe) throw new Error('You already invited this candidate for this opening');
    const inv = {
      id: uid('inv'),
      companyId: db.activeCompanyId,
      openingId: b.openingId,
      studentId: b.studentId,
      status: 'invited',
      message: (b.message || '').trim(),
      createdAt: new Date().toISOString(),
    };
    db.invites.unshift(inv);
    const student = db.students.find((s) => s.id === b.studentId);
    const company = db.companies.find((c) => c.id === db.activeCompanyId);
    logActivity(db, `${company.name} invited ${student.name} to interview`, 'company');
    return inv;
  });
});
