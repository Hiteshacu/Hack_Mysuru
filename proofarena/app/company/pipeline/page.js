'use client';

import Link from 'next/link';
import { useShared } from '@/components/state-context';
import { Card, Avatar, Button, Pill } from '@/components/ui';
import { byId } from '@/lib/selectors';
import { api, timeAgo } from '@/lib/client';

const COLUMNS = [
  { key: 'invited', label: 'Invited', next: null, tone: 'bg-slate-100' },
  { key: 'accepted', label: 'Accepted', next: { status: 'interview', label: 'Schedule interview' }, tone: 'bg-indigo-50' },
  { key: 'interview', label: 'Interview', next: { status: 'offer', label: 'Make offer' }, tone: 'bg-amber-50' },
  { key: 'offer', label: 'Offer', next: null, tone: 'bg-emerald-50' },
];

export default function Pipeline() {
  const { state, refresh } = useShared();
  const invites = state.invites.filter((i) => i.companyId === state.activeCompanyId);

  async function move(inv, status) {
    await api('POST', '/api/invites', { id: inv.id, status });
    refresh();
  }

  return (
    <div className="grid gap-6">
      <div>
        <div className="text-sm text-slate-500">Hiring pipeline</div>
        <h1 className="font-display text-3xl font-extrabold">From proof to offer</h1>
        <p className="text-slate-600 mt-1">HR sees plain-language dossiers here. No code reading needed.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = invites.filter((i) => i.status === col.key);
          return (
            <div key={col.key} className={`rounded-2xl p-3 ${col.tone} grid gap-3 content-start min-h-64`}>
              <div className="flex justify-between items-center px-1">
                <span className="font-semibold">{col.label}</span>
                <span className="text-sm text-slate-500 tabular">{items.length}</span>
              </div>
              {items.map((inv) => {
                const st = byId(state.students, inv.studentId);
                const sub = byId(state.submissions, st.bestSubmissionId);
                const op = byId(state.openings, inv.openingId);
                return (
                  <Card key={inv.id} className="p-3 grid gap-2">
                    <Link href={`/company/candidates/${st.id}`} className="flex items-center gap-2">
                      <Avatar person={st} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{st.name}</div>
                        <div className="text-xs text-slate-500 truncate">{op?.title}</div>
                      </div>
                      <span className="font-display text-lg font-extrabold tabular">{sub?.score.total}</span>
                    </Link>
                    <div className="text-xs text-slate-400">{timeAgo(inv.createdAt)}</div>
                    {inv.status === 'invited' && <Pill color="slate">Waiting for the student</Pill>}
                    {col.next && (
                      <Button size="sm" variant="outline" onClick={() => move(inv, col.next.status)}>
                        {col.next.label}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>
      {invites.some((i) => i.status === 'declined') && (
        <div className="text-sm text-slate-500">{invites.filter((i) => i.status === 'declined').length} invite(s) declined.</div>
      )}
    </div>
  );
}
