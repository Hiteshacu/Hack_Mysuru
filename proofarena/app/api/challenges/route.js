import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';
import { buildCustomChallenge } from '@/lib/challengeBuilder';

// Saves a company-written challenge to the library.
export const POST = handle(async (request) => {
  const b = await body(request);
  required(b, ['title', 'summary']);
  if (!b.requirements?.filter((r) => r.trim()).length) throw new Error('Add at least one requirement');
  if (!b.skills?.length) throw new Error('Pick at least one skill');
  return updateDb((db) => {
    if (!db.activeCompanyId) throw new Error('Create your company profile first');
    const challenge = buildCustomChallenge(b, db.activeCompanyId, uid('ch'));
    db.customChallenges.push(challenge);
    const company = db.companies.find((c) => c.id === db.activeCompanyId);
    logActivity(db, `${company.name} published a new challenge: ${challenge.title}`, 'company');
    return challenge;
  });
});
