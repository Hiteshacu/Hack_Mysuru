'use client';

import Link from 'next/link';
import { Briefcase, ClipboardCheck, Users, Send, Plus, CheckCircle2, Circle, ArrowRight, Activity } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Stat, Button, SectionTitle, Avatar, Pill, Empty } from '@/components/ui';
import { pendingReviews, candidates, byId, isRising, companyResponse, formatHours } from '@/lib/selectors';
import { timeAgo } from '@/lib/client';

export default function CompanyOverview() {
  const { state } = useShared();
  const company = state.activeCompany;
  const myOpenings = state.openings.filter((o) => o.companyId === company.id);
  const reviews = pendingReviews(state);
  const pool = candidates(state);
  const invites = state.invites.filter((i) => i.companyId === company.id);
  const response = companyResponse(state, company.id);

  const steps = [
    { done: true, label: 'Create your company profile' },
    { done: myOpenings.length > 0, label: 'Post an opening and pick a challenge', href: '/company/openings' },
    { done: state.submissions.some((s) => !s.sample), label: 'Students submit projects' },
    { done: state.submissions.some((s) => !s.sample && s.reviewedAt), label: 'Confirm the AI review and publish it', href: '/company/reviews' },
    { done: invites.length > 0, label: 'Invite a verified candidate', href: '/company/candidates' },
  ];

  return (
    <div className="grid gap-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Company dashboard</div>
          <h1 className="font-display text-3xl font-extrabold">Welcome, {company.name}</h1>
        </div>
        <Button href="/company/openings?new=1" icon={Plus}>
          Post an opening
        </Button>
      </div>

      {steps.some((s) => !s.done) && (
        <Card className="p-5">
          <SectionTitle eyebrow="Getting started" title="Your hiring loop" />
          <ol className="mt-4 grid gap-2 md:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s.label} className={`rounded-xl p-3 text-sm flex gap-2 items-start ${s.done ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-600'}`}>
                {s.done ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" /> : <Circle className="size-4 mt-0.5 shrink-0" />}
                <span>
                  <b className="tabular">{i + 1}.</b> {s.href && !s.done ? <Link className="underline underline-offset-2" href={s.href}>{s.label}</Link> : s.label}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Open roles" value={myOpenings.length} icon={Briefcase} tone="indigo" />
        <Stat label="To review" value={reviews.length} icon={ClipboardCheck} tone="amber" hint="Submissions and vivas" />
        <Stat label="Verified pool" value={pool.length} icon={Users} tone="green" hint="Students with reviewed proof" />
        <Stat label="Invites sent" value={invites.length} icon={Send} />
      </div>

      <Card className="p-5 grid gap-4">
        <SectionTitle eyebrow="Program health" title="How fast you respond" action={<span className="text-xs text-slate-500">Students see these numbers on your challenge page</span>} />
        <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Response efficiency</div>
            <div className="font-display text-3xl font-extrabold tabular">{response.efficiency != null ? `${response.efficiency}%` : '–'}</div>
            <div className="text-xs text-slate-500">Reviews published within 48 h</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg time to review</div>
            <div className="font-display text-3xl font-extrabold tabular">{formatHours(response.avgTimeToReview)}</div>
            <div className="text-xs text-slate-500">{response.reviewed} reviewed · {response.pending} waiting</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg time to score viva</div>
            <div className="font-display text-3xl font-extrabold tabular">{formatHours(response.avgTimeToViva)}</div>
            <div className="text-xs text-slate-500">After the student answers</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirmed findings by priority (all students)</div>
            {[
              ['high', 'P2 · High', 'bg-rose-500'],
              ['medium', 'P3 · Medium', 'bg-amber-500'],
              ['low', 'P4 · Low', 'bg-sky-500'],
              ['good', 'Strengths', 'bg-emerald-500'],
            ].map(([k, label, color]) => {
              const max = Math.max(1, ...Object.values(response.findings));
              return (
                <div key={k} className="grid grid-cols-[90px_1fr_24px] items-center gap-2 text-xs">
                  <span>{label}</span>
                  <div className="h-2 rounded-full bg-white overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${(response.findings[k] / max) * 100}%` }} /></div>
                  <span className="tabular text-right font-semibold">{response.findings[k]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <SectionTitle title="Needs your review" action={<Link href="/company/reviews" className="text-sm font-semibold text-brand">All reviews →</Link>} />
          <div className="mt-3 divide-y divide-slate-100">
            {reviews.length === 0 && <Empty icon={ClipboardCheck} title="Nothing to review">When a student submits, the platform runs the checks and drafts a review for you here.</Empty>}
            {reviews.map((s) => {
              const st = byId(state.students, s.studentId);
              const viva = s.status !== 'awaiting_review';
              return (
                <Link key={s.id} href={`/company/reviews/${s.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50 -mx-2 px-2 rounded-xl">
                  <Avatar person={st} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{st.name}</div>
                    <div className="text-xs text-slate-500">{viva ? 'Viva answers ready to score' : `${s.checks.hiddenTests ? `${s.checks.hiddenTests.passed}/${s.checks.hiddenTests.total} hidden tests` : `${s.checks.studentTests?.passed ?? 0}/${s.checks.studentTests?.total ?? 0} own tests`} · ${s.comments.length} AI draft comments`}</div>
                  </div>
                  <Pill color={viva ? 'violet' : 'amber'}>{viva ? 'Score viva' : 'Review code'}</Pill>
                  <ArrowRight className="size-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Top verified candidates" action={<Link href="/company/candidates" className="text-sm font-semibold text-brand">Search →</Link>} />
          <div className="mt-3 grid gap-2">
            {pool.slice(0, 4).map((c) => (
              <Link key={c.student.id} href={`/company/candidates/${c.student.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
                <Avatar person={c.student} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{c.student.name}</div>
                  <div className="text-xs text-slate-500">{c.student.college}</div>
                </div>
                {isRising(c) ? <Pill color="sky">Rising</Pill> : null}
                <div className="font-display text-xl font-extrabold tabular w-10 text-right">{c.sub.score.total}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Live activity" />
        <ul className="mt-3 grid gap-2">
          {state.activity.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-sm">
              <Activity className="size-4 text-slate-400 shrink-0" />
              <span className="flex-1">{a.text}</span>
              <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(a.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
