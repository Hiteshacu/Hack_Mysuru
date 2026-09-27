'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ListChecks, FileCode2, Copy, Laptop, Send, Crown, Bug, MessageCircle, Mic, Clock, FolderOpen, ShieldCheck, CircleCheck, CircleX,
  Trophy, Timer, Users, BadgeCheck, Scale, RotateCcw, ArrowRight, Sparkles, PackageCheck,
} from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, SectionTitle, Field, inputCls, CompanyLogo, Loading, Avatar, cx } from '@/components/ui';
import { byId, challengeStats, companyResponse, formatHours, STATUS_LABEL } from '@/lib/selectors';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

const ICONS = { 'bug-hunt': Bug, 'fix-review': MessageCircle, 'plot-twist': Crown, viva: Mic };

export default function ChallengePage() {
  const { openingId } = useParams();
  const router = useRouter();
  const { state, refresh } = useShared();
  const opening = byId(state.openings, openingId);
  const [mode, setMode] = useState('local');
  const [source, setSource] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [retake, setRetake] = useState(false);
  if (!opening) return <Loading />;
  const co = byId(state.companies, opening.companyId);
  const ch = state.library.find((c) => c.id === opening.challengeId);
  if (!ch) return <Loading />;
  const verified = ch.status === 'live';
  const stats = challengeStats(state, ch.id);
  const response = companyResponse(state, co.id);
  const existing = state.submissions.filter((s) => s.studentId === 'hitesh' && s.challengeId === ch.id && !s.archived && s.status !== 'failed').at(-1);
  const showForm = !existing || retake;

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    try {
      const sub = await api('POST', '/api/submissions', { studentId: 'hitesh', openingId, source, deployUrl, retake: Boolean(existing) });
      toast(existing ? 'New attempt started. Your old attempt is archived.' : 'Submitted! Watch the checks run.');
      await refresh();
      router.push(`/student/submission/${sub.id}`);
    } finally {
      setSending(false);
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {});
  }

  const rewards = verified
    ? [
        ['Submit your project', 100],
        ['Code review published', 50],
        ...ch.missions.map((m) => [`Level ${m.level} · ${m.title}`, m.xp]),
        ['Bonus: finish under half the time', 50],
        ['Bonus: your test catches the planted bug', 100],
      ]
    : [
        ['Submit your project', 100],
        ['Code review published', 50],
        ['Viva completed', 150],
      ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <Link href="/student/opportunities" className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-4" /> Opportunities
      </Link>

      <section className="rounded-3xl bg-ink text-white arch-bg p-6 md:p-8 grid gap-4">
        <div className="flex items-center gap-3">
          <CompanyLogo company={co} size={40} />
          <div className="text-sm text-slate-300">{co.name} · {opening.title} · {opening.pay}</div>
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold">{ch.title}</h1>
        <p className="text-slate-300 text-lg max-w-3xl">{ch.tagline}</p>
        <div className="flex flex-wrap gap-2">
          {verified ? <Pill color="green" icon={ShieldCheck}>Verified challenge · full Live Round</Pill> : <Pill color="sky">Written by {co.name} · review track</Pill>}
          <Pill color="amber">{ch.difficulty}</Pill>
          <Pill color="dark" icon={Clock}>About {ch.estimatedHours} hours</Pill>
          {ch.skills.map((s) => (
            <Pill key={s} className="bg-white/10 text-white">{s}</Pill>
          ))}
        </div>
      </section>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <HighlightStat icon={Users} label="Submissions" value={stats.submissions} />
        <HighlightStat icon={BadgeCheck} label="Verified" value={stats.verified} />
        <HighlightStat icon={Timer} label="Avg time to review" value={formatHours(response.avgTimeToReview ?? stats.timeToReview)} hint={response.efficiency != null ? `${response.efficiency}% reviewed within 48 h` : 'Reviews usually within 48 h'} />
        <HighlightStat icon={Trophy} label="Top score" value={stats.topScore ?? '–'} />
      </div>

      {existing && (
        <Card className="p-5 flex flex-wrap items-center gap-4 ring-2 ring-emerald-200 bg-emerald-50/50">
          <CircleCheck className="size-6 text-emerald-600" />
          <div className="flex-1 min-w-60">
            <div className="font-semibold">You already have proof for {ch.title}</div>
            <div className="text-sm text-slate-600">
              Score {existing.score.total} so far · <Pill color={STATUS_LABEL[existing.status].color}>{STATUS_LABEL[existing.status].label}</Pill> · {co.name} can already see it. You don&apos;t need to submit again.
            </div>
          </div>
          <Button variant="success" href={existing.status === 'in_arena' ? (existing.track === 'review' ? `/student/viva/${existing.id}` : `/student/arena/${existing.id}`) : `/student/submission/${existing.id}`}>
            Continue <ArrowRight className="size-4" />
          </Button>
          {!retake && (
            <Button variant="outline" icon={RotateCcw} onClick={() => { setRetake(true); setTimeout(() => document.getElementById('submit-box')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
              Retake from scratch
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid gap-6 content-start">
          <Card className="p-6 grid gap-3">
            <SectionTitle title="The problem" />
            <p className="text-slate-700">{ch.summary}</p>
          </Card>

          <Card className="p-6 grid gap-4">
            <SectionTitle title="Scope" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-4 grid gap-2 content-start">
                <div className="text-sm font-bold text-emerald-800">In scope</div>
                {(ch.scope?.in || []).map((s) => (
                  <div key={s} className="flex gap-2 text-sm"><CircleCheck className="size-4 text-emerald-600 mt-0.5 shrink-0" />{s}</div>
                ))}
              </div>
              <div className="rounded-xl bg-rose-50 p-4 grid gap-2 content-start">
                <div className="text-sm font-bold text-rose-800">Out of scope</div>
                {(ch.scope?.out || []).map((s) => (
                  <div key={s} className="flex gap-2 text-sm"><CircleX className="size-4 text-rose-500 mt-0.5 shrink-0" />{s}</div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6 grid gap-3">
            <SectionTitle title="What to build" />
            <ul className="grid gap-2">
              {ch.requirements.map((r) => (
                <li key={r} className="flex gap-2 text-sm"><ListChecks className="size-4 text-emerald-600 mt-0.5 shrink-0" />{r}</li>
              ))}
            </ul>
            {ch.contract?.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-4 grid gap-2 mt-2">
                <div className="font-semibold text-sm">Contract (so our hidden tests can run your code)</div>
                {ch.contract.map((r) => (
                  <div key={r} className="flex gap-2 text-sm text-slate-700"><FileCode2 className="size-4 text-slate-500 mt-0.5 shrink-0" />{r}</div>
                ))}
              </div>
            )}
            {ch.deliverables?.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-4 grid gap-2 mt-2">
                <div className="font-semibold text-sm">Deliverables</div>
                {ch.deliverables.map((r) => (
                  <div key={r} className="flex gap-2 text-sm text-slate-700"><PackageCheck className="size-4 text-slate-500 mt-0.5 shrink-0" />{r}</div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6 grid gap-4">
            <SectionTitle title="Rewards" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">XP you earn</div>
                {rewards.map(([label, xp]) => (
                  <div key={label} className="flex justify-between px-4 py-2 text-sm border-t border-slate-100">
                    <span>{label}</span>
                    <span className="font-bold text-violet-700 tabular">+{xp}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">Review findings (priority)</div>
                {[
                  ['P2 · High', 'Wrong results, data corruption, security holes', 'bg-rose-500'],
                  ['P3 · Medium', 'Missing edge cases, untested paths, false README claims', 'bg-amber-500'],
                  ['P4 · Low', 'Robustness and polish', 'bg-sky-500'],
                  ['Strength', 'Good design choices, noted on your profile', 'bg-emerald-500'],
                ].map(([p, d, c]) => (
                  <div key={p} className="flex gap-3 px-4 py-2 text-sm border-t border-slate-100">
                    <span className={cx('w-1 rounded', c)} />
                    <div>
                      <div className="font-semibold">{p}</div>
                      <div className="text-xs text-slate-500">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">XP is for fun. Companies rank you by your Verified Score, which comes from tests and reviewers.</p>
          </Card>

          <Card className="p-6 grid gap-3">
            <SectionTitle title={<span className="inline-flex items-center gap-2"><Scale className="size-5 text-slate-500" />Rules</span>} />
            <ul className="grid gap-2 text-sm">
              {(ch.rules || []).map((r) => (
                <li key={r} className="flex gap-2"><span className="text-slate-400">•</span>{r}</li>
              ))}
            </ul>
          </Card>

          {verified && (
            <Card className="p-6 grid gap-3">
              <SectionTitle title="Live Round levels (after your review)" />
              {ch.missions.map((m) => {
                const Icon = ICONS[m.id];
                return (
                  <div key={m.id} className={cx('flex items-center gap-3 rounded-xl p-3', m.boss ? 'bg-amber-50' : 'bg-slate-50')}>
                    <div className={cx('grid place-items-center size-9 rounded-xl text-white', m.boss ? 'bg-gold' : 'bg-violet-600')}><Icon className="size-4" /></div>
                    <div className="flex-1 text-sm"><b>Level {m.level} · {m.title}</b> <span className="text-slate-500">· {m.kind}</span></div>
                    <span className="text-xs font-bold text-violet-700">+{m.xp} XP</span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>

        <div className="grid gap-6 content-start">
          <Card className="p-5 grid gap-3">
            <SectionTitle title={<span className="inline-flex items-center gap-2"><Trophy className="size-5 text-amber-500" />Hall of Fame</span>} />
            {stats.hall.length === 0 ? (
              <p className="text-sm text-slate-500">No one is fully verified on this challenge yet. Be the first.</p>
            ) : (
              stats.hall.map((c, i) => (
                <div key={c.student.id} className="flex items-center gap-3">
                  <span className="w-5 text-sm font-bold text-slate-400">{i + 1}</span>
                  <Avatar person={c.student} size={30} />
                  <span className="flex-1 text-sm font-semibold">{c.student.name}</span>
                  <span className="font-display font-extrabold tabular">{c.sub.score.total}</span>
                </div>
              ))
            )}
          </Card>

          <Card className="p-6 grid gap-3">
            <SectionTitle eyebrow="Step 1" title="Start your project" />
            {verified ? (
              <>
                <p className="text-sm text-slate-600">On GitHub, open the template and click <b>Use this template</b>. It gives you the folder layout, the contract and doc templates.</p>
                <button onClick={() => copy('github.com/proofarena/palace-pass-template')} className="flex items-center justify-between rounded-xl bg-slate-900 text-slate-100 px-4 py-3 font-mono text-sm">
                  github.com/proofarena/palace-pass-template <Copy className="size-4" />
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-600">Start a new repository. Put tests in <code className="font-mono">tests/</code> using node:test so the automatic checks can run them, and add the docs listed under deliverables.</p>
            )}
            <div className="flex gap-2 items-start text-sm text-slate-600"><Laptop className="size-4 mt-0.5 shrink-0" />Build on your own laptop with any editor and any AI tool. Say what you used in <code className="font-mono">ai.md</code>.</div>
          </Card>

          {showForm ? (
            <Card id="submit-box" className="p-6 ring-2 ring-violet-200 scroll-mt-24">
              <form onSubmit={submit} className="grid gap-4">
                <SectionTitle eyebrow="Step 2" title={existing ? 'Retake: submit a new attempt' : 'Submit your project'} />
                {existing && <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3 -mt-1">Your current attempt will be archived and your progress starts again from the code review.</p>}
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                  {[
                    ['github', 'GitHub link'],
                    ['local', 'Local folder'],
                  ].map(([k, label]) => (
                    <button type="button" key={k} onClick={() => { setMode(k); setSource(''); }} className={cx('rounded-lg py-1.5', mode === k ? 'bg-white shadow-sm' : 'text-slate-500')}>
                      {label}
                    </button>
                  ))}
                </div>
                {mode === 'github' ? (
                  <Field label="Repository URL" hint="Public repo. We freeze the latest commit.">
                    <input id="sub-src" className={inputCls} value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://github.com/you/palace-pass" required />
                  </Field>
                ) : (
                  <Field label="Project folder" hint="For offline demos. Works exactly like a GitHub submission.">
                    <input id="sub-src" className={cx(inputCls, 'font-mono text-xs')} value={source} onChange={(e) => setSource(e.target.value)} placeholder="D:\projects\palace-pass" required />
                    <button type="button" onClick={() => setSource(state.demoProjectPath)} className="text-left text-xs font-semibold text-brand inline-flex items-center gap-1">
                      <FolderOpen className="size-3.5" /> Use Hitesh&apos;s demo project
                    </button>
                  </Field>
                )}
                <Field label="Deployed URL (optional)">
                  <input id="sub-deploy" className={inputCls} value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} placeholder="https://palace-pass.onrender.com" />
                </Field>
                <Button type="submit" size="lg" icon={existing ? RotateCcw : Send} loading={sending}>
                  {existing ? 'Start new attempt' : 'Submit for review'}
                </Button>
                {existing && (
                  <button type="button" onClick={() => setRetake(false)} className="text-sm text-slate-500 hover:text-ink">Cancel retake</button>
                )}
              </form>
            </Card>
          ) : null}

          {!verified && (
            <Card className="p-5 flex gap-3 text-sm bg-slate-50">
              <Sparkles className="size-5 text-violet-600 shrink-0" />
              <span className="text-slate-600">
                This challenge was written by {co.name}. After their engineer reviews your code, you answer a viva generated from your own code.
              </span>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function HighlightStat({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="font-display text-2xl font-extrabold tabular mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}
