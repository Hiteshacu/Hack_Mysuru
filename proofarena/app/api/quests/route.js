import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';

// Publishes a 3D Quest created in the company dashboard.
export const POST = handle(async (request) => {
  const b = await body(request);
  required(b, ['title']);
  const c = b.content;
  if (!c?.mcq?.length || !c?.arrows?.length || !c?.debug || !c?.dsa) throw new Error('Generate the quest content first');
  return updateDb((db) => {
    if (!db.activeCompanyId) throw new Error('Create your company profile first');
    const quest = {
      id: uid('quest'),
      companyId: db.activeCompanyId,
      title: b.title.trim(),
      jobDescription: (b.jobDescription || '').trim(),
      skills: b.skills || [],
      passMark: Math.min(5, Math.max(1, Number(b.passMark) || 3)),
      applyUrl: /^https?:\/\//i.test(b.applyUrl || '') ? b.applyUrl.trim() : '',
      mcq: c.mcq,
      arrows: c.arrows,
      debug: c.debug,
      dsa: c.dsa,
      source: c.source || {},
      createdAt: new Date().toISOString(),
    };
    db.quests.unshift(quest);
    const company = db.companies.find((x) => x.id === db.activeCompanyId);
    logActivity(db, `${company.name} launched a 3D Quest: ${quest.title}`, 'company');
    return quest;
  });
});
