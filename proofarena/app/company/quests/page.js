'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Gamepad2, Plus, Megaphone, Play, ListChecks, Crosshair, Bug, Code2, Users, Trophy, RotateCcw, Download } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, Empty, SectionTitle, Avatar } from '@/components/ui';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

const SKIP_LABEL = { mcq: 'Gate Quiz', arrow: 'Arrow Range', snake: 'Snake Debug', debug: 'Debug Den', dsa: 'Algorithm Grove' };
const STAGE_LABEL = { mcq: 'Gate Quiz', arrow: 'Arrow Range', debug: 'Debug Den', dsa: 'Algorithm Grove', done: 'Finished' };

const STAGES = [
  { icon: ListChecks, label: 'Gate Quiz', detail: '5 MCQs in one window' },
  { icon: Crosshair, label: 'Arrow Range', detail: 'Skill archery · earns the rifle' },
  { icon: Bug, label: 'Debug Den', detail: 'Fix a planted bug' },
  { icon: Code2, label: 'Algorithm Grove', detail: 'DSA problem, hidden tests' },
];

export default function Quests() {
  const { state, refresh } = useShared();
  const [resetting, setResetting] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const mine = state.quests.filter((q) => q.companyId === state.activeCompanyId);
  const reset = async (q) => {
    if (!confirm(`Reset every student's progress on "${q.title}"? They can play it again from the start.`)) return;
    setResetting(q.id);
    try {
      const r = await api('DELETE', `/api/quests/${q.id}`);
      toast(`Progress reset (${r.removed} player${r.removed === 1 ? '' : 's'})`);
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setResetting(null);
    }
  };

  // The full answer key (quiz, arrows, snake, debug fix, DSA solution) as a text file, for the company only.
  const downloadAnswers = async (q) => {
    setDownloading(q.id);
    try {
      const res = await fetch(`/api/quests/${q.id}/answers`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not download the answers');
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `${q.id}-answers.txt`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Answer key downloaded');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="grid gap-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">3D Quests</div>
          <h1 className="font-display text-3xl font-extrabold">Hire through a 3D world</h1>
          <p className="text-slate-600 mt-1 max-w-2xl">
            Add the skills and job description. AI writes the quiz, the arrow-range rounds, a debugging bug and a DSA problem. Students play them as stations in a 3D valley, and finishers reach your job links in the Community Camp.
          </p>
        </div>
        <Button href="/company/quests/new" icon={Plus}>Create 3D Quest</Button>
      </div>

      <Card className="p-5 grid gap-3 md:grid-cols-4 bg-gradient-to-br from-[#1a1033] to-[#2a1a52] text-white ring-0">
        {STAGES.map((s, i) => (
          <div key={s.label} className="flex gap-3 items-start fade-up" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="grid place-items-center size-10 rounded-xl bg-white/10 text-amber-300 shrink-0">
              <s.icon className="size-5" />
            </div>
            <div>
              <div className="text-xs text-violet-200">Stage {i + 1}</div>
              <div className="font-semibold">{s.label}</div>
              <div className="text-xs text-violet-200">{s.detail}</div>
            </div>
          </div>
        ))}
      </Card>

      {mine.length === 0 ? (
        <Card>
          <Empty icon={Gamepad2} title="No quests yet">Create your first 3D Quest. It takes about a minute with AI.</Empty>
          <div className="pb-6 grid place-items-center">
            <Button href="/company/quests/new" icon={Plus}>Create 3D Quest</Button>
          </div>
        </Card>
      ) : (
        <section className="grid gap-4">
          <SectionTitle title="Your quests" />
          {mine.map((q) => {
            const runs = state.questRuns.filter((r) => r.questId === q.id);
            const done = runs.filter((r) => r.stage === 'done');
            const sent = state.notifications.filter((n) => n.questId === q.id).reduce((a, n) => a + n.deliveries.length, 0);
            return (
              <Card key={q.id} className="p-5 grid gap-3 tilt">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl font-bold">{q.title}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {q.skills.map((s) => (
                        <Pill key={s}>{s}</Pill>
                      ))}
                      <Pill color="amber">Pass: {q.passMark}/5 MCQs</Pill>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" icon={Download} loading={downloading === q.id} onClick={() => downloadAnswers(q)}>Download answers</Button>
                    <Button size="sm" variant="outline" icon={Megaphone} href={`/company/notify?quest=${q.id}`}>Notify students</Button>
                    <Button size="sm" icon={Play} href={`/quest/index.html?quest=${q.id}&student=hitesh`}>Play as Hitesh</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1"><Megaphone className="size-4" />{sent} invited</span>
                  <span className="inline-flex items-center gap-1"><Users className="size-4" />{runs.length} playing</span>
                  <span className="inline-flex items-center gap-1"><Trophy className="size-4" />{done.length} finished</span>
                  <span className="text-xs text-slate-400">Content: {Object.entries(q.source || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
                </div>
                {runs.length > 0 && (
                  <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Player</th>
                          <th className="px-3 py-2">Stage</th>
                          <th className="px-3 py-2">Attempts (quiz · range · debug · DSA)</th>
                          <th className="px-3 py-2 text-right">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...runs].sort((a, b) => b.points - a.points).map((r) => {
                          const s = state.students.find((x) => x.id === r.studentId);
                          const a = r.attempts || {};
                          const many = Object.values(a).some((n) => n >= 4);
                          return (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="px-3 py-2"><span className="inline-flex items-center gap-2">{s && <Avatar person={s} size={24} />}{s?.name || r.studentId}</span></td>
                              <td className="px-3 py-2">{r.stage === 'done' ? <Pill color="green">Finished</Pill> : STAGE_LABEL[r.stage]}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {[a.mcq, a.arrow, a.debug, a.dsa].map((n) => n || 0).join(' · ')}
                                {many && <span className="ml-2 text-xs text-amber-700" title="Many retries on a stage: worth a closer look in the interview">many retries</span>}
                                {r.skipped?.length > 0 && (
                                  <span className="ml-2 text-xs text-rose-700" title="Skipped games give 0 points">skipped: {r.skipped.map((k) => SKIP_LABEL[k] || k).join(', ')}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.points}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div>
                  <button onClick={() => reset(q)} disabled={resetting === q.id || runs.length === 0} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 disabled:opacity-40">
                    <RotateCcw className="size-3.5" /> {resetting === q.id ? 'Resetting…' : 'Reset players (to demo it again)'}
                  </button>
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
