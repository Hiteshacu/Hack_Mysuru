'use client';

import { useEffect, useRef } from 'react';
import { Bot, UserRound, Swords } from 'lucide-react';
import { Pill, SEVERITY, cx } from '@/components/ui';

const TOKEN = /(\/\/.*$|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|if|else|for|of|in|new|throw|class|extends|async|await|require|module|exports|try|catch|true|false|null|undefined)\b|\b\d+\b)/g;

function highlight(line) {
  const parts = line.split(TOKEN);
  return parts.map((p, i) => {
    if (!p) return null;
    if (i % 2 === 0) return p;
    if (p.startsWith('//')) return <span key={i} className="text-slate-400 italic">{p}</span>;
    if (/^['"`]/.test(p)) return <span key={i} className="text-emerald-700">{p}</span>;
    if (/^\d/.test(p)) return <span key={i} className="text-amber-700">{p}</span>;
    return <span key={i} className="text-violet-700 font-semibold">{p}</span>;
  });
}

// Shows one file with line numbers and review comments under the lines they refer to.
export function CodeViewer({ path, content, comments = [], focusLine, renderActions }) {
  const lines = (content || '').split('\n');
  const byLine = {};
  for (const c of comments) (byLine[c.line] ||= []).push(c);
  const focusRef = useRef(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusLine, path]);

  return (
    <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-mono text-xs text-slate-600">{path}</div>
      <div className="max-h-[70vh] overflow-auto font-mono text-[12.5px] leading-6">
        {lines.map((line, i) => {
          const n = i + 1;
          const notes = byLine[n] || [];
          const flagged = notes.some((c) => c.status !== 'rejected');
          return (
            <div key={n} ref={n === focusLine ? focusRef : null}>
              <div className={cx('flex', flagged && 'bg-amber-50', n === focusLine && 'bg-indigo-50')}>
                <span className="w-12 shrink-0 select-none pr-3 text-right text-slate-400">{n}</span>
                <pre className="whitespace-pre pr-4">{highlight(line) || ' '}</pre>
              </div>
              {notes.map((c) => (
                <InlineComment key={c.id} comment={c} actions={renderActions?.(c)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InlineComment({ comment: c, actions, compact }) {
  const sev = SEVERITY[c.severity] || SEVERITY.medium;
  const SourceIcon = c.source === 'reviewer' ? UserRound : Bot;
  return (
    <div className={cx('font-sans text-sm', compact ? '' : 'mx-3 my-2 ml-12')}>
      <div className={cx('rounded-xl ring-1 bg-white shadow-sm overflow-hidden flex', c.status === 'rejected' ? 'opacity-50 ring-slate-200' : 'ring-slate-200')}>
        <div className={cx('w-1 shrink-0', sev.bar)} />
        <div className="p-3 grid gap-1.5 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill color={sev.color}>{sev.label}</Pill>
            <Pill>{c.category}</Pill>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <SourceIcon className="size-3.5" />
              {c.source === 'reviewer' ? 'Reviewer' : c.source === 'claude' ? 'AI reviewer (Claude)' : c.source === 'groq' ? 'AI reviewer (Groq)' : 'AI reviewer'}
            </span>
            {c.status === 'confirmed' && <Pill color="green">Confirmed</Pill>}
            {c.status === 'rejected' && <Pill color="slate">Rejected</Pill>}
            {c.mission && c.status !== 'rejected' && (
              <Pill color="violet" icon={Swords}>
                Becomes a mission
              </Pill>
            )}
          </div>
          <div className="font-semibold">{c.title}</div>
          <p className="text-slate-600">{c.body}</p>
          {c.failingTests?.length > 0 && <div className="text-xs text-rose-700">Failing hidden tests: {c.failingTests.join(' · ')}</div>}
          {actions}
        </div>
      </div>
    </div>
  );
}
