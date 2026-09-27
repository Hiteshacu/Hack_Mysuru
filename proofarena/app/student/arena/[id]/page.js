'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bug, MessageCircle, Crown, Mic, Lock, Check, Play, Clock, Sparkles, ArrowLeft, Hourglass } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Button, Loading, cx } from '@/components/ui';
import { byId, missionDef, standing, TOP_N } from '@/lib/selectors';
import { CountUp } from '@/components/fx';
import { api, formatDuration } from '@/lib/client';

const ICONS = { 'bug-hunt': Bug, 'fix-review': MessageCircle, 'plot-twist': Crown, viva: Mic };

export default function ArenaMap() {
  const { id } = useParams();
  const router = useRouter();
  const { state } = useShared();
  const [starting, setStarting] = useState(null);
  const sub = byId(state.submissions, id);
  if (!sub) return <Loading />;
  const me = byId(state.students, sub.studentId);
  const cleared = sub.missions.filter((m) => m.status === 'passed').length;
  const st = standing(state, sub.studentId);

  async function start(m) {
    if (m.id === 'viva') {
      router.push(`/student/viva/${sub.id}`);
      return;
    }
    setStarting(m.id);
    try {
      const { sessionId } = await api('POST', '/api/arena/start', { submissionId: sub.id, missionId: m.id });
      router.push(`/student/arena/${sub.id}/play/${sessionId}`);
    } catch {
      setStarting(null);
    }
  }

  return (
    <div className="arena-bg min-h-full text-white">
      <div className="mx-auto max-w-4xl px-5 py-8 grid gap-8">
        <Link href="/student" className="text-sm text-violet-200 inline-flex items-center gap-1 hover:text-white">
          <ArrowLeft className="size-4" /> Home
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-amber-300 text-xs font-bold uppercase tracking-[0.2em]">Phase 2</div>
            <h1 className="font-display text-4xl md:text-5xl font-extrabold">The Live Round</h1>
            <p className="text-violet-200 mt-1 max-w-xl">Every mission happens inside a copy of your own Palace Pass project. Your real GitHub repo is never touched.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/10 px-4 py-2">
              <div className="font-display text-2xl font-extrabold tabular">{cleared}/{sub.missions.filter((m) => m.status !== 'skipped').length}</div>
              <div className="text-[11px] text-violet-200 uppercase tracking-wider">Cleared</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-2">
              <div className="font-display text-2xl font-extrabold"><CountUp value={me.xp} /></div>
              <div className="text-[11px] text-violet-200 uppercase tracking-wider">XP</div>
            </div>
            <Link href="/student/connect" className={cx('rounded-2xl px-4 py-2', st?.unlocked ? 'bg-amber-300 text-amber-950 glow' : 'bg-white/10')}>
              <div className="font-display text-2xl font-extrabold tabular">#{st?.rank ?? '–'}</div>
              <div className={cx('text-[11px] uppercase tracking-wider', st?.unlocked ? 'text-amber-900 font-bold' : 'text-violet-200')}>{st?.unlocked ? 'HR Connect ✓' : `Top ${TOP_N}: ${st?.gap ?? '–'} pts`}</div>
            </Link>
          </div>
        </div>

        <ol className="relative grid gap-6">
          <div className="absolute left-8 md:left-1/2 top-4 bottom-4 w-1 -translate-x-1/2 rounded bg-white/10" aria-hidden="true" />
          {sub.missions.map((m, i) => {
            const def = missionDef(state, sub.challengeId, m.id);
            const Icon = ICONS[m.id];
            const locked = m.status === 'locked';
            const ready = m.status === 'ready';
            const done = m.status === 'passed';
            const skipped = m.status === 'skipped';
            const waiting = m.status === 'submitted';
            const right = i % 2 === 1;
            return (
              <li key={m.id} className={cx('relative grid md:grid-cols-2 gap-4 items-center')}>
                <div className={cx('pl-20 md:pl-0', right ? 'md:col-start-2 md:pl-12' : 'md:pr-12')}>
                  <div
                    className={cx(
                      'rounded-3xl p-5 grid gap-3 ring-1 transition tilt fade-up',
                      def.boss ? 'bg-gradient-to-br from-amber-500/25 to-rose-500/20 ring-amber-300/40' : 'bg-white/[0.07] ring-white/15',
                      locked && 'opacity-50',
                      ready && 'ring-2 ring-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.25)]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                      <span className={def.boss ? 'text-amber-300' : 'text-violet-300'}>Level {def.level}{def.boss ? ' · Boss' : ''}</span>
                      <span className="ml-auto text-amber-300">+{def.xp} XP</span>
                    </div>
                    <div className="font-display text-2xl font-extrabold">{def.title}</div>
                    <div className="text-sm text-violet-100">{def.story?.headline ? `“${def.story.headline}”` : 'Explain the changes you just made, in your own words.'}</div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-violet-200">
                      <span className="inline-flex items-center gap-1"><Sparkles className="size-3.5" />{def.kind}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{def.minutes} min</span>
                    </div>
                    {done && m.result && (
                      <div className="text-sm text-emerald-300">
                        Cleared in {formatDuration(m.result.durationSec)} · {m.result.srcFilesChanged} source file{m.result.srcFilesChanged === 1 ? '' : 's'} changed · +{m.result.xp} XP
                      </div>
                    )}
                    {done && m.id === 'viva' && <div className="text-sm text-emerald-300">Scored by the company. You&apos;re verified.</div>}
                    {skipped && <div className="text-sm text-slate-300">Nothing to fix: your code already passed these tests. Full points.</div>}
                    {waiting && (
                      <div className="grid gap-2">
                        <div className="text-sm text-amber-200 inline-flex items-center gap-1"><Hourglass className="size-4" />Answers sent. Waiting for the company to score.</div>
                        <Link href={`/company/reviews/${sub.id}`} className="w-fit rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-100">
                          Switch to company · score the viva →
                        </Link>
                      </div>
                    )}
                    {ready && (
                      <Button variant="gold" icon={Play} loading={starting === m.id} onClick={() => start(m)} className="w-fit">
                        {m.id === 'viva' ? 'Start viva' : m.attempts ? 'Continue mission' : 'Start mission'}
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className={cx(
                    'absolute left-8 md:left-1/2 -translate-x-1/2 grid place-items-center rounded-full ring-4 ring-[#1a1033]',
                    def.boss ? 'size-16' : 'size-12',
                    done || skipped ? 'bg-emerald-400 text-emerald-950' : ready ? 'bg-amber-300 text-amber-950 pulse-ring' : waiting ? 'bg-amber-200 text-amber-900' : 'bg-white/15 text-white/60',
                  )}
                >
                  {done || skipped ? <Check className="size-6" /> : locked ? <Lock className="size-5" /> : <Icon className={def.boss ? 'size-7' : 'size-5'} />}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
