'use client';

import { useParams } from 'next/navigation';
import { Swords, Hourglass, ArrowRight, UserRound, Mic, Check, FileSearch, Bot, Send, Trophy, MessageSquareText, Archive } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, SectionTitle, Loading, Pill, Bar, CompanyLogo, cx } from '@/components/ui';
import { PipelineProgress } from '@/components/pipeline';
import { CompanyTurn } from '@/components/demo-hint';
import { ChecksSummary } from '@/components/checks';
import { InlineComment } from '@/components/code-viewer';
import { byId, reportId, reportState, REPORT_STATES, PRIORITY, missionDef } from '@/lib/selectors';
import { timeAgo } from '@/lib/client';

const RUBRIC_LABELS = { design: 'Design', code: 'Code quality', testing: 'Testing', docs: 'Docs & decisions' };

export default function SubmissionPage() {
  const { id } = useParams();
  const { state } = useShared();
  const sub = byId(state.submissions, id);
  if (!sub) return <Loading />;
  const opening = byId(state.openings, sub.openingId);
  const co = opening && byId(state.companies, opening.companyId);
  const ch = state.library.find((c) => c.id === sub.challengeId);
  const reviewed = Boolean(sub.reviewedAt);
  const reviewTrack = sub.track === 'review';
  const stateKey = reportState(sub);
  const stateIndex = REPORT_STATES.findIndex((s) => s.key === stateKey);
  const confirmed = sub.comments.filter((c) => c.status === 'confirmed');
  const counts = { high: 0, medium: 0, low: 0, good: 0 };
  for (const c of (reviewed ? confirmed : sub.comments)) counts[c.severity] = (counts[c.severity] || 0) + 1;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      {sub.archived && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <Archive className="size-4" /> This attempt was archived when you started a retake.
        </div>
      )}

      <Card className="p-6 grid gap-5">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyLogo company={co} size={44} />
          <div className="flex-1 min-w-60">
            <div className="text-sm text-slate-500">
              <span className="font-mono font-semibold text-ink">#{reportId(sub)}</span> · {ch?.title} · {opening?.title} at {co?.name}
              {sub.attempt > 1 && <> · attempt {sub.attempt}</>}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-extrabold">{reviewed ? 'Report accepted' : sub.status === 'checking' ? 'Checking your submission' : sub.status === 'failed' ? 'Submission needs a fix' : 'Waiting for triage by the company'}</h1>
            <div className="text-sm text-slate-500">
              {sub.sourceKind === 'github' ? 'GitHub' : 'Local folder'} · {sub.commit ? <span className="font-mono">commit {sub.commit}</span> : 'freezing commit…'} · submitted {timeAgo(sub.createdAt)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['high', 'medium', 'low'].map((k) => counts[k] > 0 && <Pill key={k} color={{ high: 'rose', medium: 'amber', low: 'sky' }[k]}>{counts[k]} × {PRIORITY[k].p}</Pill>)}
            {counts.good > 0 && <Pill color="green">{counts.good} strengths</Pill>}
          </div>
        </div>

        <ol className="grid grid-cols-3 md:grid-cols-6 gap-2" aria-label="Report status">
          {REPORT_STATES.map((s, i) => (
            <li key={s.key} className="grid gap-1.5">
              <div className={cx('h-1.5 rounded-full', i <= stateIndex ? (i === stateIndex ? 'bg-violet-600' : 'bg-emerald-500') : 'bg-slate-200')} />
              <span className={cx('text-xs font-semibold', i === stateIndex ? 'text-violet-700' : i < stateIndex ? 'text-emerald-700' : 'text-slate-400')}>{s.label}</span>
            </li>
          ))}
        </ol>
      </Card>

      {reviewed && !sub.archived && (
        <section className="arena-bg rounded-3xl p-6 text-white flex flex-wrap items-center gap-5">
          <div className="grid place-items-center size-14 rounded-2xl bg-amber-400 text-amber-950 pulse-ring">
            {reviewTrack ? <Mic className="size-7" /> : <Swords className="size-7" />}
          </div>
          <div className="flex-1 min-w-60">
            <div className="font-display text-2xl font-extrabold">{reviewTrack ? 'Your viva is ready' : 'The Live Round is unlocked'}</div>
            <p className="text-violet-100 text-sm">{reviewTrack ? '3 questions about your own code, then the company scores your answers.' : 'Your review found weak spots. Each one became a mission inside your own code.'}</p>
          </div>
          <Button variant="gold" size="lg" href={reviewTrack ? `/student/viva/${sub.id}` : `/student/arena/${sub.id}`}>
            {reviewTrack ? 'Open the viva' : 'Enter the Live Round'} <ArrowRight className="size-4" />
          </Button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-6 content-start">
          {!reviewed && (
            <Card className="p-6 grid gap-4">
              <SectionTitle title="Automated checks" />
              <PipelineProgress sub={sub} />
              {sub.status === 'awaiting_review' && (
                <div className="flex gap-3 items-start rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  <Hourglass className="size-5 shrink-0" />
                  <div>
                    <b>All checks done.</b> A {co?.name} engineer is now confirming the AI&apos;s review comments. You&apos;ll see them here, and your next round unlocks right after.
                  </div>
                </div>
              )}
              {sub.status === 'awaiting_review' && (
                <CompanyTurn href={`/company/reviews/${sub.id}`} title="Presenting the demo?" body="Now it's the company's turn: open the review, confirm the AI comments and publish. Then come back here." />
              )}
            </Card>
          )}

          {reviewed && (
            <Card className="p-6 grid gap-4">
              <SectionTitle title="Your code review" />
              {sub.reviewerNote && (
                <div className="flex gap-3 rounded-xl bg-indigo-50 p-4 text-sm">
                  <UserRound className="size-5 text-indigo-600 shrink-0" />
                  <div><b>Reviewer note:</b> {sub.reviewerNote}</div>
                </div>
              )}
              {confirmed.map((c) => (
                <div key={c.id} className="grid gap-1">
                  <div className="text-xs font-mono text-slate-500">{c.file}:{c.line}</div>
                  <InlineComment comment={c} compact />
                </div>
              ))}
            </Card>
          )}

          <Card className="p-6 grid gap-3">
            <SectionTitle title="Activity" />
            <Timeline sub={sub} state={state} co={co} />
          </Card>
        </div>

        <div className="grid gap-6 content-start">
          {reviewed && (
            <Card className="p-5 grid gap-3">
              <SectionTitle title="Rubric" />
              {Object.entries(sub.rubric).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                  <span>{RUBRIC_LABELS[k]}</span>
                  <Bar value={v} max={10} />
                  <span className="font-bold tabular text-right">{v}/10</span>
                </div>
              ))}
            </Card>
          )}
          {(sub.checks?.hiddenTests || sub.checks?.studentTests) && (
            <Card className="p-5">
              <SectionTitle title="Machine checks" />
              <div className="mt-3">
                <ChecksSummary checks={sub.checks} defaultOpen />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// HackerOne-style report timeline built from the submission's own timestamps.
function Timeline({ sub, state, co }) {
  const student = byId(state.students, sub.studentId);
  const events = [{ at: sub.createdAt, icon: Send, who: student.name, text: `submitted the project${sub.attempt > 1 ? ` (attempt ${sub.attempt})` : ''}` }];
  if (sub.checkedAt) {
    const h = sub.checks.hiddenTests;
    events.push({ at: sub.checkedAt, icon: Bot, who: 'ProofArena', text: `ran the checks: ${h ? `${h.passed}/${h.total} hidden tests` : `${sub.checks.studentTests?.passed}/${sub.checks.studentTests?.total} own tests`}, ${sub.comments.length} draft findings` });
  }
  if (sub.reviewedAt) {
    const conf = sub.comments.filter((c) => c.status === 'confirmed').length;
    const rej = sub.comments.filter((c) => c.status === 'rejected').length;
    events.push({ at: sub.reviewedAt, icon: FileSearch, who: `${co?.name} engineer`, text: `triaged the report: confirmed ${conf} finding${conf === 1 ? '' : 's'}${rej ? `, rejected ${rej}` : ''}, and published the review` });
  }
  for (const m of sub.missions) {
    if (m.status !== 'passed' || !m.result?.finishedAt) continue;
    const def = missionDef(state, sub.challengeId, m.id);
    events.push({ at: m.result.finishedAt, icon: Check, who: student.name, text: `cleared ${def?.title} (+${m.result.xp || 0} XP, ${m.result.srcFilesChanged} source file${m.result.srcFilesChanged === 1 ? '' : 's'} changed)` });
  }
  if (sub.viva?.submittedAt) events.push({ at: sub.viva.submittedAt, icon: MessageSquareText, who: student.name, text: 'answered the viva' });
  if (sub.viva?.scoredAt) events.push({ at: sub.viva.scoredAt, icon: Trophy, who: `${co?.name} engineer`, text: `scored the viva. Verified score: ${sub.score.total}/100` });
  for (const inv of state.invites.filter((i) => i.studentId === sub.studentId)) {
    const c = byId(state.companies, inv.companyId);
    events.push({ at: inv.createdAt, icon: UserRound, who: c?.name, text: `invited ${student.name} to interview (${inv.status})` });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ol className="relative border-l-2 border-slate-200 ml-2 grid gap-4">
      {events.map((e, i) => (
        <li key={i} className="pl-5 relative text-sm">
          <span className="absolute -left-[13px] top-0 grid place-items-center size-6 rounded-full bg-white ring-2 ring-slate-200">
            <e.icon className="size-3.5 text-slate-600" />
          </span>
          <b>{e.who}</b> {e.text}
          <div className="text-xs text-slate-400">{timeAgo(e.at)}</div>
        </li>
      ))}
    </ol>
  );
}
