'use client';

import { Gamepad2, ListChecks, Crosshair, Bug, Code2, Users, Check, Lock, Play, Trophy } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, CompanyLogo, Empty, cx } from '@/components/ui';

const ME = 'hitesh';
const STAGES = [
  { id: 'mcq', label: 'Gate Quiz', icon: ListChecks },
  { id: 'arrow', label: 'Arrow Range', icon: Crosshair },
  { id: 'debug', label: 'Debug Den', icon: Bug },
  { id: 'dsa', label: 'Algorithm Grove', icon: Code2 },
  { id: 'done', label: 'Community', icon: Users },
];

export default function StudentQuests() {
  const { state } = useShared();
  const invited = new Set(state.notifications.filter((n) => n.deliveries.some((d) => d.studentId === ME)).map((n) => n.questId));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <section className="arena-bg rounded-3xl p-6 md:p-8 text-white grid gap-3 overflow-hidden relative">
        <div className="absolute -right-16 -bottom-16 size-72 rounded-full bg-amber-400/20 blur-3xl float" aria-hidden="true" />
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
          <Gamepad2 className="size-3.5" /> 3D Quests
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold">Walk into the hiring world.</h1>
        <p className="text-violet-100 max-w-2xl">
          Pass the gate quiz, win the Arrow Range to earn your rifle, fix a bug in the Debug Den and solve a DSA problem in the Algorithm Grove. Finish and you enter the Community Camp with real job links and HR emails.
        </p>
      </section>

      {state.quests.length === 0 && (
        <Card>
          <Empty icon={Gamepad2} title="No quests yet">When a company launches a 3D Quest and invites you, it appears here and in your notifications.</Empty>
        </Card>
      )}

      <div className="grid gap-4">
        {state.quests.map((q, qi) => {
          const co = state.companies.find((c) => c.id === q.companyId);
          const run = state.questRuns.find((r) => r.questId === q.id && r.studentId === ME);
          const stageIndex = STAGES.findIndex((s) => s.id === (run?.stage || 'mcq'));
          const done = run?.stage === 'done';
          return (
            <Card key={q.id} className="p-6 grid gap-5 fade-up tilt" style={{ animationDelay: `${qi * 80}ms` }}>
              <div className="flex flex-wrap items-center gap-4">
                <CompanyLogo company={co} size={48} />
                <div className="flex-1 min-w-60">
                  <div className="text-sm text-slate-500">{co?.name} {invited.has(q.id) && <Pill color="violet" className="ml-1">You&apos;re invited</Pill>}</div>
                  <div className="font-display text-2xl font-bold">{q.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {q.skills.map((s) => (
                      <Pill key={s}>{s}</Pill>
                    ))}
                  </div>
                </div>
                {done ? (
                  <Button variant="success" icon={Users} href="/student/community">Open Community</Button>
                ) : (
                  <Button variant="gold" size="lg" icon={Play} href={`/quest/index.html?quest=${q.id}&student=${ME}`} className="glow">
                    {run ? 'Continue in 3D' : 'Enter the 3D world'}
                  </Button>
                )}
              </div>
              <ol className="grid grid-cols-5 gap-2">
                {STAGES.map((s, i) => {
                  const state2 = i < stageIndex || done ? 'done' : i === stageIndex ? 'now' : 'locked';
                  return (
                    <li key={s.id} className="grid justify-items-center gap-1.5 text-center">
                      <div className={cx('grid place-items-center size-11 rounded-2xl transition', state2 === 'done' ? 'bg-emerald-500 text-white' : state2 === 'now' ? 'bg-amber-300 text-amber-950 pulse-ring' : 'bg-slate-100 text-slate-400')}>
                        {state2 === 'done' ? <Check className="size-5" /> : state2 === 'locked' ? <Lock className="size-4" /> : <s.icon className="size-5" />}
                      </div>
                      <span className={cx('text-xs font-semibold', state2 === 'now' ? 'text-amber-700' : 'text-slate-500')}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
              {run && (
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Trophy className="size-4 text-amber-500" />{run.points} quest points</span>
                  {run.rifle && <Pill color="amber">🔫 Rifle earned</Pill>}
                  {run.mcqScore != null && <span>Quiz {run.mcqScore}/5</span>}
                  {run.arrowScore && <span>Arrows {run.arrowScore.correct}/5 · {run.arrowScore.accuracy}% accuracy</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
