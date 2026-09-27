'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, FlaskConical, FileText, Quote, Bug } from 'lucide-react';
import { Bar, Pill, cx } from '@/components/ui';

// The machine-verified facts from Phase 1.
export function ChecksSummary({ checks, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!checks?.hiddenTests && !checks?.studentTests) return null;
  const h = checks.hiddenTests;
  const docs = checks.docs || {};
  const docLabels = { readme: 'README', architecture: 'Architecture', decisions: 'Decision log', aiDisclosure: 'AI disclosure' };
  return (
    <div className="grid gap-4 text-sm">
      {!h && (
        <div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
          <b>Review track:</b> this company-written challenge has no hidden tests. The student&apos;s own tests, the mutation probe and the reviewers carry the score.
        </div>
      )}
      {h && <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold inline-flex items-center gap-2"><FlaskConical className="size-4 text-indigo-600" />Hidden tests</span>
          <span className="font-display text-lg font-extrabold tabular">{h.passed}/{h.total}</span>
        </div>
        <Bar value={h.passed} max={h.total} color={h.passed === h.total ? 'bg-emerald-500' : 'bg-amber-500'} />
        <button className="text-left text-xs font-semibold text-brand" onClick={() => setOpen(!open)}>
          {open ? 'Hide test list' : 'Show test list'}
        </button>
        {open && (
          <ul className="grid gap-1 rounded-xl bg-slate-50 p-3">
            {h.tests.map((t) => (
              <li key={t.name} className={cx('flex gap-2 items-start text-xs', t.ok ? 'text-slate-600' : 'text-rose-700 font-semibold')}>
                {t.ok ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="size-3.5 shrink-0 mt-0.5" />}
                {t.name}
              </li>
            ))}
          </ul>
        )}
      </div>}
      {checks.studentTests && (
        <div className="flex items-center justify-between">
          <span className="font-semibold">Student&apos;s own tests</span>
          <span className="tabular">{checks.studentTests.passed}/{checks.studentTests.total} pass</span>
        </div>
      )}
      <div className="grid gap-1.5">
        <span className="font-semibold inline-flex items-center gap-2"><FileText className="size-4 text-indigo-600" />Docs</span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(docLabels).map(([k, label]) => (
            <Pill key={k} color={docs[k] ? 'green' : 'rose'}>
              {docs[k] ? '✓' : '✗'} {label}
            </Pill>
          ))}
        </div>
      </div>
      {checks.claims?.length > 0 && (
        <div className="grid gap-1.5">
          <span className="font-semibold inline-flex items-center gap-2"><Quote className="size-4 text-indigo-600" />README claims vs code</span>
          {checks.claims.map((c) => (
            <div key={c.claim} className={cx('rounded-xl p-2.5 text-xs', c.verified ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
              <div className="font-semibold">“{c.claim}”</div>
              <div>{c.verified ? 'Backed by code. ' : 'Not backed by code. '}{c.evidence}</div>
            </div>
          ))}
        </div>
      )}
      {checks.mutation && (
        <div className={cx('rounded-xl p-3 text-xs grid gap-1', checks.mutation.survived ? 'bg-rose-50 text-rose-900' : 'bg-emerald-50 text-emerald-900')}>
          <span className="font-semibold inline-flex items-center gap-2 text-sm"><Bug className="size-4" />Mutation probe</span>
          <span>
            We changed <code className="font-mono">{checks.mutation.original?.trim()}</code> to <code className="font-mono">{checks.mutation.mutated?.trim()}</code> in {checks.mutation.file}.
          </span>
          <span className="font-semibold">{checks.mutation.survived ? "The student's tests did not notice. Blind spot found." : "The student's tests caught it."}</span>
        </div>
      )}
    </div>
  );
}
