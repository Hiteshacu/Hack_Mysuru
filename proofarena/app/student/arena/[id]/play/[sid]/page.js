'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Timer, Lightbulb, Play, Send, FileCode2, Lock, FilePlus2, Terminal, CheckCircle2, XCircle, Crown, Bug, MessageCircle,
  LoaderCircle, Save, Trophy, ArrowRight, Radio, Handshake, TrendingUp,
} from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Button, Pill, BadgeIcon, cx } from '@/components/ui';
import { standing, TOP_N } from '@/lib/selectors';
import { DiffView } from '@/components/dossier';
import { api, formatDuration } from '@/lib/client';
import { toast } from '@/components/toast';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="grid place-items-center h-full text-slate-400 text-sm">Loading VS Code editor…</div>,
});

const ICONS = { 'bug-hunt': Bug, 'fix-review': MessageCircle, 'plot-twist': Crown };
const LANG = { js: 'javascript', cjs: 'javascript', mjs: 'javascript', json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml' };
const langOf = (p) => LANG[p.split('.').pop()] || 'plaintext';

export default function MissionWorkspace() {
  const { id, sid } = useParams();
  const router = useRouter();
  const { state, refresh } = useShared();
  const [rankBefore, setRankBefore] = useState(null);
  const [view, setView] = useState(null);
  const [files, setFiles] = useState({});
  const [active, setActive] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [output, setOutput] = useState('Press “Run tests” to run the mission tests and your own tests.');
  const [lastRun, setLastRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [hints, setHints] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [newFile, setNewFile] = useState(null);
  const timers = useRef({});
  const pending = useRef({});

  const load = useCallback(async () => {
    const v = await api('GET', `/api/arena/${sid}`);
    setView(v);
    setFiles(Object.fromEntries(v.files.map((f) => [f.path, f])));
    setHints(v.mission.hintsShown);
    setElapsed(v.session.elapsedSec);
    setActive((a) => a || v.files.find((f) => f.readOnly)?.path || v.files[0]?.path);
  }, [sid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!view || view.session.status !== 'active') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [view]);

  const saveNow = useCallback(async (path) => {
    const content = pending.current[path];
    if (content === undefined) return;
    delete pending.current[path];
    clearTimeout(timers.current[path]);
    setSaveState('saving');
    try {
      await api('POST', `/api/arena/${sid}`, { action: 'save', path, content });
      setSaveState(Object.keys(pending.current).length ? 'unsaved' : 'saved');
    } catch {
      setSaveState('unsaved');
    }
  }, [sid]);

  const flush = useCallback(async () => {
    await Promise.all(Object.keys(pending.current).map(saveNow));
  }, [saveNow]);

  function onEdit(value) {
    const path = active;
    if (!path || files[path]?.readOnly) return;
    setFiles((fs) => ({ ...fs, [path]: { ...fs[path], content: value } }));
    pending.current[path] = value;
    setSaveState('unsaved');
    clearTimeout(timers.current[path]);
    timers.current[path] = setTimeout(() => saveNow(path), 700);
  }

  async function run() {
    setRunning(true);
    setOutput('Running tests…');
    try {
      await flush();
      const r = await api('POST', `/api/arena/${sid}`, { action: 'run' });
      setOutput(r.output);
      setLastRun(r);
    } finally {
      setRunning(false);
    }
  }

  async function hint() {
    const r = await api('POST', `/api/arena/${sid}`, { action: 'hint' });
    setHints(r.hints);
    toast('Hint unlocked (−50 XP when you clear the mission)');
  }

  async function submit() {
    setRankBefore(state ? standing(state, 'hitesh')?.rank ?? null : null);
    setSubmitting(true);
    try {
      await flush();
      const r = await api('POST', `/api/arena/${sid}`, { action: 'submit' });
      setResult(r);
      if (r.passed) {
        const confetti = (await import('canvas-confetti')).default;
        confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 }, colors: ['#fbbf24', '#a78bfa', '#34d399', '#ffffff'] });
        refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function createFile(e) {
    e.preventDefault();
    const path = newFile.trim();
    if (!/^(tests|src)\/[\w\-./]+\.js$/.test(path)) {
      toast('Use a path like tests/boundary.test.js', 'error');
      return;
    }
    const content = path.startsWith('tests/')
      ? "const test = require('node:test');\nconst assert = require('node:assert');\nconst { createServer } = require('../src/server');\n\ntest('my new test', async () => {\n  \n});\n"
      : '';
    await api('POST', `/api/arena/${sid}`, { action: 'save', path, content });
    setFiles((fs) => ({ ...fs, [path]: { path, content, readOnly: false } }));
    setActive(path);
    setNewFile(null);
  }

  if (!view) {
    return (
      <div className="flex-1 grid place-items-center bg-[#0f1117] text-slate-400 min-h-screen">
        <div className="grid justify-items-center gap-2">
          <LoaderCircle className="size-6 animate-spin" />
          Preparing your workspace: copying your project and planting the mission…
        </div>
      </div>
    );
  }

  const m = view.mission;
  const Icon = ICONS[m.id] || Radio;
  const remaining = m.minutes * 60 - elapsed;
  const finished = view.session.status !== 'active';
  const paths = Object.keys(files).sort();
  const groups = paths.reduce((acc, p) => {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
    (acc[dir] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="h-screen flex flex-col bg-[#0f1117] text-slate-200 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 bg-[#151823] shrink-0">
        <Link href={`/student/arena/${id}`} className="p-2 rounded-lg hover:bg-white/10" aria-label="Back to the map">
          <ArrowLeft className="size-4" />
        </Link>
        <div className={cx('grid place-items-center size-8 rounded-lg', m.boss ? 'bg-amber-400 text-amber-950' : 'bg-violet-600 text-white')}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-slate-400">Level {m.level}{m.boss ? ' · Boss' : ''} · +{m.xp} XP</div>
          <div className="font-display font-bold truncate">{m.title}: {m.story.headline}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm tabular', remaining < 0 ? 'bg-rose-500/20 text-rose-300' : remaining < 300 ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10')}>
            <Timer className="size-4" />
            {remaining < 0 ? `+${formatDuration(-remaining)} over` : formatDuration(remaining)}
          </span>
          <span className="hidden md:inline-flex items-center gap-1 text-xs text-slate-400 w-20">
            {saveState === 'saving' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'Unsaved'}
          </span>
          <Button size="sm" variant="dark-ghost" icon={Lightbulb} onClick={hint} disabled={finished || hints.length >= m.hintCount}>
            Hint {hints.length}/{m.hintCount}
          </Button>
          <Button size="sm" variant="dark-outline" icon={Play} loading={running} onClick={run} disabled={finished}>
            Run tests
          </Button>
          <Button size="sm" variant="gold" icon={Send} loading={submitting} onClick={submit} disabled={finished}>
            Submit fix
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[300px_210px_1fr] min-h-0">
        {/* Mission brief */}
        <aside className="border-r border-white/10 overflow-y-auto p-4 grid gap-4 content-start bg-[#131620]">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-rose-300 font-bold inline-flex items-center gap-1"><Radio className="size-3.5" />Incoming · {m.story.from}</div>
            <div className="font-display text-xl font-bold mt-1">{m.story.headline}</div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{m.story.message}</p>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">{m.id === 'plot-twist' ? 'Examples' : 'Server log'}</div>
            <pre className="rounded-lg bg-black/40 ring-1 ring-white/10 p-3 text-[11px] leading-5 font-mono text-rose-200 whitespace-pre-wrap">{m.story.logs.join('\n')}</pre>
          </div>
          <div className="rounded-xl bg-violet-500/10 ring-1 ring-violet-400/30 p-3 text-sm">
            <div className="text-[11px] uppercase tracking-widest text-violet-300 font-bold mb-1">Your goal</div>
            {m.goal}
          </div>
          {hints.length > 0 && (
            <div className="grid gap-2">
              {hints.map((h, i) => (
                <div key={i} className="rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-3 text-sm text-amber-100 flex gap-2">
                  <Lightbulb className="size-4 shrink-0 mt-0.5" />
                  {h}
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-slate-500">
            Graded on a clean copy with fresh official tests, so editing the mission test won&apos;t help. All the old tests must keep passing too.
          </div>
        </aside>

        {/* Files */}
        <nav className="border-r border-white/10 overflow-y-auto py-3 text-[13px] bg-[#11141c]" aria-label="Files">
          <div className="px-3 pb-2 text-[11px] uppercase tracking-widest text-slate-500 flex justify-between items-center">
            Your project
            <button onClick={() => setNewFile('tests/boundary.test.js')} className="p-1 rounded hover:bg-white/10" title="New file" aria-label="New file">
              <FilePlus2 className="size-3.5" />
            </button>
          </div>
          {newFile !== null && (
            <form onSubmit={createFile} className="px-2 pb-2">
              <input id="new-file" autoFocus value={newFile} onChange={(e) => setNewFile(e.target.value)} onBlur={() => setTimeout(() => setNewFile(null), 150)} className="w-full rounded bg-black/40 ring-1 ring-violet-400 px-2 py-1 text-xs font-mono outline-none" />
            </form>
          )}
          {Object.entries(groups).map(([dir, list]) => (
            <div key={dir} className="mb-1">
              {dir !== '.' && <div className="px-3 py-1 text-slate-500 font-mono text-[11px]">{dir}/</div>}
              {list.map((p) => (
                <button
                  key={p}
                  onClick={() => setActive(p)}
                  className={cx(
                    'w-full text-left flex items-center gap-1.5 py-1 font-mono text-xs truncate',
                    dir === '.' ? 'px-3' : 'pl-5 pr-2',
                    active === p ? 'bg-violet-500/20 text-white' : 'text-slate-300 hover:bg-white/5',
                  )}
                >
                  {files[p].readOnly ? <Lock className="size-3.5 text-amber-300 shrink-0" /> : <FileCode2 className="size-3.5 text-slate-500 shrink-0" />}
                  <span className="truncate">{p.split('/').pop()}</span>
                  {pending.current[p] !== undefined && <span className="size-1.5 rounded-full bg-amber-300 ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Editor + terminal */}
        <section className="grid grid-rows-[auto_1fr_230px] min-w-0 min-h-0">
          <div className="flex items-center gap-2 px-4 h-9 border-b border-white/10 bg-[#151823] text-xs font-mono text-slate-400">
            {active}
            {files[active]?.readOnly && <Pill color="amber" icon={Lock}>mission test · read-only</Pill>}
          </div>
          <div className="min-h-0">
            {active && (
              <Editor
                key={active}
                theme="vs-dark"
                path={active}
                language={langOf(active)}
                value={files[active]?.content}
                onChange={onEdit}
                options={{ minimap: { enabled: false }, fontSize: 13, readOnly: finished || files[active]?.readOnly, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
              />
            )}
          </div>
          <div className="border-t border-white/10 bg-[#0b0d12] grid grid-rows-[auto_1fr] min-h-0">
            <div className="flex items-center gap-3 px-4 h-9 border-b border-white/10 text-xs">
              <span className="inline-flex items-center gap-1 text-slate-400"><Terminal className="size-3.5" />Terminal</span>
              {lastRun && (
                <>
                  <Pill color={lastRun.mission.passed === lastRun.mission.total ? 'green' : 'rose'}>Mission {lastRun.mission.passed}/{lastRun.mission.total}</Pill>
                  <Pill color={lastRun.own.passed === lastRun.own.total ? 'green' : 'rose'}>Your tests {lastRun.own.passed}/{lastRun.own.total}</Pill>
                </>
              )}
            </div>
            <pre className="overflow-auto p-4 font-mono text-[12px] leading-5 text-slate-300 whitespace-pre-wrap">
              {output.split('\n').map((l, i) => (
                <div key={i} className={cx(/^\s*✔/.test(l) && 'text-emerald-400', /^\s*✖/.test(l) && 'text-rose-400', /^──/.test(l) && 'text-violet-300 font-bold')}>
                  {l || ' '}
                </div>
              ))}
            </pre>
          </div>
        </section>
      </div>

      {result && (
        <ResultModal
          result={result}
          mission={m}
          rankBefore={rankBefore}
          now={state ? standing(state, 'hitesh') : null}
          onClose={() => setResult(null)}
          onMap={() => router.push(`/student/arena/${id}`)}
        />
      )}
      {finished && !result && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold shadow-lg">
          Mission cleared. <Link href={`/student/arena/${id}`} className="underline">Back to the map</Link>
        </div>
      )}
    </div>
  );
}

function RankLine({ before, now }) {
  if (!now?.reviewed) return null;
  const climbed = before && now.rank < before;
  return (
    <div className={cx('rounded-2xl p-4 flex items-center gap-4 fade-up', now.unlocked ? 'bg-gradient-to-r from-amber-400/25 to-emerald-400/15 ring-1 ring-amber-300/40' : 'bg-white/5')}>
      <div className="grid place-items-center size-12 rounded-xl bg-white/10">
        {now.unlocked ? <Handshake className="size-6 text-amber-300" /> : <TrendingUp className="size-6 text-violet-300" />}
      </div>
      <div className="flex-1">
        <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">{now.challenge?.title} leaderboard</div>
        <div className="font-display text-xl font-extrabold text-white">
          {climbed ? (
            <>
              #{before} <ArrowRight className="inline size-5 text-amber-300" /> #{now.rank}
            </>
          ) : (
            <>#{now.rank} of {now.total}</>
          )}
        </div>
        <div className="text-sm text-slate-300">
          {now.unlocked ? `Top ${TOP_N}! HR Connect is unlocked.` : `${now.gap} more point${now.gap === 1 ? '' : 's'} to reach the top ${TOP_N} and unlock HR Connect.`}
        </div>
      </div>
    </div>
  );
}

function ResultModal({ result, mission, rankBefore, now, onClose, onMap }) {
  const r = result;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="pop-in w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#171a26] ring-1 ring-white/15 p-6 grid gap-5 text-slate-200">
        {r.passed ? (
          <div className="grid justify-items-center text-center gap-2">
            <div className="grid place-items-center size-16 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950">
              <Trophy className="size-8" />
            </div>
            <div className="font-display text-3xl font-extrabold text-white">{mission.boss ? 'Boss defeated!' : 'Mission cleared!'}</div>
            <div className="text-slate-400 text-sm">
              {r.missionTests.passed}/{r.missionTests.total} mission tests · {r.hiddenTests.passed}/{r.hiddenTests.total} hidden tests · 0 regressions · {formatDuration(r.durationSec)}
            </div>
          </div>
        ) : (
          <div className="grid justify-items-center text-center gap-2">
            <div className="grid place-items-center size-14 rounded-2xl bg-rose-500/20 text-rose-300">
              <XCircle className="size-8" />
            </div>
            <div className="font-display text-2xl font-extrabold text-white">Not yet</div>
            <div className="text-slate-400 text-sm">The official tests ran on a clean copy of your code. Fix these and submit again.</div>
          </div>
        )}

        <div className="grid gap-1.5">
          {r.missionTests.tests.map((t) => (
            <div key={t.name} className={cx('flex items-center gap-2 text-sm rounded-lg px-3 py-1.5', t.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200')}>
              {t.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {t.name}
            </div>
          ))}
          {r.regressions.map((name) => (
            <div key={name} className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 bg-rose-500/10 text-rose-200">
              <XCircle className="size-4" /> Broke an old test: {name}
            </div>
          ))}
        </div>

        {r.passed && <RankLine before={rankBefore} now={now} />}

        {r.passed && r.xp && (
          <div className="rounded-2xl bg-white/5 p-4 grid gap-1.5">
            {r.xp.lines.map((l) => (
              <div key={l.label} className="flex justify-between text-sm">
                <span>{l.label}</span>
                <span className={cx('font-bold tabular', l.xp < 0 ? 'text-rose-300' : 'text-amber-300')}>{l.xp > 0 ? '+' : ''}{l.xp} XP</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/10 pt-2 mt-1 font-bold">
              <span>Total</span>
              <span className="text-amber-300 tabular">+{r.xp.total} XP</span>
            </div>
          </div>
        )}

        {r.newBadges?.length > 0 && (
          <div className="grid justify-items-center gap-2">
            <div className="text-xs uppercase tracking-widest text-amber-300 font-bold">New badges</div>
            <div className="flex flex-wrap justify-center gap-3 [&_span]:text-slate-200">
              {r.newBadges.map((b) => (
                <BadgeIcon key={b.id} badge={b} />
              ))}
            </div>
          </div>
        )}

        {r.passed && (
          <div className="grid gap-2">
            <div className="text-sm text-slate-400">
              You changed <b className="text-white">{r.srcFilesChanged}</b> source file{r.srcFilesChanged === 1 ? '' : 's'}
              {mission.id === 'plot-twist' && (r.srcFilesChanged <= 2 ? '. Small footprint: your design absorbed the change well.' : '. A design with rules in one place would need fewer.')}
              {mission.id === 'bug-hunt' && (r.blindSpotClosed ? '. Your new test catches the planted bug. Blind spot closed.' : '. Tip: add a test that books the exact last seat.')}
            </div>
            <div className="[&_*]:!text-[11px] bg-white rounded-xl text-ink">
              {r.changes.map((c) => (
                <DiffView key={c.path} change={c} />
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {r.passed ? (
            <Button variant="gold" onClick={onMap}>
              Back to the map <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="gold" onClick={onClose}>Keep going</Button>
          )}
        </div>
      </div>
    </div>
  );
}
