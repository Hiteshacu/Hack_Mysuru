import { handle, body } from '@/lib/api';
import { updateDb, uid, logActivity } from '@/lib/db';
import { buildState } from '@/lib/state';
import { standing, hrsForChallenge, TOP_N } from '@/lib/selectors';

// HR Connect: the top 3 on a challenge can request an intro with the HR of any company using it.
// action "request" (student), "reply" (either side), "status" (company accepts or declines).
export const POST = handle(async (request) => {
  const b = await body(request);

  if (b.action === 'request') {
    const state = buildState();
    const s = standing(state, b.studentId);
    if (!s?.unlocked) throw new Error(`HR Connect unlocks when you're in the top ${TOP_N} of your challenge.`);
    const target = hrsForChallenge(state, s.sub.challengeId).find((h) => h.company.id === b.companyId);
    if (!target) throw new Error('This company does not use your challenge');
    if (!b.message?.trim() || b.message.trim().split(/\s+/).length < 5) throw new Error('Write a short intro (at least one sentence)');
    return updateDb((db) => {
      if (db.connections.some((c) => c.studentId === b.studentId && c.companyId === b.companyId && c.status !== 'declined')) {
        throw new Error('You already sent this company a request');
      }
      const now = new Date().toISOString();
      const con = {
        id: uid('con'),
        studentId: b.studentId,
        companyId: b.companyId,
        challengeId: s.sub.challengeId,
        status: 'pending',
        slot: b.slot || null,
        proof: { score: s.sub.score.total, rank: s.rank, skills: s.sub.score.skills, submissionId: s.sub.id },
        createdAt: now,
        thread: [{ from: 'student', text: b.message.trim(), at: now }],
      };
      db.connections.unshift(con);
      const student = db.students.find((x) => x.id === b.studentId);
      logActivity(db, `${student.name} (#${s.rank} on ${s.challenge.title}) requested an intro with ${target.company.name}`, student.id);
      return con;
    });
  }

  return updateDb((db) => {
    const con = db.connections.find((c) => c.id === b.id);
    if (!con) throw new Error('Connection not found');
    const now = new Date().toISOString();
    if (b.action === 'reply') {
      if (!b.text?.trim()) throw new Error('Write a message first');
      con.thread.push({ from: b.from === 'company' ? 'company' : 'student', text: b.text.trim(), at: now });
    } else if (b.action === 'status') {
      if (!['accepted', 'declined'].includes(b.status)) throw new Error('Unknown status');
      con.status = b.status;
      const company = db.companies.find((c) => c.id === con.companyId);
      const student = db.students.find((x) => x.id === con.studentId);
      if (b.status === 'accepted') {
        con.thread.push({ from: 'company', text: b.text?.trim() || `Hi ${student.name.split(' ')[0]}, happy to connect!${con.slot ? ` ${con.slot} works for us.` : ''}`, at: now });
      }
      logActivity(db, `${company.name} ${b.status} ${student.name}'s intro request`, 'company');
    } else {
      throw new Error('Unknown action');
    }
    return con;
  });
});
