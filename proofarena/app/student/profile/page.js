'use client';

import { Share2, Building2 } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Empty, SectionTitle, Pill } from '@/components/ui';
import { Dossier } from '@/components/dossier';
import { byId } from '@/lib/selectors';

export default function MyProof() {
  const { state } = useShared();
  const me = byId(state.students, 'hitesh');
  const sub = me.bestSubmissionId && byId(state.submissions, me.bestSubmissionId);

  if (!sub || !(sub.checks?.hiddenTests || sub.checks?.studentTests)) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Card>
          <Empty icon={Share2} title="No proof yet">
            Submit a challenge project. Your verified profile builds up here as you go through the review and the Live Round.
          </Empty>
          <div className="pb-8 grid place-items-center">
            <Button href="/student/opportunities">Find a challenge</Button>
          </div>
        </Card>
      </div>
    );
  }

  const companies = [...new Set(state.openings.filter((o) => o.challengeId === sub.challengeId).map((o) => o.companyId))].map((id) => byId(state.companies, id));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-4">
      <div className="text-sm text-slate-500">This is exactly what companies see.</div>
      <Dossier
        state={state}
        student={me}
        sub={sub}
        side={
          <Card className="p-5 grid gap-3">
            <SectionTitle title="Who can see this" />
            <p className="text-sm text-slate-600">Every company that uses the Palace Pass challenge. You built it once.</p>
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => (
                <Pill key={c.id} icon={Building2}>{c.name}</Pill>
              ))}
            </div>
          </Card>
        }
      />
    </div>
  );
}
