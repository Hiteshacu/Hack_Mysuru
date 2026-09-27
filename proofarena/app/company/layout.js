'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Library, ClipboardCheck, Users, SquareKanban, GraduationCap, Handshake, Gamepad2, Megaphone } from 'lucide-react';
import { AppStateProvider, useShared } from '@/components/state-context';
import { Logo } from '@/components/brand';
import { CompanyLogo, Loading, cx } from '@/components/ui';
import { pendingReviews } from '@/lib/selectors';
import Onboarding from './onboarding';
import { ResetButton } from '@/components/reset-button';

const NAV = [
  { href: '/company', label: 'Overview', icon: LayoutDashboard },
  { href: '/company/openings', label: 'Openings', icon: Briefcase },
  { href: '/company/library', label: 'Challenge library', icon: Library },
  { href: '/company/quests', label: '3D Quests', icon: Gamepad2 },
  { href: '/company/notify', label: 'Notify others', icon: Megaphone },
  { href: '/company/reviews', label: 'Reviews', icon: ClipboardCheck, count: 'reviews' },
  { href: '/company/candidates', label: 'Candidates', icon: Users },
  { href: '/company/connect', label: 'HR Connect', icon: Handshake, count: 'connect' },
  { href: '/company/pipeline', label: 'Hiring pipeline', icon: SquareKanban },
];

export default function CompanyLayout({ children }) {
  return (
    <AppStateProvider pollMs={3000}>
      <Shell>{children}</Shell>
    </AppStateProvider>
  );
}

function Shell({ children }) {
  const { state } = useShared();
  const pathname = usePathname();
  if (!state) return <Loading />;
  if (!state.activeCompany) return <Onboarding />;
  const company = state.activeCompany;
  const counts = {
    reviews: pendingReviews(state).length,
    connect: state.connections.filter((c) => c.companyId === company.id && c.status === 'pending').length,
  };

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr] min-h-screen">
      {/* Phones and tablets: a compact sticky header with swipeable section pills instead of the tall sidebar. */}
      <header className="lg:hidden sticky top-0 z-30 min-w-0 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="flex items-center gap-3 px-4 h-14">
          <Logo />
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <CompanyLogo company={company} size={28} />
            <span className="text-sm font-semibold truncate max-w-[40vw]">{company.name}</span>
          </div>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label="Company (mobile)">
          {NAV.map((n) => {
            const active = n.href === '/company' ? pathname === '/company' : pathname.startsWith(n.href);
            const count = n.count ? counts[n.count] : 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  'shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ring-1',
                  active ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-700 ring-slate-200',
                )}
              >
                <n.icon className="size-3.5" />
                {n.label}
                {count > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{count}</span>}
              </Link>
            );
          })}
          <Link href="/student" className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <GraduationCap className="size-3.5" /> Student view
          </Link>
        </nav>
      </header>
      <aside className="hidden lg:flex bg-white border-r border-slate-200 p-4 flex-col gap-6 lg:sticky lg:top-0 lg:h-screen">
        <Logo />
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <CompanyLogo company={company} size={36} />
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{company.name}</div>
            <div className="text-xs text-slate-500 truncate">{company.city} · {company.industry}</div>
          </div>
        </div>
        <nav className="grid gap-1" aria-label="Company">
          {NAV.map((n) => {
            const active = n.href === '/company' ? pathname === '/company' : pathname.startsWith(n.href);
            const count = n.count ? counts[n.count] : 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {count > 0 && <span className={cx('rounded-full px-2 text-xs font-bold', active ? 'bg-gold text-white' : 'bg-rose-500 text-white')}>{count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-2">
          <Link href="/student" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-violet-700 bg-violet-50 hover:bg-violet-100 font-medium">
            <GraduationCap className="size-4" /> Switch to student view
          </Link>
          <ResetButton />
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-5 lg:p-8">{children}</main>
    </div>
  );
}
