'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Megaphone, Smartphone, Bell, Send, CheckCircle2, AlertTriangle, Info, Gamepad2, MessageCircle, RefreshCw } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Field, inputCls, Pill, SectionTitle, Avatar, Empty, cx } from '@/components/ui';
import { candidates } from '@/lib/selectors';
import { api, timeAgo } from '@/lib/client';
import { toast } from '@/components/toast';

const STATUS_LABEL = { delivered: 'delivered ✓', sent: 'sent to carrier', queued: 'queued', accepted: 'accepted', undelivered: 'not delivered', failed: 'failed', skipped: 'skipped', simulated: 'simulated' };
const STATUS_COLOR = { delivered: 'green', sent: 'sky', queued: 'sky', accepted: 'sky', undelivered: 'rose', failed: 'rose', read: 'green' };

/** Plain-language fix for the most common Twilio errors. */
function twilioHint(error = '') {
  if (/unverified|21608/i.test(error)) return 'Fix: Twilio console → Phone Numbers → Verified Caller IDs → add this number (trial accounts can only text verified numbers).';
  if (/permission|21408|geo/i.test(error)) return 'Fix: Twilio console → Messaging → Settings → Geo permissions → enable India.';
  if (/not a valid|21211|21614/i.test(error)) return 'Fix: check the number in DEMO_PHONES (10 digits, or +91 followed by 10 digits).';
  if (/From|21606|21659|21212/i.test(error)) return 'Fix: TWILIO_FROM must be your Twilio phone number in +1… form, with SMS enabled.';
  if (/authenticate|20003/i.test(error)) return 'Fix: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are wrong. Re-copy them from the Twilio console and redeploy.';
  return '';
}

export default function NotifyPage() {
  return (
    <Suspense>
      <Notify />
    </Suspense>
  );
}

function Notify() {
  const { state, refresh } = useShared();
  const params = useSearchParams();
  const quests = state.quests.filter((q) => q.companyId === state.activeCompanyId);
  const [questId, setQuestId] = useState(params.get('quest') || quests[0]?.id || '');
  const [audience, setAudience] = useState('top');
  const [top, setTop] = useState(state.students.length);
  const [sms, setSms] = useState(true);
  const [inapp, setInapp] = useState(true);
  const [whatsapp, setWhatsapp] = useState(!!state.whatsappProvider);
  const [checking, setChecking] = useState(null);
  const quest = quests.find((q) => q.id === questId);
  const company = state.activeCompany;
  const [message, setMessage] = useState(
    `Hi {name}, ${company.name} picked you as a top ProofArena student! Our new 3D Quest for ${quest?.title || 'our open role'} is live: quiz, arrow range, debugging and DSA. Finish it to unlock our job links: {link}`,
  );
  const [sending, setSending] = useState(false);

  const ranked = candidates(state).map((c) => c.student);
  const others = state.students.filter((s) => !ranked.some((r) => r.id === s.id));
  const recipients = useMemo(() => (audience === 'all' ? state.students : [...ranked, ...others].slice(0, top)), [audience, top, state.students, ranked, others]);
  const history = state.notifications.filter((n) => n.companyId === company.id);

  async function checkDelivery(id) {
    setChecking(id);
    try {
      await api('POST', '/api/notify', { refresh: id });
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setChecking(null);
    }
  }

  async function send() {
    setSending(true);
    try {
      const channels = [sms && 'sms', whatsapp && state.whatsappProvider && 'whatsapp', inapp && 'inapp'].filter(Boolean);
      const n = await api('POST', '/api/notify', { questId, audience, top, channels, message });
      toast(`Sent to ${n.deliveries.length} students${n.provider === 'simulated' ? ' (SMS simulated)' : ''}`);
      refresh();
    } finally {
      setSending(false);
    }
  }

  if (!quests.length) {
    return (
      <Card className="max-w-3xl">
        <Empty icon={Gamepad2} title="Create a 3D Quest first">Notify others sends an invite to your quest.</Empty>
        <div className="pb-6 grid place-items-center">
          <Button href="/company/quests/new">Create 3D Quest</Button>
        </div>
      </Card>
    );
  }

  const preview = message.replace('{name}', recipients[0]?.name.split(' ')[0] || 'Ananya').replace('{link}', `…/quest?quest=${questId}`);

  return (
    <div className="grid gap-6 max-w-6xl">
      <div>
        <div className="text-sm text-slate-500">Notify others</div>
        <h1 className="font-display text-3xl font-extrabold">Invite top students to your quest</h1>
        <p className="text-slate-600 mt-1 max-w-2xl">Send an SMS and an in-app notification to the best students on ProofArena, ranked by Verified Score.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-6 grid gap-5">
          <Field label="Quest">
            <select id="n-quest" className={inputCls} value={questId} onChange={(e) => setQuestId(e.target.value)}>
              {quests.map((q) => (
                <option key={q.id} value={q.id}>{q.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Who gets it">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold max-w-md">
              {[
                ['top', 'Top students'],
                ['all', 'Everyone'],
              ].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAudience(k)} className={cx('rounded-lg py-1.5', audience === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                  {l}
                </button>
              ))}
            </div>
            {audience === 'top' && (
              <div className="grid gap-1 max-w-md">
                <span className="text-sm">Top <b>{top}</b> by Verified Score</span>
                <input id="n-top" type="range" min={1} max={state.students.length} value={top} onChange={(e) => setTop(Number(e.target.value))} className="accent-indigo-700" />
              </div>
            )}
          </Field>
          <Field label="Channels">
            <div className="flex flex-wrap gap-3">
              <label className={cx('flex items-center gap-2 rounded-xl px-3 py-2 ring-1 cursor-pointer', sms ? 'ring-indigo-400 bg-indigo-50' : 'ring-slate-200')}>
                <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> <Smartphone className="size-4" /> SMS
              </label>
              <label className={cx('flex items-center gap-2 rounded-xl px-3 py-2 ring-1 cursor-pointer', inapp ? 'ring-indigo-400 bg-indigo-50' : 'ring-slate-200')}>
                <input type="checkbox" checked={inapp} onChange={(e) => setInapp(e.target.checked)} /> <Bell className="size-4" /> In-app notification
              </label>
              {state.whatsappProvider ? (
                <label className={cx('flex items-center gap-2 rounded-xl px-3 py-2 ring-1 cursor-pointer', whatsapp ? 'ring-emerald-400 bg-emerald-50' : 'ring-slate-200')}>
                  <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> <MessageCircle className="size-4" /> WhatsApp
                </label>
              ) : (
                <span className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-500 ring-1 ring-dashed ring-slate-200" title="Set TWILIO_WHATSAPP_FROM to enable">
                  <MessageCircle className="size-4" /> WhatsApp (not set up)
                </span>
              )}
            </div>
          </Field>
          <Field label="Message" hint="{name} becomes the student's first name, {link} their personal quest link.">
            <textarea id="n-msg" rows={4} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} />
            <span className={cx('text-xs', message.length > 300 ? 'text-amber-700' : 'text-slate-500')}>{message.length} characters{message.length > 160 ? ` · ${Math.ceil(message.length / 153)} SMS parts` : ''}</span>
          </Field>
          <div className={cx('flex gap-2 rounded-xl p-3 text-sm', state.smsProvider ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
            {state.smsProvider ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" /> : <Info className="size-4 mt-0.5 shrink-0" />}
            {state.smsProvider ? (
              <span>Twilio is connected. Students with a real number (set in <code>DEMO_PHONES</code>) get a real SMS; placeholder demo numbers are skipped.</span>
            ) : (
              <span>
                <b>SMS is simulated.</b> The demo students have placeholder numbers. To send real SMS, add <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> and <code>TWILIO_FROM</code> to <code>.env.local</code>. In-app notifications always work.
              </span>
            )}
          </div>
          <Button size="lg" icon={Send} loading={sending} onClick={send} disabled={!questId || (!sms && !inapp)}>
            Send to {recipients.length} student{recipients.length === 1 ? '' : 's'}
          </Button>
        </Card>

        <div className="grid gap-4 content-start">
          <Card className="p-5 grid gap-3">
            <SectionTitle title="Recipients" />
            {recipients.map((s) => {
              const rank = ranked.findIndex((r) => r.id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <Avatar person={s} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.phone}</div>
                  </div>
                  {rank >= 0 ? <Pill color="amber">#{rank + 1}</Pill> : <Pill>new</Pill>}
                </div>
              );
            })}
          </Card>
          <Card className="p-5 grid gap-2">
            <SectionTitle title="Phone preview" />
            <div className="mx-auto w-60 rounded-[2rem] bg-ink p-3 shadow-xl">
              <div className="rounded-[1.5rem] bg-slate-100 p-3 min-h-40 grid content-start gap-2">
                <div className="text-[10px] text-center text-slate-400">ProofArena · now</div>
                <div className="rounded-2xl rounded-bl-sm bg-white p-3 text-xs text-slate-700 shadow-sm pop-in">{preview}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {history.length > 0 && (
        <section className="grid gap-3">
          <SectionTitle title="Sent" />
          {history.map((n) => (
            <Card key={n.id} className="p-4 grid gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Megaphone className="size-4 text-indigo-600" />
                <b className="flex-1">{state.quests.find((q) => q.id === n.questId)?.title}</b>
                <span className="text-xs text-slate-500">{timeAgo(n.createdAt)}</span>
                {(n.deliveries || []).some((d) => d.smsId || d.whatsappId) && (
                  <button
                    onClick={() => checkDelivery(n.id)}
                    disabled={checking === n.id}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    <RefreshCw className={cx('size-3.5', checking === n.id && 'animate-spin')} /> Check delivery
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(n.deliveries || []).map((d) => (
                  <span key={d.studentId} className="contents">
                    {d.sms && d.sms !== 'off' && (
                      <Pill color={STATUS_COLOR[d.sms] || 'slate'} icon={['failed', 'undelivered'].includes(d.sms) ? AlertTriangle : Smartphone}>
                        {d.name}: SMS {STATUS_LABEL[d.sms] || d.sms}
                        {d.sms !== 'skipped' ? ` · ${d.phone}` : ''}
                      </Pill>
                    )}
                    {d.whatsapp && d.whatsapp !== 'off' && (
                      <Pill color={STATUS_COLOR[d.whatsapp] || 'slate'} icon={MessageCircle}>
                        {d.name}: WhatsApp {STATUS_LABEL[d.whatsapp] || d.whatsapp}
                      </Pill>
                    )}
                  </span>
                ))}
              </div>
              {/* Why a message was refused or not delivered (unverified number, carrier filtering, ...). */}
              {(n.deliveries || []).flatMap((d) =>
                [
                  ['failed', 'undelivered'].includes(d.sms) && { ch: 'SMS', why: d.smsError || d.error, key: d.studentId + 's', d },
                  ['failed', 'undelivered'].includes(d.whatsapp) && { ch: 'WhatsApp', why: d.whatsappError, key: d.studentId + 'w', d },
                ].filter(Boolean),
              ).map(({ ch, why, key, d }) => (
                <div key={key} className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-900">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    <b>{d.name} · {ch} ({d.phone}):</b> {why || 'Twilio could not deliver the message.'} {twilioHint(why)}
                  </span>
                </div>
              ))}
              {(n.deliveries || []).some((d) => ['sent', 'queued', 'accepted'].includes(d.sms)) && (
                <p className="text-xs text-slate-500">
                  &quot;Sent&quot; means Twilio accepted it and passed it to the carrier. Press <b>Check delivery</b> in a minute to see if the phone received it.
                </p>
              )}
            </Card>
          ))}
          <Link href="/student" className="text-sm font-semibold text-violet-700">Switch to student → see the notification</Link>
        </section>
      )}
    </div>
  );
}
