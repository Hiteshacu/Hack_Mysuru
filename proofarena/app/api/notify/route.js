import { handle, body } from '@/lib/api';
import { readDb, updateDb, uid, logActivity } from '@/lib/db';
import { buildState } from '@/lib/state';
import { candidates } from '@/lib/selectors';
import { sendSms, sendWhatsApp, checkMessage, deliveryHint, smsProvider, whatsappProvider, phoneFor, maskPhone, isPlaceholder } from '@/lib/sms';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ask Twilio what happened to each accepted message (delivered / undelivered + reason). */
async function refreshStatuses(deliveries) {
  for (const d of deliveries) {
    for (const ch of ['sms', 'whatsapp']) {
      const id = d[`${ch}Id`];
      if (!id) continue;
      const s = await checkMessage(id);
      if (!s) continue;
      d[ch] = s.status;
      d[`${ch}Code`] = s.errorCode;
      if (s.errorCode) d[`${ch}Error`] = [s.error, deliveryHint(s.errorCode)].filter(Boolean).join(' ');
    }
  }
  return deliveries;
}

// "Notify others": sends a quest invite to top students by SMS / WhatsApp (Twilio, if configured) and in-app.
// POST { questId, audience, top, channels, message }   → send
// POST { refresh: notificationId }                     → re-check Twilio delivery status
export const POST = handle(async (request) => {
  const b = await body(request);

  if (b.refresh) {
    const n0 = readDb().notifications.find((n) => n.id === b.refresh);
    if (!n0) throw new Error('Notification not found');
    const deliveries = await refreshStatuses(structuredClone(n0.deliveries));
    return updateDb((d) => {
      const n = d.notifications.find((x) => x.id === b.refresh);
      if (n) n.deliveries = deliveries;
      return n;
    });
  }

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
    const wa = channels.includes('whatsapp') ? await sendWhatsApp(phone, text) : null;
    deliveries.push({
      studentId: s.id,
      name: s.name,
      phone: isPlaceholder(phone) ? phone : maskPhone(phone),
      rank: ranked.indexOf(id) + 1 || null,
      sms: sms?.status || 'off',
      smsId: sms?.id,
      error: sms?.error,
      whatsapp: wa?.status || 'off',
      whatsappId: wa?.id,
      whatsappError: wa?.error,
      text,
    });
  }
  // "sent" only means Twilio accepted it; wait a moment and record what the carrier did.
  if (deliveries.some((d) => d.smsId || d.whatsappId)) {
    await wait(4000);
    await refreshStatuses(deliveries);
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
      provider: channels.includes('sms') || channels.includes('whatsapp') ? smsProvider() || 'simulated' : null,
      whatsapp: whatsappProvider(),
      deliveries,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    d.notifications.unshift(n);
    logActivity(d, `${company?.name} notified ${deliveries.length} top students about ${quest.title}`, 'company');
    return n;
  });
});
