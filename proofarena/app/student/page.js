'use client';

import Link from 'next/link';
import { Check, Lock, Crown, ArrowRight, Mail, Activity, Sparkles, Handshake, Shield, Target } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, SectionTitle, BadgeIcon, Avatar, CompanyLogo, Pill, cx } from '@/components/ui';
import { journey, byId, standing, TOP_N } from '@/lib/selectors';
import { BADGES } from '@/lib/scoring';
import { api, timeAgo } from '@/lib/client';
import { toast } from '@/components/toast';
import { CompanyTurn } from '@/components/demo-hint';
import { CountUp, Podium, RoadToTop3, LeagueBoard } from '@/components/fx';

const ME = 'hitesh';

export default function StudentHome() {
  const { state, refresh } = useShared();
  const me = byId(state.students, ME);
  const { steps, current, next, sub } = journey(state, ME);
  const st = standing(state, ME);
  const invites = state.invites.filter((i) => i.studentId === ME);
  const connections = state.connections.filter((c) => c.studentId === ME);
  const r = 34;
  const circ = 2 * Math.PI * r;

  async function answer(inv, status) {
    await api('POST', '/api/invites', { id: inv.id, status });
    toast(status === 'accepted' ? 'Invite accepted. The company will schedule your interview.' : 'Invite declined');
    refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <section className="arena-bg rounded-3xl p-6 md:p-8 text-white grid gap-6 overflow-hidden relative">
        <div className="absolute -right-20 -top-20 size-72 rounded-full bg-violet-500/20 blur-3xl float" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-5 relative">
          <div className="relative">
            <svg width="84" height="84" className="-rotate-90" aria-hidden="true">
              <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
              <circle cx="42" cy="42" r={r} fill="none" stroke="url(#lvl)" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - me.level.progress)} style={{ transition: 'stroke-dashoffset 1s ease' }} />
              <defs>
                <linearGradient id="lvl" x1="0" x2="1">
                  <stop offset="0" stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#fcd34d" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <Avatar person={me} size={60} />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 text-amber-950 text-[10px] font-extrabold px-2 py-0.5">LV {me.level.number}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-violet-200 text-sm">{me.college} · {me.year}</div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold">Hi {me.name}, let&apos;s prove it.</h1>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1 font-semibold"><Sparkles className="inline size-3.5 text-amber-300" /> {me.level.name}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 font-semibold"><CountUp value={me.xp} /> XP{me.level.next ? ` · ${me.level.next.min - me.xp} to ${me.level.next.name}` : ''}</span>
              {st?.reviewed && (
                <span className={cx('rounded-full px-3 py-1 font-bold', st.unlocked ? 'bg-amber-300 text-amber-950' : 'bg-white/10')}>
                  <Target className="inline size-3.5" /> #{st.rank} of {st.total} on {st.challenge?.title}
                </span>
              )}
            </div>
          </div>
        </div>

        <ol className="flex items-center gap-1 overflow-x-auto pb-2 relative" aria-label="Your journey">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1 shrink-0 fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="grid justify-items-center gap-1.5 w-[84px]">
                <div
                  className={cx(
                    'grid place-items-center rounded-full font-bold text-sm transition',
                    s.boss ? 'size-12' : 'size-10',
                    s.done ? 'bg-emerald-400 text-emerald-950' : i === current ? 'bg-amber-300 text-amber-950 pulse-ring' : 'bg-white/10 text-white/50',
                  )}
                >
                  {s.done ? <Check className="size-5" /> : s.boss ? <Crown className="size-5" /> : i === current ? i + 1 : <Lock className="size-4" />}
                </div>
                <span className={cx('text-[11px] text-center leading-tight', i === current ? 'text-amber-200 font-semibold' : 'text-violet-200')}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={cx('h-0.5 w-4 rounded mb-5', s.done ? 'bg-emerald-400' : 'bg-white/15')} />}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-5 flex flex-wrap items-center gap-4 relative">
          <div className="flex-1 min-w-60">
            <div className="text-xs uppercase tracking-widest text-amber-200 font-semibold">Next step</div>
            <div className="font-display text-2xl font-bold">{next.title}</div>
            <p className="text-violet-100 text-sm mt-1 max-w-xl">{next.body}</p>
          </div>
          <Button variant="gold" size="lg" href={next.href} className="glow">
            {next.cta} <ArrowRight className="size-4" />
          </Button>
        </div>
        {sub?.status === 'awaiting_review' && (
          <CompanyTurn dark href={`/company/reviews/${sub.id}`} title="Company's turn." body="Open the review as the company, confirm the comments and publish to unlock the Live Round." />
        )}
        {sub?.viva?.submittedAt && !sub.viva.scoredAt && (
          <CompanyTurn dark href={`/company/reviews/${sub.id}`} title="Company's turn." body="Score the viva answers as the company to finish verification." />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid gap-6 content-start">
          <Card className={cx('p-5 grid gap-4 overflow-hidden', st?.unlocked && 'ring-2 ring-amber-300')}>
            <SectionTitle
              eyebrow={`Top ${TOP_N} reward`}
              title={<span className="inline-flex items-center gap-2"><Handshake className="size-5 text-amber-500" />Race to HR Connect</span>}
              action={<Link href="/student/connect" className="text-sm font-semibold text-brand">{st?.unlocked ? 'Open HR Connect →' : 'What is this? →'}</Link>}
            />
            <p className="text-sm text-slate-600 -mt-2">
              After your code review is published you join the challenge leaderboard. Reach the top {TOP_N} and you can message the HR of every company using the challenge.
            </p>
            {st?.ranking?.length > 0 && <Podium ranking={st.ranking} meId={ME} />}
            <RoadToTop3 standing={st} />
            {connections.length > 0 && (
              <div className="text-sm text-slate-600">
                {connections.length} intro request{connections.length > 1 ? 's' : ''} ·{' '}
                {connections.filter((c) => c.status === 'accepted').length} connected ·{' '}
                <Link href="/student/connect" className="font-semibold text-brand">open chats</Link>
              </div>
            )}
          </Card>

          {invites.length > 0 && (
            <Card className="p-5 grid gap-3 ring-2 ring-emerald-200 fade-up">
              <SectionTitle title={<span className="inline-flex items-center gap-2"><Mail className="size-5 text-emerald-600" />Interview invites</span>} />
              {invites.map((inv) => {
                const co = byId(state.companies, inv.companyId);
                const op = byId(state.openings, inv.openingId);
                return (
                  <div key={inv.id} className="rounded-xl bg-emerald-50 p-4 grid gap-2">
                    <div className="flex items-center gap-3">
                      <CompanyLogo company={co} size={40} />
                      <div className="flex-1">
                        <div className="font-semibold">{co.name}</div>
                        <div className="text-sm text-slate-600">{op?.title} · {op?.pay}</div>
                      </div>
                      <Pill color={inv.status === 'invited' ? 'amber' : 'green'}>{inv.status}</Pill>
                    </div>
                    {inv.message && <p className="text-sm text-slate-700 italic">“{inv.message}”</p>}
                    {inv.status === 'invited' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="success" onClick={() => answer(inv, 'accepted')}>Accept</Button>
                        <Button size="sm" variant="ghost" onClick={() => answer(inv, 'declined')}>Decline</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}

          <Card className="p-5 grid gap-4">
            <SectionTitle title="Badges" action={<span className="text-sm text-slate-500">{me.badges.length}/{Object.keys(BADGES).length} earned</span>} />
            <div className="flex flex-wrap gap-2">
              {Object.entries(BADGES).map(([id, b], i) => (
                <div key={id} className={cx('fade-up', me.badges.includes(id) && 'hover:scale-110 transition')} style={{ animationDelay: `${i * 50}ms` }}>
                  <BadgeIcon badge={b} earned={me.badges.includes(id)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">XP, leagues and badges are for fun. Companies rank you by your Verified Score, which comes from tests and reviewers.</p>
          </Card>
        </div>

        <div className="grid gap-6 content-start">
          <Card className="p-5">
            <LeagueBoard students={state.students} meId={ME} />
          </Card>
          <Card className="p-5 grid gap-3">
            <SectionTitle title={<span className="inline-flex items-center gap-2"><Activity className="size-5 text-violet-500" />Hacktivity</span>} />
            <ul className="grid gap-2">
              {state.activity.slice(0, 7).map((a, i) => (
                <li key={a.id} className="flex gap-2 text-sm fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="mt-1.5 size-1.5 rounded-full bg-violet-400 shrink-0" />
                  <span className="flex-1">{a.text}</span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
