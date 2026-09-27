import { handle, body, required } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';

// Only real LinkedIn profile or company links are kept (they become buttons students click).
const linkedinUrl = (u) => (/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[\w\-%.]+\/?$/i.test(String(u || '').trim()) ? String(u).trim() : '');

// Creates the signed-in company's profile, or updates it.
export const POST = handle(async (request) => {
  const b = await body(request);
  required(b, ['name', 'city', 'industry']);
  const fields = {
    name: b.name.trim(),
    city: b.city.trim(),
    industry: b.industry.trim(),
    size: b.size || '1–50',
    website: (b.website || '').trim(),
    about: (b.about || '').trim(),
    color: b.color || '#4F46E5',
    hr: {
      name: (b.hrName || '').trim() || 'Hiring Team',
      role: (b.hrRole || '').trim() || 'Talent Acquisition',
      email: (b.hrEmail || '').trim() || `careers@${(b.website || 'company.example').replace(/^https?:\/\//, '').split('/')[0]}`,
      linkedin: linkedinUrl(b.hrLinkedin),
      slots: ['Mon 5:00 PM', 'Wed 11:00 AM', 'Fri 3:30 PM'],
    },
    // "Name · Role · LinkedIn URL", one per line: unlockable profile cards in the 3D Quest battle.
    team: String(b.team || '')
      .split('\n')
      .map((line) => line.split(/\s*[·|]\s*/).map((s) => s.trim()))
      .filter(([name]) => name)
      .slice(0, 8)
      .map(([name, role, url]) => ({ name, role: role || 'Engineer', linkedin: linkedinUrl(url) })),
  };
  return updateDb((db) => {
    let company = db.companies.find((c) => c.id === db.activeCompanyId);
    if (company) {
      Object.assign(company, fields);
    } else {
      company = { id: uid('co'), ...fields, createdAt: new Date().toISOString() };
      db.companies.push(company);
      db.activeCompanyId = company.id;
      logActivity(db, `${company.name} joined ProofArena`, 'company');
    }
    return company;
  });
});
