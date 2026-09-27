import { handle, body } from '@/lib/api';
import { readDb, updateDb, uid, logActivity } from '@/lib/db';
import { buildState } from '@/lib/state';
import { candidates } from '@/lib/selectors';
import { sendSms, checkMessage, deliveryHint, smsProvider, phoneFor, maskPhone, isPlaceholder } from '@/lib/sms';

// "Notify others": sends a quest invite to top students by SMS (Twilio, if configured) and in-app.
export const POST = handle(async (request) => {
  const b = await body(request);
  const db = readDb();
  const quest = db.quests.find((q) => q.id === b.questId);
  if (!quest) throw new Error('Pick a quest to announce');
  if (!b.message?.includes('{link}')) throw new Error('Keep the {link} placeholder in the message');
  const state = buildState();
  const ranked = candidates(state).map((c) => c.student.id);
  const everyone = db.students.map((s) => s.id);
  const others = everyone.filter((id) => !ranked.includes(id));
  const ids = b.audience === 'all' ? everyone : [...ranked, ...others].slice(0, Math.max(1, Number(b.top) || 3));
  const origin = request.nextUrl.origin;
  const channels = Array.isArray(b.channels) && b.channels.length ? b.channels : ['inapp'];

  const deliveries = [];
  for (const id of ids) {
    const s = db.students.find((x) => x.id === id);
    const link = `${origin}/quest/index.html?quest=${quest.id}&student=${s.id}`;
    const text = b.message.replace('{name}', s.name.split(' ')[0]).replace('{link}', link);
    const phone = phoneFor(s);
    const sms = channels.includes('sms') ? await sendSms(phone, text) : null;
    deliveries.push({ studentId: s.id, name: s.name, phone: isPlaceholder(phone) ? phone : maskPhone(phone), rank: ranked.indexOf(id) + 1 || null, sms: sms?.status || 'off', smsId: sms?.id, error: sms?.error, text });
  }
  // Twilio "accepted" isn't "delivered": wait a moment, then record what the carrier did.
  if (deliveries.some((d) => d.smsId)) {
    await new Promise((r) => setTimeout(r, 4000));
    for (const d of deliveries) {
      const s = d.smsId ? await checkMessage(d.smsId) : null;
      if (!s) continue;
      d.sms = s.status;
      if (s.errorCode) d.error = [s.error, deliveryHint(s.errorCode)].filter(Boolean).join(' ');
    }
  }

  return updateDb((d) => {
    const company = d.companies.find((c) => c.id === quest.companyId);
    const n = {
      id: uid('ntf'),
      questId: quest.id,
      companyId: quest.companyId,
      company: company?.name,
      title: `${company?.name} invited you to a 3D Quest: ${quest.title}`,
      channels,
      provider: channels.includes('sms') ? smsProvider() || 'simulated' : null,
      deliveries,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    d.notifications.unshift(n);
    logActivity(d, `${company?.name} notified ${deliveries.length} top students about ${quest.title}`, 'company');
    return n;
  });
});
