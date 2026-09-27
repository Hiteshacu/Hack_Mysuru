'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Loading, SectionTitle, Field, inputCls, Pill } from '@/components/ui';
import { Dossier } from '@/components/dossier';
import { byId } from '@/lib/selectors';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

export default function CandidatePage() {
  const { studentId } = useParams();
  const { state, refresh } = useShared();
  const student = byId(state.students, studentId);
  const sub = student && byId(state.submissions, student.bestSubmissionId);
  if (!student || !sub) return <Loading />;

  return (
    <div className="grid gap-4 max-w-6xl">
      <Link href="/company/candidates" className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-4" /> All candidates
      </Link>
      <Dossier state={state} student={student} sub={sub} side={<InviteCard state={state} student={student} refresh={refresh} />} />
    </div>
  );
}

function InviteCard({ state, student, refresh }) {
  const mine = state.openings.filter((o) => o.companyId === state.activeCompanyId);
  const [openingId, setOpeningId] = useState(mine[0]?.id || '');
  const [message, setMessage] = useState(`Hi ${student.name.split(' ')[0]}, we saw how you handled the Plot Twist. We'd like to talk about our ${mine[0]?.title || 'open role'}.`);
  const [sending, setSending] = useState(false);
  const existing = state.invites.filter((i) => i.studentId === student.id && i.companyId === state.activeCompanyId);

  async function send() {
    setSending(true);
    try {
      await api('POST', '/api/invites', { studentId: student.id, openingId, message });
      toast(`Invite sent to ${student.name}`);
      refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5 grid gap-3 ring-2 ring-indigo-200">
      <SectionTitle title="Invite to interview" />
      {existing.map((i) => (
        <div key={i.id} className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4" />
          <span className="flex-1">Invited for {byId(state.openings, i.openingId)?.title}</span>
          <Pill color="green">{i.status}</Pill>
        </div>
      ))}
      {existing.some((i) => i.status === 'invited') && student.live && (
        <Link href="/student" className="text-sm font-semibold text-violet-700 hover:underline">
          Switch to student · accept the invite →
        </Link>
      )}
      {mine.length === 0 ? (
        <div className="text-sm text-slate-500">
          Post an opening first. <Link className="text-brand font-semibold" href="/company/openings?new=1">Post one</Link>
        </div>
      ) : (
        <>
          <Field label="Opening">
            <select id="inv-opening" className={inputCls} value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
              {mine.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          </Field>
          <Field label="Message">
            <textarea id="inv-msg" rows={4} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button icon={Send} loading={sending} onClick={send} disabled={existing.some((i) => i.openingId === openingId)}>
            Send invite
          </Button>
        </>
      )}
    </Card>
  );
}
