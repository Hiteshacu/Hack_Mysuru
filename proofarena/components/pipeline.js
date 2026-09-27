'use client';

import { CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react';
import { cx } from '@/components/ui';

// Phase 1 progress: each automated check with its live status and result.
export function PipelineProgress({ sub }) {
  const labels = Object.fromEntries((sub.pipelineLabels || []).map((p) => [p.key, p.label]));
  return (
    <ol className="grid gap-2">
      {sub.pipeline.map((p) => (
        <li
          key={p.key}
          className={cx(
            'flex items-start gap-3 rounded-xl px-4 py-3 ring-1 transition',
            p.status === 'running' && 'bg-sky-50 ring-sky-200',
            p.status === 'done' && 'bg-white ring-slate-200',
            p.status === 'pending' && 'bg-slate-50 ring-slate-100 text-slate-400',
            p.status === 'failed' && 'bg-rose-50 ring-rose-200',
          )}
        >
          {p.status === 'done' && <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />}
          {p.status === 'running' && <LoaderCircle className="size-5 text-sky-600 animate-spin shrink-0" />}
          {p.status === 'pending' && <Circle className="size-5 shrink-0" />}
          {p.status === 'failed' && <XCircle className="size-5 text-rose-600 shrink-0" />}
          <div className="min-w-0">
            <div className="font-semibold text-sm">{labels[p.key] || p.key}</div>
            {p.detail && <div className={cx('text-sm', p.status === 'failed' ? 'text-rose-700' : 'text-slate-500')}>{p.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
