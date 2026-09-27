'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, GraduationCap, ArrowRight, Hammer, ClipboardCheck, Swords, BadgeCheck, RotateCcw, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Button, Card } from '@/components/ui';
import { api, useAppState } from '@/lib/client';
import { toast } from '@/components/toast';

const STEPS = [
  { icon: Building2, title: 'Company posts an opening', body: 'Picks a ready-made challenge from the library. No test writing needed.' },
  { icon: Hammer, title: 'Student builds it', body: 'Uses the GitHub template, builds on their own laptop, submits the repo link.' },
  { icon: ClipboardCheck, title: 'Code review', body: 'Hidden tests, a mutation probe and an AI draft review. A company engineer confirms it.' },
  { icon: Swords, title: 'Live Round (the game)', body: 'Missions made from the review, played inside their own code: Bug Hunt, Customer Complaint, Plot Twist boss, Viva.' },
  { icon: BadgeCheck, title: 'Verified profile → hire', body: 'Every score links to proof. Companies search, open the evidence and invite.' },
];

export default function Home() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const { state } = useAppState();

  async function reset() {
    setResetting(true);
    try {
      await api('POST', '/api/reset');
      toast('Demo data reset. Start as the company.');
      router.push('/company');
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="flex-1">
      <header className="mx-auto max-w-6xl px-5 py-5 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Button variant="ghost" href="/company">For companies</Button>
          <Button variant="dark" href="/student">For students</Button>
        </div>
      </header>

      <section className="arch-bg">
        <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center">
          <div className="grid gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-amber-900">
              <Sparkles className="size-3.5" /> Hack Mysuru 1.0 · Problem Statement 2
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-extrabold leading-[0.98]">
              Show what you can build,
              <br />
              <span className="text-gold">not just your resume.</span>
            </h1>
            <p className="text-lg text-slate-600 max-w-xl">
              Students build a real project, get it reviewed, then prove it&apos;s theirs by fixing, changing and explaining it live. Companies see the proof and hire.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" href="/company" icon={Building2}>
                I&apos;m hiring
              </Button>
              <Button size="lg" variant="outline" href="/student" icon={GraduationCap}>
                I&apos;m a student
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <RoleCard
              href="/company"
              icon={Building2}
              tone="bg-indigo-600"
              title="Company dashboard"
              body="Set up your company, post an opening, review submissions and invite verified candidates."
            />
            <RoleCard
              href="/student"
              icon={GraduationCap}
              tone="bg-violet-600"
              title="Student dashboard · Hitesh"
              body="Find a challenge, submit your project, then level up through the Live Round."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 grid gap-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">How it works</div>
          <h2 className="font-display text-3xl font-bold">One loop from build to hire</h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="p-5 h-full grid gap-3 content-start">
                <div className="flex items-center justify-between">
                  <div className="grid place-items-center size-10 rounded-xl bg-ink text-white">
                    <s.icon className="size-5" />
                  </div>
                  <span className="font-display text-2xl font-extrabold text-slate-200">{i + 1}</span>
                </div>
                <div className="font-semibold">{s.title}</div>
                <p className="text-sm text-slate-600">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
        <Card className="p-5 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div>
            <div className="font-semibold">Presenting a demo?</div>
            <div className="text-sm text-slate-600">Reset clears your company, Hitesh&apos;s submission and all missions. Sample candidates stay.</div>
            {state && (
              <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${state.aiProvider ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                <span className={`size-2 rounded-full ${state.aiProvider ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {state.aiProvider ? `AI reviewer: ${state.aiProvider} connected` : 'AI reviewer: built-in rules (no API key set)'}
              </div>
            )}
          </div>
          <Button variant="outline" icon={RotateCcw} loading={resetting} onClick={reset}>
            Reset demo data
          </Button>
        </Card>
      </section>
    </main>
  );
}

function RoleCard({ href, icon: Icon, tone, title, body }) {
  return (
    <a href={href} className="group">
      <Card className="p-5 flex gap-4 items-start transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <div className={`grid place-items-center size-12 rounded-2xl text-white ${tone}`}>
          <Icon className="size-6" />
        </div>
        <div className="flex-1">
          <div className="font-display text-lg font-bold flex items-center gap-2">
            {title}
            <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </div>
          <p className="text-sm text-slate-600">{body}</p>
        </div>
      </Card>
    </a>
  );
}
