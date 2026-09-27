'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Handshake, Lock, Send, CalendarClock, Crown, ShieldCheck, Sparkles, ArrowRight, MessageCircle, Clock } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, SectionTitle, CompanyLogo, Avatar, inputCls, Empty, cx } from '@/components/ui';
import { Podium, RoadToTop3 } from '@/components/fx';
import { byId, standing, hrsForChallenge, companyResponse, formatHours, TOP_N } from '@/lib/selectors';
import { api, timeAgo } from '@/lib/client';
import { toast } from '@/components/toast';
import { ChatBubbles } from '@/components/chat';

const ME = 'hitesh';

export default function HrConnect() {
  const { state, refresh } = useShared();
  const me = byId(state.students, ME);
  const st = standing(state, ME);
  const hrs = st ? hrsForChallenge(state, st.sub.challengeId) : [];
  const mine = state.connections.filter((c) => c.studentId === ME);
  const unlocked = Boolean(st?.unlocked);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <section className={cx('rounded-3xl p-6 md:p-8 text-white grid gap-6 overflow-hidden relative', unlocked ? 'bg-gradient-to-br from-[#2a1a05] via-[#3b2508] to-[#1a1033]' : 'arena-bg')}>
        {unlocked && <div className="absolute inset-0 shine opacity-20 pointer-events-none" />}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center relative">
          <div className="grid gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
              <Crown className="size-3.5" /> Top {TOP_N} reward
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-extrabold leading-tight">
              {unlocked ? (
                <>
                  You&apos;re <span className="text-amber-300">#{st.rank}</span>. HR Connect is open.
                </>
              ) : (
                'HR Connect'
              )}
            </h1>
            <p className="text-violet-100 max-w-lg">
              The top {TOP_N} on each challenge can request a direct intro with the HR of every company that uses it. Your proof card goes with the request, so HR sees evidence instead of a resume.
            </p>
            <div className="max-w-lg text-ink">
              <RoadToTop3 standing={st} compact />
            </div>
          </div>
          <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-violet-200 text-center">{st?.challenge?.title || 'Challenge'} leaderboard</div>
            {st?.ranking?.length ? <Podium ranking={st.ranking} meId={ME} dark /> : <div className="text-center text-sm text-violet-200 py-10">No reviewed submissions yet</div>}
          </div>
        </div>
      </section>

      {!unlocked && st?.reviewed && <HowToClimb st={st} state={state} />}

      <section className="grid gap-3">
        <SectionTitle eyebrow={st?.challenge ? `Companies hiring with ${st.challenge.title}` : 'Companies'} title="HRs you can reach" />
        {!st && (
          <Card>
            <Empty icon={Handshake} title="Submit a challenge first">Your challenge decides which companies&apos; HRs you can reach.</Empty>
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {hrs.map((h, i) => (
            <HrCard key={h.company.id} h={h} i={i} unlocked={unlocked} st={st} me={me} existing={mine.find((c) => c.companyId === h.company.id && c.status !== 'declined')} state={state} refresh={refresh} />
          ))}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="grid gap-3">
          <SectionTitle eyebrow="Your intros" title="Conversations" />
          {mine.map((c) => (
            <Thread key={c.id} con={c} state={state} refresh={refresh} />
          ))}
        </section>
      )}
    </div>
  );
}

function HowToClimb({ st, state }) {
  const next = st.sub.missions.find((m) => m.status === 'ready');
  const def = next && state.library.find((c) => c.id === st.sub.challengeId)?.missions.find((m) => m.id === next.id);
  const points = { 'bug-hunt': 10, 'fix-review': 10, 'plot-twist': 25, viva: 15 }[next?.id];
  return (
    <Card className="p-5 flex flex-wrap items-center gap-4 ring-2 ring-violet-200">
      <Sparkles className="size-6 text-violet-600" />
      <div className="flex-1 min-w-60">
        <div className="font-semibold">How to climb {st.gap} point{st.gap === 1 ? '' : 's'}</div>
        <div className="text-sm text-slate-600">
          {def ? `Your next level, ${def.title}, is worth up to ${points} points on your Verified Score.` : 'Finish the remaining levels to raise your Verified Score.'} Hints and extra submits cost points, so run tests before you submit.
        </div>
      </div>
      {def && <Button variant="gold" href={st.sub.track === 'review' ? `/student/viva/${st.sub.id}` : `/student/arena/${st.sub.id}`}>Play {def.title} <ArrowRight className="size-4" /></Button>}
    </Card>
  );
}

function HrCard({ h, i, unlocked, st, me, existing, state, refresh }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(h.hr.slots?.[0] || null);
  const top = st ? Object.entries(st.sub.score.skills).sort((a, b) => b[1] - a[1]).slice(0, 2) : [];
  const [message, setMessage] = useState(
    `Hi ${h.hr.name.split(' ')[0]}, I'm ${me.name} from ${me.college}. I'm #${st?.rank} on ${st?.challenge?.title} (score ${st?.sub.score.total}), strongest in ${top.map(([k]) => k).join(' and ')}. I'd love a short chat about ${h.openings[0]?.title || 'your team'}.`,
  );
  const [sending, setSending] = useState(false);
  const resp = companyResponse(state, h.company.id);
  const hrPerson = { name: h.hr.name, initials: h.hr.name.split(' ').map((w) => w[0]).join('').slice(0, 2), color: h.company.color };

  async function send() {
    setSending(true);
    try {
      await api('POST', '/api/connect', { action: 'request', studentId: ME, companyId: h.company.id, message, slot });
      toast(`Intro sent to ${h.hr.name} at ${h.company.name}`);
      setOpen(false);
      refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className={cx('p-5 grid gap-4 relative overflow-hidden fade-up tilt', !unlocked && 'select-none')} style={{ animationDelay: `${i * 90}ms` }}>
      <div className={cx('grid gap-4', !unlocked && 'blur-[3px] opacity-60')}>
        <div className="flex items-center gap-3">
          <CompanyLogo company={h.company} size={44} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-bold truncate">{h.company.name}</div>
            <div className="text-xs text-slate-500">{h.openings.map((o) => o.title).join(' · ')}</div>
          </div>
          {resp.avgTimeToReview != null && <Pill icon={Clock}>Replies ~{formatHours(resp.avgTimeToReview)}</Pill>}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <Avatar person={hrPerson} size={40} />
          <div className="flex-1">
            <div className="font-semibold text-sm">{h.hr.name}</div>
            <div className="text-xs text-slate-500">{h.hr.role} · {h.company.name}</div>
          </div>
          {existing ? (
            <Pill color={existing.status === 'accepted' ? 'green' : 'amber'}>{existing.status === 'accepted' ? 'Connected' : 'Request sent'}</Pill>
          ) : (
            <Button size="sm" variant="gold" icon={Handshake} onClick={() => setOpen(!open)} disabled={!unlocked}>
              Request intro
            </Button>
          )}
        </div>
      </div>

      {!unlocked && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid justify-items-center gap-1 rounded-2xl bg-white/90 px-5 py-3 shadow-lg text-center">
            <Lock className="size-5 text-slate-500" />
            <div className="text-sm font-semibold">Reach the top {TOP_N} to unlock</div>
            {st?.gap > 0 && <div className="text-xs text-slate-500">{st.gap} points to go</div>}
          </div>
        </div>
      )}

      {open && unlocked && (
        <div className="grid gap-3 rounded-2xl ring-2 ring-amber-200 bg-amber-50/40 p-4 fade-up">
          <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div className="grid place-items-center size-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-white font-display font-extrabold">#{st.rank}</div>
            <div className="flex-1 text-sm">
              <div className="font-semibold inline-flex items-center gap-1"><ShieldCheck className="size-4 text-emerald-600" /> Proof card attached</div>
              <div className="text-xs text-slate-500">Score {st.sub.score.total}/100 · {top.map(([k, v]) => `${k} ${v}`).join(' · ')} · {st.sub.score.confidence}% test-backed</div>
            </div>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Your message</span>
            <textarea id={`msg-${h.company.id}`} rows={4} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <div className="grid gap-1.5 text-sm">
            <span className="font-semibold inline-flex items-center gap-1.5"><CalendarClock className="size-4" /> Pick a 15-minute coffee chat</span>
            <div className="flex flex-wrap gap-2">
              {(h.hr.slots || []).map((s) => (
                <button key={s} type="button" onClick={() => setSlot(s)} className={cx('rounded-full px-3 py-1 text-sm ring-1', slot === s ? 'bg-ink text-white ring-ink' : 'bg-white ring-slate-300')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" icon={Send} loading={sending} onClick={send}>Send intro</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Thread({ con, state, refresh }) {
  const company = byId(state.companies, con.companyId);
  const [text, setText] = useState('');
  async function reply(e) {
    e.preventDefault();
    await api('POST', '/api/connect', { action: 'reply', id: con.id, from: 'student', text });
    setText('');
    refresh();
  }
  return (
    <Card className="p-5 grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyLogo company={company} size={36} />
        <div className="flex-1">
          <div className="font-semibold">{company.hr?.name} · {company.name}</div>
          <div className="text-xs text-slate-500">{con.slot ? `Coffee chat requested: ${con.slot}` : 'No time slot picked'} · sent {timeAgo(con.createdAt)}</div>
        </div>
        <Pill color={{ pending: 'amber', accepted: 'green', declined: 'slate' }[con.status]} icon={MessageCircle}>{{ pending: 'Waiting for HR', accepted: 'Connected', declined: 'Declined' }[con.status]}</Pill>
      </div>
      <ChatBubbles con={con} me="student" />
      {con.status !== 'declined' && (
        <form onSubmit={reply} className="flex gap-2">
          <input id={`reply-${con.id}`} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" />
          <Button size="sm" icon={Send} type="submit" disabled={!text.trim()}>Send</Button>
        </form>
      )}
      {con.status === 'pending' && (
        <Link href="/company/connect" className="text-xs font-semibold text-indigo-700">Presenting the demo? Switch to company → HR Connect to accept it</Link>
      )}
    </Card>
  );
}
