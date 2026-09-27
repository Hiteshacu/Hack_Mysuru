'use client';

import { useState } from 'react';
import { Clock, Gauge, ListChecks, FileCode2, Swords, Crown, Bug, MessageCircle, Mic, Plus, ShieldCheck, Sparkles, PenLine, ChevronDown } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Pill, Button, SectionTitle, Empty } from '@/components/ui';
import { challengeStats, formatHours } from '@/lib/selectors';

const MISSION_ICONS = { 'bug-hunt': Bug, 'fix-review': MessageCircle, 'plot-twist': Crown, viva: Mic };

export default function Library() {
  const { state } = useShared();
  const verified = state.library.filter((c) => c.status === 'live');
  const mine = state.library.filter((c) => c.status === 'custom' && c.companyId === state.activeCompanyId);

  return (
    <div className="grid gap-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Challenge library</div>
          <h1 className="font-display text-3xl font-extrabold">Challenges</h1>
          <p className="text-slate-600 mt-1 max-w-2xl">Use a verified challenge, or create your own and let AI help you write it.</p>
        </div>
        <Button href="/company/library/new" icon={Plus}>Create a challenge</Button>
      </div>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Your challenges" title="Written by your team" />
        {mine.length === 0 ? (
          <Card>
            <Empty icon={PenLine} title="No challenges yet">
              Create one from your own problem statement, or let AI generate one from the skills you&apos;re hiring for.
            </Empty>
            <div className="pb-6 grid place-items-center">
              <Button href="/company/library/new" icon={Sparkles}>Create with AI</Button>
            </div>
          </Card>
        ) : (
          mine.map((c) => <CustomCard key={c.id} c={c} />)
        )}
      </section>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Verified by ProofArena" title="Full Live Round challenges" />
        {verified.map((c) => (
          <VerifiedCard key={c.id} c={c} stats={challengeStats(state, c.id)} />
        ))}
      </section>
    </div>
  );
}

function CustomCard({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-5 grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Pill color="sky">Review track</Pill>
            <Pill color="amber">{c.difficulty}</Pill>
            {c.aiAssist !== 'manual' && <Pill color="violet" icon={Sparkles}>{c.aiAssist === 'generated' ? 'AI-generated' : 'AI-refined'}</Pill>}
          </div>
          <div className="font-display text-xl font-bold">{c.title}</div>
          <div className="text-sm text-slate-500">{c.tagline}</div>
        </div>
        <Button size="sm" href={`/company/openings?new=1&challenge=${c.id}`}>Use in an opening</Button>
      </div>
      <p className="text-sm text-slate-700">{c.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {c.skills.map((s) => (
          <Pill key={s}>{s}</Pill>
        ))}
      </div>
      <button onClick={() => setOpen(!open)} className="text-left text-sm font-semibold text-brand inline-flex items-center gap-1">
        <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide' : 'Show'} {c.requirements.length} requirements
      </button>
      {open && (
        <ul className="grid gap-1.5 text-sm">
          {c.requirements.map((r) => (
            <li key={r} className="flex gap-2"><ListChecks className="size-4 text-emerald-600 mt-0.5 shrink-0" />{r}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function VerifiedCard({ c, stats }) {
  return (
    <Card className="overflow-hidden">
      <div className="arch-bg bg-ink text-white p-6 grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill color="green" icon={ShieldCheck}>Verified</Pill>
          <Pill color="amber">{c.difficulty}</Pill>
        </div>
        <h2 className="font-display text-3xl font-extrabold">{c.title}</h2>
        <p className="text-slate-300 max-w-2xl">{c.summary}</p>
        <div className="flex flex-wrap gap-4 text-sm text-slate-300 mt-1">
          <span className="inline-flex items-center gap-1"><Clock className="size-4" />About {c.estimatedHours} hours</span>
          <span className="inline-flex items-center gap-1"><Gauge className="size-4" />{c.stack}</span>
          <span>{stats.submissions} submissions · {stats.verified} verified · avg review {formatHours(stats.timeToReview)}</span>
        </div>
      </div>
      <div className="p-6 grid gap-6 lg:grid-cols-2">
        <div className="grid gap-2 content-start">
          <SectionTitle title="What students build" />
          <ul className="grid gap-1.5 text-sm">
            {c.requirements.map((r) => (
              <li key={r} className="flex gap-2"><ListChecks className="size-4 text-emerald-600 mt-0.5 shrink-0" />{r}</li>
            ))}
          </ul>
          <SectionTitle title="Contract" className="mt-3" />
          <ul className="grid gap-1.5 text-sm">
            {c.contract.map((r) => (
              <li key={r} className="flex gap-2"><FileCode2 className="size-4 text-slate-500 mt-0.5 shrink-0" />{r}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 content-start">
          <SectionTitle title="Live Round missions" />
          {c.missions.map((m) => {
            const Icon = MISSION_ICONS[m.id] || Swords;
            return (
              <div key={m.id} className={`flex items-center gap-3 rounded-xl p-3 ${m.boss ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50'}`}>
                <div className={`grid place-items-center size-9 rounded-xl text-white ${m.boss ? 'bg-gold' : 'bg-violet-600'}`}><Icon className="size-4" /></div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">Level {m.level} · {m.title}</div>
                  <div className="text-xs text-slate-500">{m.kind} · {m.minutes} min</div>
                </div>
              </div>
            );
          })}
          <Button href={`/company/openings?new=1&challenge=${c.id}`} className="mt-2">Use in an opening</Button>
        </div>
      </div>
    </Card>
  );
}
