'use client';

import Link from 'next/link';
import { ClipboardCheck, Mic, ArrowRight, LoaderCircle } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Avatar, Pill, Empty } from '@/components/ui';
import { byId, STATUS_LABEL } from '@/lib/selectors';
import { timeAgo } from '@/lib/client';

export default function Reviews() {
  const { state } = useShared();
  const live = state.submissions.filter((s) => !s.sample && !s.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const needs = (s) => s.status === 'awaiting_review' || (s.viva?.submittedAt && !s.viva?.scoredAt);

  return (
    <div className="grid gap-6 max-w-5xl">
      <div>
        <div className="text-sm text-slate-500">Reviews</div>
        <h1 className="font-display text-3xl font-extrabold">Review queue</h1>
        <p className="text-slate-600 mt-1 max-w-2xl">The platform already ran the tests and drafted comments. You confirm what&apos;s right, reject what isn&apos;t, and score the rubric. About 10 minutes per project.</p>
      </div>
      <Card className="divide-y divide-slate-100">
        {live.length === 0 && (
          <Empty icon={ClipboardCheck} title="No submissions yet">
            Open the student view in another tab and submit Hitesh&apos;s project. It appears here as soon as the checks finish.
          </Empty>
        )}
        {live.map((s) => {
          const st = byId(state.students, s.studentId);
          const vivaReady = s.viva?.submittedAt && !s.viva?.scoredAt;
          const status = STATUS_LABEL[s.status];
          return (
            <Link key={s.id} href={`/company/reviews/${s.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
              <Avatar person={st} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{st.name} <span className="text-slate-400 font-normal">· {st.college}</span></div>
                <div className="text-sm text-slate-500">
                  {s.status === 'checking' ? 'Running checks…' : s.checks.hiddenTests ? `${s.checks.hiddenTests.passed}/${s.checks.hiddenTests.total} hidden tests · commit ${s.commit}` : s.checks.studentTests ? `Review track · ${s.checks.studentTests.passed}/${s.checks.studentTests.total} own tests` : ''} · {state.library.find((c) => c.id === s.challengeId)?.title} · submitted {timeAgo(s.createdAt)}
                </div>
              </div>
              {s.status === 'checking' && <LoaderCircle className="size-4 animate-spin text-sky-600" />}
              {vivaReady ? <Pill color="violet" icon={Mic}>Viva to score</Pill> : <Pill color={status.color}>{status.label}</Pill>}
              {needs(s) && <span className="size-2 rounded-full bg-rose-500" aria-label="Needs action" />}
              <ArrowRight className="size-4 text-slate-400" />
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
