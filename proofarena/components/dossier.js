'use client';

import { useState } from 'react';
import { Clock, Lightbulb, RotateCcw, FileDiff, Play, Pencil, FlaskConical, Send, Flag, Bug, Crown, MessageCircle, Mic, ShieldCheck, Link2 } from 'lucide-react';
import { Card, ScoreRing, SkillBars, Pill, SectionTitle, Avatar, Bar, BadgeIcon, cx } from '@/components/ui';
import { ChecksSummary } from '@/components/checks';
import { InlineComment } from '@/components/code-viewer';
import { missionDef, profileStats } from '@/lib/selectors';
import { SkillRadar } from '@/components/fx';
import { formatDuration } from '@/lib/client';
import { BADGES } from '@/lib/scoring';

const MISSION_ICONS = { 'bug-hunt': Bug, 'fix-review': MessageCircle, 'plot-twist': Crown, viva: Mic };

// The candidate's verified profile: every number links back to evidence.
export function Dossier({ state, student, sub, side }) {
  const score = sub.score;
  const stats = profileStats(state, student);
  const ch = state.library.find((c) => c.id === sub.challengeId);
  const reviewTrack = sub.track === 'review';
  return (
    <div className="grid gap-5">
      <Card className="p-6 grid gap-6 md:grid-cols-[auto_1fr_auto] items-center">
        <div className="flex items-center gap-4">
          <Avatar person={student} size={64} />
          <div>
            <h1 className="font-display text-3xl font-extrabold">{student.name}</h1>
            <div className="text-slate-500">{student.college} · {student.year}</div>
            <div className="text-sm text-slate-500 inline-flex items-center gap-1"><Link2 className="size-3.5" />{student.github}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-center">
          <Pill color={score.complete ? 'green' : 'sky'} icon={ShieldCheck}>{score.complete ? 'Fully verified' : `Rising · ${score.possible}/100 points proven so far`}</Pill>
          <Pill color="indigo">{score.confidence}% of points from re-runnable tests</Pill>
          <Pill color="violet">Level {student.level.number} · {student.level.name}</Pill>
        </div>
        <ScoreRing score={score.total} size={120} label="Verified" sub="out of 100" />
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          ['Reputation', `${stats.reputation} XP`, 'Earned from missions and reviews'],
          ['Rank', stats.rank ? `#${stats.rank} of ${stats.of}` : '–', 'By Verified Score'],
          ['Signal', stats.signal != null ? `${stats.signal}%` : '–', 'Missions cleared on the first submit'],
          ['Test-backed', `${stats.confidence ?? 0}%`, 'Points from re-runnable tests'],
          ['Challenge', ch?.title || '–', reviewTrack ? 'Company challenge · review track' : 'Verified · full Live Round'],
        ].map(([label, value, hint]) => (
          <Card key={label} className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
            <div className="font-display text-xl font-extrabold tabular truncate">{value}</div>
            <div className="text-[11px] text-slate-500">{hint}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-5 content-start min-w-0">
          <Card className="p-5 grid gap-4">
            <SectionTitle title="Where the score comes from" />
            <div className="grid gap-4 xl:grid-cols-3">
              {[
                ['review', 'Phase 1 · Code review'],
                ['arena', 'Phase 2 · Live Round'],
                ['viva', 'Viva'],
              ].filter(([k]) => score.groups[k].max > 0).map(([k, label]) => {
                const g = score.groups[k];
                return (
                  <div key={k} className="rounded-xl bg-slate-50 p-4 grid gap-2 content-start">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="font-display text-xl font-extrabold tabular">{g.points}<span className="text-sm text-slate-400">/{g.max}</span></span>
                    </div>
                    <Bar value={g.points} max={g.max} />
                    <ul className="grid gap-1 text-xs text-slate-600">
                      {g.parts.length === 0 && <li className="text-slate-400">Not done yet</li>}
                      {g.parts.map((p) => (
                        <li key={p.key} className="flex justify-between gap-2">
                          <span>{p.label}{!p.machine && <span className="text-slate-400"> · human</span>}</span>
                          <span className="tabular">{p.points}/{p.max}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 grid gap-3">
            <SectionTitle title="Live Round evidence" />
            {reviewTrack && <div className="text-sm text-slate-500">This was a company-written challenge (review track): the proof is the code review, the mutation probe and the viva below.</div>}
            {!reviewTrack && sub.missions.length === 0 && <div className="text-sm text-slate-500">The Live Round unlocks after the code review is published.</div>}
            {sub.missions.filter((m) => m.id !== 'viva').map((m) => (
              <MissionEvidence key={m.id} state={state} sub={sub} m={m} />
            ))}
          </Card>

          {sub.viva?.submittedAt && (
            <Card className="p-5 grid gap-3">
              <SectionTitle title="Viva" action={sub.viva.scoredAt ? <Pill color="green">Scored by reviewer</Pill> : <Pill color="amber">Awaiting score</Pill>} />
              {sub.viva.questions.map((q) => (
                <div key={q.id} className="rounded-xl bg-slate-50 p-3 grid gap-1.5 text-sm">
                  <div className="font-semibold">{q.q}</div>
                  <div className="text-slate-700 whitespace-pre-wrap">{sub.viva.answers[q.id]}</div>
                  {sub.viva.scores?.[q.id] && <div className="text-xs font-semibold text-violet-700">Score {sub.viva.scores[q.id]}/5</div>}
                </div>
              ))}
            </Card>
          )}

          <Card className="p-5 grid gap-2">
            <SectionTitle title="Code review (confirmed by a company engineer)" />
            {sub.comments.filter((c) => c.status === 'confirmed').map((c) => (
              <div key={c.id} className="grid gap-1">
                <div className="text-xs font-mono text-slate-500">{c.file}:{c.line}</div>
                <InlineComment comment={c} compact />
              </div>
            ))}
          </Card>
        </div>

        <div className="grid gap-5 content-start">
          {side}
          <Card className="p-5 grid gap-3">
            <SectionTitle title="Proven skills" />
            <SkillRadar skills={score.skills} />
            <SkillBars skills={score.skills} />
          </Card>
          <Card className="p-5">
            <SectionTitle title="Phase 1 facts" />
            <div className="mt-3">
              <ChecksSummary checks={sub.checks} />
            </div>
          </Card>
          <Card className="p-5 grid gap-3">
            <SectionTitle title="Badges" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(BADGES).map(([id, b]) => (
                <BadgeIcon key={id} badge={b} earned={student.badges.includes(id)} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MissionEvidence({ state, sub, m }) {
  const def = missionDef(state, sub.challengeId, m.id);
  const [open, setOpen] = useState(false);
  const Icon = MISSION_ICONS[m.id] || Flag;
  const r = m.result;
  return (
    <div className={cx('rounded-xl ring-1 p-4 grid gap-3', def.boss ? 'ring-amber-200 bg-amber-50/40' : 'ring-slate-200')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cx('grid place-items-center size-9 rounded-xl text-white', def.boss ? 'bg-gold' : 'bg-violet-600')}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Level {def.level} · {def.title}</div>
          <div className="text-xs text-slate-500">{def.kind}</div>
        </div>
        {m.status === 'passed' ? <Pill color="green">Passed</Pill> : m.status === 'skipped' ? <Pill>Nothing to fix</Pill> : <Pill color="slate">{m.status}</Pill>}
      </div>
      {r && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><Clock className="size-4" />{formatDuration(r.durationSec)} of {def.minutes}:00</span>
            <span className="inline-flex items-center gap-1"><RotateCcw className="size-4" />{m.attempts} submit{m.attempts > 1 ? 's' : ''}</span>
            <span className="inline-flex items-center gap-1"><Lightbulb className="size-4" />{r.hintsUsed || 0} hints</span>
            <span className="inline-flex items-center gap-1"><FileDiff className="size-4" />{r.srcFilesChanged} source file{r.srcFilesChanged === 1 ? '' : 's'} changed</span>
            <span className="inline-flex items-center gap-1"><FlaskConical className="size-4" />0 regressions</span>
          </div>
          {m.id === 'bug-hunt' && (
            <div className={cx('text-sm rounded-lg px-3 py-2', r.blindSpotClosed ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-600')}>
              {r.blindSpotClosed ? 'Also wrote a test that catches the planted bug.' : 'Fixed the bug but did not add a test for it.'}
            </div>
          )}
          {(r.events?.length > 0 || r.changes?.length > 0) ? (
            <button className="text-left text-sm font-semibold text-brand inline-flex items-center gap-1" onClick={() => setOpen(!open)}>
              <Play className="size-4" /> {open ? 'Hide replay' : 'Replay how they solved it'}
            </button>
          ) : (
            <div className="text-xs text-slate-400">Replay not recorded for sample data.</div>
          )}
          {open && <Replay result={r} />}
        </>
      )}
    </div>
  );
}

function Replay({ result }) {
  const icons = { start: Play, edit: Pencil, run: FlaskConical, hint: Lightbulb, submit: Send };
  return (
    <div className="grid gap-4">
      <ol className="relative border-l-2 border-slate-200 ml-2 grid gap-2">
        {result.events.map((e, i) => {
          const Icon = icons[e.type] || Play;
          const text =
            e.type === 'edit'
              ? `${e.created ? 'Created' : 'Edited'} ${e.file} (+${e.added} −${e.removed})`
              : e.type === 'run'
                ? `Ran tests: mission ${e.passed}/${e.passed + e.failed}, own ${e.ownPassed}/${e.ownPassed + e.ownFailed}`
                : e.type === 'hint'
                  ? `Used hint ${e.index}`
                  : e.text;
          return (
            <li key={i} className="pl-4 relative text-sm">
              <span className={cx('absolute -left-[9px] top-0.5 grid place-items-center size-4 rounded-full', e.type === 'submit' && e.ok ? 'bg-emerald-500' : e.type === 'submit' ? 'bg-rose-500' : 'bg-slate-300')}>
                <Icon className="size-2.5 text-white" />
              </span>
              <span className="font-mono text-xs text-slate-400 mr-2 tabular">{formatDuration(e.t)}</span>
              {text}
            </li>
          );
        })}
      </ol>
      {result.changes?.map((c) => (
        <DiffView key={c.path} change={c} />
      ))}
    </div>
  );
}

export function DiffView({ change }) {
  const lines = change.patch.split('\n').slice(4);
  return (
    <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 text-xs font-mono flex justify-between">
        <span>{change.path}</span>
        <span><span className="text-emerald-700">+{change.added}</span> <span className="text-rose-700">−{change.removed}</span></span>
      </div>
      <pre className="text-[12px] font-mono leading-5 overflow-x-auto max-h-80">
        {lines.map((l, i) => (
          <div key={i} className={cx('px-3', l.startsWith('+') ? 'bg-emerald-50 text-emerald-900' : l.startsWith('-') ? 'bg-rose-50 text-rose-900' : l.startsWith('@@') ? 'text-indigo-500' : 'text-slate-600')}>
            {l || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
