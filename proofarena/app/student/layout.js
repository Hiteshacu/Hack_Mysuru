'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Sparkles, Lock, Handshake, Shield, Gamepad2 } from 'lucide-react';
import { NotifyBell } from '@/components/notify-bell';
import { AppStateProvider, useShared } from '@/components/state-context';
import { Logo } from '@/components/brand';
import { Avatar, Loading, cx } from '@/components/ui';
import { byId, standing, leagueFor } from '@/lib/selectors';
import { ResetButton } from '@/components/reset-button';
import { Celebrations } from '@/components/celebrate';
import { CountUp } from '@/components/fx';

const NAV = [
  { href: '/student', label: 'Home' },
  { href: '/student/opportunities', label: 'Opportunities' },
  { href: '/student/quests', label: '3D Quests', quests: true },
  { href: '/student/connect', label: 'HR Connect', connect: true },
  { href: '/student/community', label: 'Community' },
  { href: '/student/profile', label: 'My proof' },
];

export default function StudentLayout({ children }) {
  return (
    <AppStateProvider pollMs={3000}>
      <Shell>{children}</Shell>
    </AppStateProvider>
  );
}

function Shell({ children }) {
  const { state, refresh } = useShared();
  const pathname = usePathname();
  if (!state) return <Loading />;
  // Celebrations stays mounted in the same place on every page (including the mission
  // workspace) so it can notice a rank climb that happens during a mission.
  const celebrations = <Celebrations state={state} studentId="hitesh" />;
  if (pathname.includes('/play/')) {
    return (
      <div className="flex-1 flex flex-col">
        {celebrations}
        {children}
      </div>
    );
  }
  const me = byId(state.students, 'hitesh');
  const lvl = me.level;
  const st = standing(state, 'hitesh');
  const league = leagueFor(me.xp);

  return (
    <div className="flex-1 flex flex-col">
      {celebrations}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-5 h-16 flex items-center gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-1" aria-label="Student">
            {NAV.map((n) => {
              const active = n.href === '/student' ? pathname === '/student' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    'rounded-lg px-2.5 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap',
                    active ? 'bg-violet-100 text-violet-800' : 'text-slate-600 hover:bg-slate-100',
                    n.connect && st?.unlocked && !active && 'text-amber-700',
                  )}
                >
                  {n.connect && (st?.unlocked ? <Handshake className="size-4 text-amber-600" /> : <Lock className="size-3.5 text-slate-400" />)}
                  {n.quests && <Gamepad2 className="size-4 text-violet-600" />}
                  {n.label}
                  {n.connect && st?.unlocked && <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className={cx('hidden 2xl:inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap', league.color)} title="Weekly league">
              <Shield className="size-3.5" /> {league.name}
            </span>
            <NotifyBell state={state} studentId="hitesh" refresh={refresh} />
            <div className="hidden lg:grid gap-1 w-36" title={`${me.xp} XP`}>
              <div className="flex justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-1 text-violet-700"><Sparkles className="size-3.5" />Lv {lvl.number} {lvl.name}</span>
                <span className="text-slate-500"><CountUp value={me.xp} /> XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-700" style={{ width: `${lvl.progress * 100}%` }} />
              </div>
            </div>
            <Avatar person={me} size={34} />
            <Link href="/company" className="hidden xl:inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100">
              <Building2 className="size-3.5" /> Company
            </Link>
            <ResetButton className="hidden 2xl:inline-flex !px-2 !py-1.5 text-xs whitespace-nowrap" />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
