'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X, Send, Bot, FileCode2, Plus, ArrowLeft, Mic, Sparkles, Swords } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Avatar, Pill, SectionTitle, Loading, Field, inputCls, cx, SEVERITY } from '@/components/ui';
import { CodeViewer, InlineComment } from '@/components/code-viewer';
import { PipelineProgress } from '@/components/pipeline';
import { ChecksSummary } from '@/components/checks';
import { api } from '@/lib/client';
import { byId, STATUS_LABEL, missionDef } from '@/lib/selectors';
import { toast } from '@/components/toast';

const RUBRIC = [
  { key: 'design', label: 'Design', hint: 'Structure, separation, ease of change' },
  { key: 'code', label: 'Code quality', hint: 'Readable, consistent, no surprises' },
  { key: 'testing', label: 'Testing', hint: 'Meaningful tests, edge cases' },
  { key: 'docs', label: 'Docs & decisions', hint: 'README, architecture, decision log' },
];

export default function ReviewWorkspace() {
  const { id } = useParams();
  const { state, refresh } = useShared();
  const sub = state.submissions.find((s) => s.id === id);
  if (!sub) return <Loading />;
  const student = byId(state.students, sub.studentId);
  const status = STATUS_LABEL[sub.status];

  return (
    <div className="grid grid-cols-1 gap-5 max-w-[1400px]">
      <Link href="/company/reviews" className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-4" /> Review queue
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar person={student} size={52} />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-extrabold">{student.name} · Palace Pass</h1>
          <div className="text-sm text-slate-500">
            {student.college} · {sub.sourceKind === 'github' ? 'GitHub' : 'Local folder'} <span className="font-mono">{sub.source}</span> {sub.commit && <>· commit <span className="font-mono">{sub.commit}</span></>}
          </div>
        </div>
        <Pill color={status.color}>{status.label}</Pill>
      </div>

      {sub.status === 'checking' || sub.status === 'failed' ? (
        <Card className="p-6 max-w-2xl">
          <SectionTitle eyebrow="Phase 1" title="Automated checks are running" />
          <p className="text-sm text-slate-500 mt-1 mb-4">The review workspace opens when they finish.</p>
          <PipelineProgress sub={sub} />
        </Card>
      ) : sub.status === 'awaiting_review' ? (
        <ReviewEditor sub={sub} refresh={refresh} />
      ) : (
        <ReviewDone sub={sub} state={state} refresh={refresh} />
      )}
    </div>
  );
}

function useFiles(id) {
  const [files, setFiles] = useState(null);
  useEffect(() => {
    fetch(`/api/submissions/${id}/files`).then((r) => r.json()).then((j) => setFiles(j.files || {}));
  }, [id]);
  return files;
}

function ReviewEditor({ sub, refresh }) {
  const files = useFiles(sub.id);
  const router = useRouter();
  const withComments = useMemo(() => [...new Set(sub.comments.map((c) => c.file))], [sub.comments]);
  const [active, setActive] = useState(null);
  const [focus, setFocus] = useState(null);
  const [rubric, setRubric] = useState({ design: 7, code: 7, testing: 6, docs: 8 });
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const current = active || withComments[0] || 'README.md';
  const drafts = sub.comments.filter((c) => c.status === 'draft').length;

  async function setStatus(c, status) {
    await api('POST', `/api/submissions/${sub.id}/review`, { action: 'comment', commentId: c.id, status });
    refresh();
  }
  async function confirmAll() {
    for (const c of sub.comments.filter((x) => x.status === 'draft')) {
      await api('POST', `/api/submissions/${sub.id}/review`, { action: 'comment', commentId: c.id, status: 'confirmed' });
    }
    refresh();
  }
  async function publish() {
    setPublishing(true);
    try {
      await api('POST', `/api/submissions/${sub.id}/review`, { action: 'publish', rubric, note });
      toast('Review published. The Live Round is unlocked for the student.');
      await refresh();
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  const actions = (c) =>
    c.source !== 'reviewer' && (
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant={c.status === 'confirmed' ? 'success' : 'outline'} icon={Check} onClick={() => setStatus(c, 'confirmed')}>
          Confirm
        </Button>
        <Button size="sm" variant={c.status === 'rejected' ? 'dark' : 'outline'} icon={X} onClick={() => setStatus(c, 'rejected')}>
          Reject
        </Button>
      </div>
    );

  if (!files) return <Loading label="Loading code…" />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-3 content-start min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(files)
            .filter((p) => !p.startsWith('.'))
            .sort((a, b) => (withComments.includes(b) ? 1 : 0) - (withComments.includes(a) ? 1 : 0))
            .map((p) => {
              const n = sub.comments.filter((c) => c.file === p).length;
              return (
                <button
                  key={p}
                  onClick={() => {
                    setActive(p);
                    setFocus(null);
                  }}
                  className={cx('rounded-lg px-2.5 py-1 text-xs font-mono ring-1 inline-flex items-center gap-1.5', current === p ? 'bg-ink text-white ring-ink' : 'bg-white ring-slate-200 text-slate-600')}
                >
                  <FileCode2 className="size-3.5" />
                  {p}
                  {n > 0 && <span className={cx('rounded-full px-1.5 text-[10px] font-bold', current === p ? 'bg-gold' : 'bg-amber-100 text-amber-800')}>{n}</span>}
                </button>
              );
            })}
        </div>
        <CodeViewer path={current} content={files[current]} comments={sub.comments.filter((c) => c.file === current)} focusLine={focus} renderActions={actions} />
      </div>

      <div className="grid gap-4 content-start">
        <Card className="p-5 grid gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-gold" /> AI summary <Pill>{sub.aiEngine}</Pill>
          </div>
          <p className="text-sm text-slate-600">{sub.aiSummary}</p>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Machine checks" />
          <div className="mt-3">
            <ChecksSummary checks={sub.checks} />
          </div>
        </Card>

        <Card className="p-5 grid gap-3">
          <SectionTitle
            title={`Comments (${sub.comments.length})`}
            action={
              drafts > 0 && (
                <Button size="sm" variant="outline" onClick={confirmAll}>
                  Confirm all
                </Button>
              )
            }
          />
          <div className="text-xs text-slate-500">{drafts ? `${drafts} AI drafts still need a decision.` : 'Every comment has a decision.'}</div>
          <ul className="grid gap-1.5">
            {sub.comments.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setActive(c.file);
                    setFocus(c.line);
                  }}
                  className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 text-sm"
                >
                  <span className={cx('size-2 rounded-full shrink-0', SEVERITY[c.severity]?.bar)} />
                  <span className={cx('flex-1 truncate', c.status === 'rejected' && 'line-through text-slate-400')}>{c.title}</span>
                  {c.mission && c.status !== 'rejected' && <Swords className="size-3.5 text-violet-600" />}
                  {c.status === 'draft' ? <Bot className="size-3.5 text-slate-400" /> : c.status === 'confirmed' ? <Check className="size-3.5 text-emerald-600" /> : <X className="size-3.5 text-slate-400" />}
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <AddComment sub={sub} file={current} onDone={() => { setAdding(false); refresh(); }} />
          ) : (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              Add your own comment on {current}
            </Button>
          )}
        </Card>

        <Card className="p-5 grid gap-4">
          <SectionTitle title="Rubric" />
          {RUBRIC.map((r) => (
            <div key={r.key} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{r.label}</span>
                <span className="tabular font-bold">{rubric[r.key]}/10</span>
              </div>
              <input
                id={`rubric-${r.key}`}
                type="range"
                min={1}
                max={10}
                value={rubric[r.key]}
                onChange={(e) => setRubric({ ...rubric, [r.key]: Number(e.target.value) })}
                className="accent-indigo-700"
                aria-label={r.label}
              />
              <span className="text-xs text-slate-500">{r.hint}</span>
            </div>
          ))}
          <Field label="Note to the student">
            <textarea id="review-note" rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Good layering. Look at validation before anything else." />
          </Field>
          <Button icon={Send} loading={publishing} disabled={drafts > 0} onClick={publish}>
            Publish review &amp; unlock Live Round
          </Button>
          {drafts > 0 && <div className="text-xs text-amber-700 -mt-2">Confirm or reject the AI drafts first.</div>}
        </Card>
      </div>
    </div>
  );
}

function AddComment({ sub, file, onDone }) {
  const [form, setForm] = useState({ line: 1, title: '', body: '', severity: 'medium' });
  async function save(e) {
    e.preventDefault();
    await api('POST', `/api/submissions/${sub.id}/review`, { action: 'add', file, ...form });
    toast('Comment added');
    onDone();
  }
  return (
    <form onSubmit={save} className="grid gap-2 rounded-xl bg-slate-50 p-3">
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <input id="add-line" type="number" min={1} className={inputCls} value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} aria-label="Line" />
        <select id="add-sev" className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} aria-label="Severity">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="good">Strength</option>
        </select>
      </div>
      <input id="add-title" className={inputCls} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea id="add-body" rows={2} className={inputCls} placeholder="What should the student know?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" type="submit">Add</Button>
      </div>
    </form>
  );
}

function ReviewDone({ sub, state, refresh }) {
  const student = byId(state.students, sub.studentId);
  const viva = sub.viva;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-5 content-start">
        {viva?.submittedAt && <VivaScoring sub={sub} refresh={refresh} />}
        <Card className="p-5 grid gap-3">
          <SectionTitle title="Live Round progress" />
          <div className="grid gap-2">
            {sub.missions.map((m) => {
              const def = missionDef(state, sub.challengeId, m.id);
              const color = { passed: 'green', skipped: 'slate', ready: 'violet', locked: 'slate', submitted: 'amber' }[m.status] || 'slate';
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className="font-semibold flex-1">Level {def.level} · {def.title}</span>
                  {m.result?.durationSec != null && <span className="text-slate-500 tabular">{Math.round(m.result.durationSec / 60)} min</span>}
                  {m.result?.srcFilesChanged != null && m.id !== 'viva' && <span className="text-slate-500">{m.result.srcFilesChanged} src file(s)</span>}
                  <Pill color={color}>{m.status === 'submitted' ? 'waiting for you' : m.status}</Pill>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" href={`/company/candidates/${student.id}`}>Open {student.name}&apos;s full dossier</Button>
            {!sub.sample && sub.status !== 'complete' && (
              <Button variant="dark" href={sub.track === 'review' ? `/student/viva/${sub.id}` : `/student/arena/${sub.id}`} className="bg-violet-700 hover:bg-violet-800">
                {sub.track === 'review' ? 'Switch to student · answer the viva' : 'Switch to student · play the Live Round'}
              </Button>
            )}
          </div>
        </Card>
        <Card className="p-5 grid gap-2">
          <SectionTitle title="Confirmed review comments" />
          {sub.comments.filter((c) => c.status === 'confirmed').map((c) => (
            <InlineComment key={c.id} comment={c} compact />
          ))}
        </Card>
      </div>
      <Card className="p-5 content-start">
        <SectionTitle title="Machine checks" />
        <div className="mt-3">
          <ChecksSummary checks={sub.checks} />
        </div>
      </Card>
    </div>
  );
}

function VivaScoring({ sub, refresh }) {
  const viva = sub.viva;
  const [scores, setScores] = useState(() => viva.scoredAt ? viva.scores : { ...viva.suggested });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api('POST', `/api/viva/${sub.id}`, { action: 'score', scores });
      toast('Viva scored. The profile is now fully verified.');
      refresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="p-5 grid gap-4 ring-2 ring-violet-200">
      <SectionTitle eyebrow="Level 4" title={<span className="inline-flex items-center gap-2"><Mic className="size-5 text-violet-600" />Viva answers</span>} />
      {viva.questions.map((q) => (
        <div key={q.id} className="grid gap-2 rounded-xl bg-slate-50 p-4">
          <div className="text-sm font-semibold">{q.q}</div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-white p-3 ring-1 ring-slate-200">{viva.answers[q.id]}</p>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                disabled={Boolean(viva.scoredAt)}
                onClick={() => setScores({ ...scores, [q.id]: n })}
                className={cx('size-9 rounded-lg font-bold ring-1', scores[q.id] === n ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white ring-slate-300')}
              >
                {n}
              </button>
            ))}
            {!viva.scoredAt && <span className="text-xs text-slate-500">Suggested: {viva.suggested?.[q.id]} (based on detail and whether they name their own code)</span>}
          </div>
        </div>
      ))}
      {!viva.scoredAt ? (
        <Button onClick={save} loading={saving}>Save viva scores</Button>
      ) : (
        <Pill color="green">Scored</Pill>
      )}
    </Card>
  );
}
