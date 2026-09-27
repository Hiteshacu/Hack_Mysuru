'use client';

import { Users, Lock, Mail, ExternalLink, Copy, MapPin, Wallet, Gamepad2 } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Pill, CompanyLogo, Avatar, SectionTitle } from '@/components/ui';
import { toast } from '@/components/toast';

const ME = 'hitesh';

export default function Community() {
  const { state } = useShared();
  const finished = state.questRuns.filter((r) => r.studentId === ME && r.stage === 'done');
  const members = [...new Set(state.questRuns.filter((r) => r.stage === 'done').map((r) => r.studentId))].map((id) => state.students.find((s) => s.id === id)).filter(Boolean);

  if (!finished.length) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Card className="p-8 grid justify-items-center text-center gap-3">
          <div className="grid place-items-center size-16 rounded-3xl bg-slate-100 text-slate-400"><Lock className="size-8" /></div>
          <h1 className="font-display text-3xl font-extrabold">The Community Camp is locked</h1>
          <p className="text-slate-600 max-w-md">Finish all four stages of a 3D Quest (quiz, arrow range, debugging, DSA) to join. Inside: job application links and HR emails from every hiring company.</p>
          <Button href="/student/quests" icon={Gamepad2}>Go to 3D Quests</Button>
        </Card>
      </div>
    );
  }

  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast(`Copied ${t}`), () => {});
  // The roles behind the quests this student finished come first, then every opening on the platform.
  const questRoles = finished
    .map((r) => state.quests.find((q) => q.id === r.questId))
    .filter(Boolean)
    .map((q) => {
      const co = state.companies.find((c) => c.id === q.companyId);
      return { id: q.id, companyId: q.companyId, title: `${q.title} · your quest`, location: co?.city || 'See the job description', pay: 'Fast-tracked for quest finishers', applyUrl: q.applyUrl };
    });
  const roles = [...questRoles, ...state.openings];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid gap-6">
      <section className="rounded-3xl p-6 md:p-8 text-white bg-gradient-to-br from-[#2a1a05] via-[#3b2508] to-[#1a1033] relative overflow-hidden grid gap-3">
        <div className="absolute inset-0 shine opacity-20 pointer-events-none" />
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
          <Users className="size-3.5" /> Community Camp
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold">Welcome to the community.</h1>
        <p className="text-amber-100 max-w-2xl">You finished a 3D Quest. Here are the application links and HR emails of every company hiring on ProofArena.</p>
        <div className="flex -space-x-2">
          {members.map((m) => (
            <div key={m.id} className="ring-2 ring-[#3b2508] rounded-full"><Avatar person={m} size={36} /></div>
          ))}
          <span className="ml-4 self-center text-sm text-amber-100">{members.length} member{members.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      <SectionTitle eyebrow="Apply directly" title="Open roles" />
      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((o, i) => {
          const co = state.companies.find((c) => c.id === o.companyId);
          return (
            <Card key={o.id} className="p-5 grid gap-3 fade-up tilt" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-center gap-3">
                <CompanyLogo company={co} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-500">{co?.name}</div>
                  <div className="font-display text-lg font-bold truncate">{o.title}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{o.location}</span>
                {o.pay && <span className="inline-flex items-center gap-1"><Wallet className="size-4" />{o.pay}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {o.applyUrl ? (
                  <Button size="sm" icon={ExternalLink} href={o.applyUrl} target="_blank" rel="noopener noreferrer">Apply now</Button>
                ) : (
                  <Pill>Apply by email</Pill>
                )}
                {co?.hr?.email && (
                  <button onClick={() => copy(co.hr.email)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50">
                    <Mail className="size-4" /> {co.hr.email} <Copy className="size-3.5 text-slate-400" />
                  </button>
                )}
              </div>
              {co?.hr?.name && <div className="text-xs text-slate-500">HR: {co.hr.name} · {co.hr.role}</div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
