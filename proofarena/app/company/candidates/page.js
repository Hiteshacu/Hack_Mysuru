'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, TrendingUp, ShieldCheck, ArrowRight, Users } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Avatar, Pill, SectionTitle, inputCls, Empty, cx } from '@/components/ui';
import { candidates, isRising } from '@/lib/selectors';

const SKILLS = ['Correctness', 'Debugging', 'Design', 'Testing', 'Communication'];

export default function Candidates() {
  const { state } = useShared();
  const [q, setQ] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [skill, setSkill] = useState('');
  const [skillMin, setSkillMin] = useState(70);
  const all = candidates(state);
  const invited = new Set(state.invites.filter((i) => i.companyId === state.activeCompanyId).map((i) => i.studentId));

  const match = (c) =>
    (!q || `${c.student.name} ${c.student.college}`.toLowerCase().includes(q.toLowerCase())) &&
    c.sub.score.total >= minScore &&
    (!skill || (c.sub.score.skills[skill] ?? -1) >= skillMin);
  const verified = all.filter((c) => !isRising(c)).filter(match);
  const rising = all.filter(isRising).filter(match);

  return (
    <div className="grid gap-6 max-w-6xl">
      <div>
        <div className="text-sm text-slate-500">Candidates</div>
        <h1 className="font-display text-3xl font-extrabold">Find proven engineers</h1>
        <p className="text-slate-600 mt-1">Ranked by Verified Score. Stars, likes and resumes are not counted.</p>
      </div>

      <Card className="p-4 grid gap-4 md:grid-cols-[1.2fr_1fr_1.4fr] items-end">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Search</span>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-2.5 text-slate-400" />
            <input id="cand-search" className={cx(inputCls, 'pl-9')} placeholder="Name or college" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Min Verified Score: {minScore}</span>
          <input id="cand-min" type="range" min={0} max={95} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="accent-indigo-700" />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2 text-sm">
          <label className="grid gap-1">
            <span className="font-semibold">Must be strong in</span>
            <select id="cand-skill" className={inputCls} value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">Any skill</option>
              {SKILLS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">≥</span>
            <input id="cand-skill-min" type="number" min={0} max={100} className={inputCls} value={skillMin} onChange={(e) => setSkillMin(Number(e.target.value))} disabled={!skill} />
          </label>
        </div>
      </Card>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Fully verified" title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600" />Leaderboard</span>} />
        <Card className="divide-y divide-slate-100">
          {verified.length === 0 && <Empty icon={Users} title="No one matches these filters">Try a lower score or a different skill.</Empty>}
          {verified.map((c, i) => (
            <Row key={c.student.id} c={c} rank={i + 1} invited={invited.has(c.student.id)} />
          ))}
        </Card>
      </section>

      <section className="grid gap-3">
        <SectionTitle eyebrow="Still in the Live Round" title={<span className="inline-flex items-center gap-2"><TrendingUp className="size-5 text-sky-600" />Rising</span>} />
        <p className="text-sm text-slate-500 -mt-2">New candidates with a strong start. Shown separately so one good result can&apos;t top the leaderboard before the rest is proven.</p>
        <Card className="divide-y divide-slate-100">
          {rising.length === 0 && <Empty icon={TrendingUp} title="No rising candidates">Candidates appear here after their code review is published.</Empty>}
          {rising.map((c) => (
            <Row key={c.student.id} c={c} invited={invited.has(c.student.id)} />
          ))}
        </Card>
      </section>
    </div>
  );
}

function Row({ c, rank, invited }) {
  const { student, sub } = c;
  return (
    <Link href={`/company/candidates/${student.id}`} className="grid gap-4 p-4 hover:bg-slate-50 md:grid-cols-[40px_1.3fr_2fr_auto_auto] items-center">
      <span className="font-display text-xl font-extrabold text-slate-300 tabular">{rank ? `#${rank}` : '–'}</span>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar person={student} />
        <div className="min-w-0">
          <div className="font-semibold truncate">{student.name}</div>
          <div className="text-xs text-slate-500 truncate">{student.college}</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {SKILLS.map((s) => {
          const v = sub.score.skills[s];
          return (
            <div key={s} className="grid gap-1" title={`${s}: ${v ?? 'not proven yet'}`}>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={cx('h-full', v == null ? '' : v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${v ?? 0}%` }} />
              </div>
              <span className="text-[10px] text-slate-500 truncate">{s}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {invited && <Pill color="indigo">Invited</Pill>}
        <Pill color="slate">{sub.score.confidence}% test-backed</Pill>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-extrabold tabular">{sub.score.total}</span>
        <ArrowRight className="size-4 text-slate-400" />
      </div>
    </Link>
  );
}
