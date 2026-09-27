'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Handshake, Check, X, Send, CalendarClock, ShieldCheck, Crown, Inbox } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, SectionTitle, Avatar, inputCls, Empty, cx } from '@/components/ui';
import { ChatBubbles } from '@/components/chat';
import { byId, challengeRanking, TOP_N } from '@/lib/selectors';
import { api, timeAgo } from '@/lib/client';
import { toast } from '@/components/toast';

const MEDAL = ['from-amber-300 to-amber-500', 'from-slate-200 to-slate-400', 'from-orange-300 to-orange-500'];

export default function CompanyConnect() {
  const { state, refresh } = useShared();
  const company = state.activeCompany;
  const inbox = state.connections.filter((c) => c.companyId === company.id);
  const pending = inbox.filter((c) => c.status === 'pending');
  const challengeIds = [...new Set(state.openings.filter((o) => o.companyId === company.id).map((o) => o.challengeId))];

  return (
    <div className="grid gap-6 max-w-6xl">
      <div>
        <div className="text-sm text-slate-500">HR Connect</div>
        <h1 className="font-display text-3xl font-extrabold">Top {TOP_N} intros</h1>
        <p className="text-slate-600 mt-1 max-w-2xl">
          Students who reach the top {TOP_N} on a challenge you use can ask for a direct intro with {company.hr?.name || 'your HR'}. Each request comes with their proof card, so you see evidence first.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 content-start">
          {inbox.length === 0 && (
            <Card>
              <Empty icon={Inbox} title="No intro requests yet">When a student climbs into the top {TOP_N} on your challenge, their request lands here.</Empty>
            </Card>
          )}
          {pending.length > 0 && <SectionTitle eyebrow={`${pending.length} waiting`} title="New requests" />}
          {[...pending, ...inbox.filter((c) => c.status !== 'pending')].map((c) => (
            <Request key={c.id} con={c} state={state} refresh={refresh} />
          ))}
        </div>

        <div className="grid gap-4 content-start">
          {challengeIds.map((id) => {
            const ch = state.library.find((c) => c.id === id);
            const top = challengeRanking(state, id).slice(0, TOP_N);
            return (
              <Card key={id} className="p-5 grid gap-3">
                <SectionTitle eyebrow="Current top 3" title={ch?.title} />
                {top.length === 0 && <div className="text-sm text-slate-500">No reviewed submissions yet.</div>}
                {top.map((r, i) => (
                  <Link key={r.sub.id} href={`/company/candidates/${r.student.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
                    <div className={cx('grid place-items-center size-8 rounded-lg bg-gradient-to-br text-white text-sm font-extrabold', MEDAL[i])}>{r.rank}</div>
                    <Avatar person={r.student} size={30} />
                    <span className="flex-1 text-sm font-semibold">{r.student.name}</span>
                    <span className="font-display font-extrabold tabular">{r.sub.score.total}</span>
                  </Link>
                ))}
              </Card>
            );
          })}
          <Card className="p-5 text-sm text-slate-600 grid gap-2">
            <b className="text-ink">Why only the top {TOP_N}?</b>
            Your HR gets a short list of people who proved it, instead of hundreds of cold messages. Students get a real reason to climb, and the ranking comes from tests and reviewers, not likes.
          </Card>
        </div>
      </div>
    </div>
  );
}

function Request({ con, state, refresh }) {
  const student = byId(state.students, con.studentId);
  const ch = state.library.find((c) => c.id === con.challengeId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const skills = Object.entries(con.proof?.skills || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);

  async function status(s) {
    setBusy(s);
    try {
      await api('POST', '/api/connect', { action: 'status', id: con.id, status: s, text });
      toast(s === 'accepted' ? `Connected with ${student.name}` : 'Request declined');
      setText('');
      refresh();
    } finally {
      setBusy(null);
    }
  }
  async function reply(e) {
    e.preventDefault();
    await api('POST', '/api/connect', { action: 'reply', id: con.id, from: 'company', text });
    setText('');
    refresh();
  }

  return (
    <Card className={cx('p-5 grid gap-4 fade-up', con.status === 'pending' && 'ring-2 ring-amber-200')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Avatar person={student} size={48} />
          <span className={cx('absolute -bottom-1 -right-1 grid place-items-center size-6 rounded-full bg-gradient-to-br text-[11px] font-extrabold text-white ring-2 ring-white', MEDAL[(con.proof?.rank || 3) - 1] || MEDAL[2])}>
            {con.proof?.rank}
          </span>
        </div>
        <div className="flex-1 min-w-48">
          <div className="font-semibold">{student.name} <span className="text-slate-400 font-normal">· {student.college}</span></div>
          <div className="text-xs text-slate-500">#{con.proof?.rank} on {ch?.title} · requested {timeAgo(con.createdAt)}</div>
        </div>
        <Pill color={{ pending: 'amber', accepted: 'green', declined: 'slate' }[con.status]}>{{ pending: 'New', accepted: 'Connected', declined: 'Declined' }[con.status]}</Pill>
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr] items-center rounded-2xl bg-slate-50 p-3">
        <div className="grid place-items-center size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white">
          <div className="font-display text-xl font-extrabold leading-none">{con.proof?.score}</div>
          <div className="text-[9px] font-bold uppercase">score</div>
        </div>
        <div className="grid gap-1.5">
          <div className="text-xs font-semibold inline-flex items-center gap-1"><ShieldCheck className="size-3.5 text-emerald-600" /> Proof card</div>
          <div className="flex flex-wrap gap-1.5">
            {skills.map(([k, v]) => (
              <Pill key={k} color="indigo">{k} {v}</Pill>
            ))}
            <Link href={`/company/candidates/${student.id}`} className="text-xs font-semibold text-brand self-center">Open full dossier →</Link>
          </div>
        </div>
      </div>

      {con.slot && (
        <div className="inline-flex items-center gap-2 text-sm text-slate-600">
          <CalendarClock className="size-4" /> Asked for a 15-minute chat: <b>{con.slot}</b>
        </div>
      )}

      <ChatBubbles con={con} me="company" />

      {con.status === 'pending' ? (
        <div className="grid gap-2">
          <input id={`acc-${con.id}`} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Optional note, e.g. "${con.slot || 'Monday'} works, see you then!"`} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" icon={X} loading={busy === 'declined'} onClick={() => status('declined')}>Decline</Button>
            <Button size="sm" variant="success" icon={Check} loading={busy === 'accepted'} onClick={() => status('accepted')}>Accept intro</Button>
          </div>
        </div>
      ) : con.status === 'accepted' ? (
        <form onSubmit={reply} className="flex gap-2">
          <input id={`crep-${con.id}`} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply…" />
          <Button size="sm" icon={Send} type="submit" disabled={!text.trim()}>Send</Button>
        </form>
      ) : null}
      {con.status === 'accepted' && !con.sample && (
        <Link href="/student/connect" className="text-xs font-semibold text-violet-700">Switch to student → see the reply</Link>
      )}
    </Card>
  );
}
