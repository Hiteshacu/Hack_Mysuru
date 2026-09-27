import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';
import { getChallenge } from '@/lib/challenge';

export const POST = handle(async (request) => {
  const b = await body(request);
  required(b, ['title', 'type', 'location', 'challengeId']);
  if (!getChallenge(b.challengeId)) throw new Error('Pick a live challenge from the library');
  return updateDb((db) => {
    if (!db.activeCompanyId) throw new Error('Create your company profile first');
    const opening = {
      id: uid('op'),
      companyId: db.activeCompanyId,
      title: b.title.trim(),
      type: b.type,
      location: b.location.trim(),
      pay: (b.pay || '').trim(),
      seats: Number(b.seats) || 1,
      skills: (b.skills || []).filter(Boolean),
      challengeId: b.challengeId,
      minScore: Number(b.minScore) || 60,
      description: (b.description || '').trim(),
      applyUrl: (b.applyUrl || '').trim(),
      deadline: b.deadline || '',
      createdAt: new Date().toISOString(),
    };
    db.openings.unshift(opening);
    const company = db.companies.find((c) => c.id === db.activeCompanyId);
    logActivity(db, `${company.name} posted "${opening.title}" using the ${getChallenge(b.challengeId).title} challenge`, 'company');
    return opening;
  });
});
