'use client';

import { MapPin, Wallet, Swords, ShieldCheck, ArrowRight, Activity, Timer, Sparkles } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, CompanyLogo, Empty, SectionTitle } from '@/components/ui';
import { byId, companyResponse, formatHours } from '@/lib/selectors';
import { timeAgo } from '@/lib/client';

export default function Opportunities() {
  const { state } = useShared();
  const mySubs = state.submissions.filter((s) => s.studentId === 'hitesh' && s.status !== 'failed' && !s.archived);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Opportunities</h1>
        <p className="text-slate-600 mt-1 max-w-2xl">
          Every opening is linked to a challenge. Solve a challenge once and your proof counts for <b>every</b> company that uses it. No more separate take-home tests.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 content-start">
          {state.openings.length === 0 && (
            <Card>
              <Empty icon={Swords} title="No openings yet">Companies haven&apos;t posted anything. Check back soon.</Empty>
            </Card>
          )}
          {state.openings.map((o) => {
            const co = byId(state.companies, o.companyId);
            const ch = state.library.find((c) => c.id === o.challengeId);
            const mine = mySubs.find((s) => s.challengeId === o.challengeId);
            const eligible = mine?.reviewedAt && mine.score.total >= o.minScore;
            const resp = companyResponse(state, co.id);
            return (
              <Card key={o.id} className="p-5 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto] items-center">
                <CompanyLogo company={co} size={52} />
                <div className="grid gap-1.5 min-w-0">
                  <div className="text-sm text-slate-500">{co.name}</div>
                  <div className="font-display text-xl font-bold">{o.title}</div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{o.location}</span>
                    {o.pay && <span className="inline-flex items-center gap-1"><Wallet className="size-4" />{o.pay}</span>}
                    {resp.avgTimeToReview != null && <span className="inline-flex items-center gap-1"><Timer className="size-4" />Reviews in ~{formatHours(resp.avgTimeToReview)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ch?.status === 'live' ? <Pill color="green" icon={ShieldCheck}>{ch.title} · Verified</Pill> : <Pill color="violet" icon={Sparkles}>{ch?.title} · by {co.name}</Pill>}
                    <Pill>{ch?.difficulty}</Pill>
                    <Pill>Needs score ≥ {o.minScore}</Pill>
                    {mine && (eligible ? <Pill color="green">Your proof qualifies ({mine.score.total})</Pill> : <Pill color="amber">Your proof: {mine.score.total} so far</Pill>)}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Button href={`/student/challenge/${o.id}`}>
                    {mine ? 'View program' : 'View challenge'} <ArrowRight className="size-4" />
                  </Button>
                  {mine && (
                    <Button size="sm" variant="outline" href={mine.status === 'in_arena' ? (mine.track === 'review' ? `/student/viva/${mine.id}` : `/student/arena/${mine.id}`) : `/student/submission/${mine.id}`}>
                      Continue my attempt
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 grid gap-3 content-start h-fit">
          <SectionTitle eyebrow="Hacktivity" title={<span className="inline-flex items-center gap-2"><Activity className="size-5 text-violet-600" />Recent activity</span>} />
          <ul className="grid gap-3">
            {state.activity.slice(0, 10).map((a) => (
              <li key={a.id} className="grid gap-0.5 text-sm border-l-2 border-violet-200 pl-3">
                <span>{a.text}</span>
                <span className="text-xs text-slate-400">{timeAgo(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
