'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Crown, Sparkles, Handshake, TrendingUp, Shield, BadgeCheck, ArrowRight } from 'lucide-react';
import { BadgeIcon, cx } from '@/components/ui';
import { BADGES } from '@/lib/scoring';
import { standing as getStanding, leagueFor, TOP_N } from '@/lib/selectors';

// Watches the student's state and celebrates level-ups, badges, rank climbs,
// league promotions, verification and the HR Connect unlock with a full-screen moment.
export function Celebrations({ state, studentId }) {
  const pathname = usePathname();
  const router = useRouter();
  const prev = useRef(null);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!state) return;
    const me = state.students.find((s) => s.id === studentId);
    const st = getStanding(state, studentId);
    const snap = {
      level: me.level.number,
      levelName: me.level.name,
      badges: [...me.badges],
      rank: st?.reviewed ? st.rank : null,
      unlocked: Boolean(st?.unlocked),
      league: leagueFor(me.xp).index,
      verified: st?.sub?.status === 'complete',
      subId: st?.sub?.id,
    };
    const p = prev.current;
    prev.current = snap;
    if (!p || p.subId !== snap.subId) return;
    const events = [];
    if (snap.unlocked && !p.unlocked) events.push({ type: 'unlock', from: p.rank, to: snap.rank, challenge: st.challenge?.title });
    else if (snap.rank && p.rank && snap.rank < p.rank) events.push({ type: 'rank', from: p.rank, to: snap.rank, gap: st.gap });
    if (snap.verified && !p.verified) events.push({ type: 'verified', score: st.sub.score.total });
    if (snap.level > p.level) events.push({ type: 'level', level: snap.level, name: snap.levelName });
    if (snap.league > p.league) events.push({ type: 'league', name: leagueFor(me.xp).name });
    const newBadges = snap.badges.filter((b) => !p.badges.includes(b));
    if (newBadges.length) events.push({ type: 'badges', badges: newBadges });
    if (events.length) setQueue((q) => [...q, ...events]);
  }, [state, studentId]);

  const onPlay = pathname.includes('/play/');
  const current = !onPlay ? queue[0] : null;

  useEffect(() => {
    if (!current) return;
    import('canvas-confetti').then(({ default: confetti }) => {
      const gold = ['#fbbf24', '#f59e0b', '#a78bfa', '#34d399', '#ffffff'];
      confetti({ particleCount: current.type === 'unlock' ? 220 : 120, spread: 90, origin: { y: 0.55 }, colors: gold });
      if (current.type === 'unlock') {
        setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0 }, colors: gold }), 250);
        setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1 }, colors: gold }), 400);
      }
    });
  }, [current]);

  if (!current) return null;
  const next = () => setQueue((q) => q.slice(1));

  const view = {
    unlock: {
      icon: Handshake,
      tone: 'from-amber-300 to-amber-600',
      kicker: 'Reward unlocked',
      title: 'HR Connect is open for you',
      body: `You climbed ${current.from ? `from #${current.from} ` : ''}to #${current.to} on ${current.challenge}. The top ${TOP_N} can request a direct intro with the HR of every company using this challenge.`,
      cta: { label: 'Meet the HRs', href: '/student/connect' },
    },
    rank: {
      icon: TrendingUp,
      tone: 'from-violet-400 to-violet-700',
      kicker: 'Rank up',
      title: `#${current.from} → #${current.to}`,
      body: current.gap ? `${current.gap} more point${current.gap === 1 ? '' : 's'} to reach the top ${TOP_N} and unlock HR Connect.` : 'Keep going!',
    },
    verified: {
      icon: BadgeCheck,
      tone: 'from-emerald-300 to-emerald-600',
      kicker: 'Fully verified',
      title: `Verified score ${current.score}/100`,
      body: 'Every company using this challenge can now see your proof.',
      cta: { label: 'See my proof', href: '/student/profile' },
    },
    level: {
      icon: Sparkles,
      tone: 'from-fuchsia-400 to-violet-700',
      kicker: 'Level up',
      title: `Level ${current.level} · ${current.name}`,
      body: 'Your XP just crossed a new level.',
    },
    league: {
      icon: Shield,
      tone: 'from-sky-400 to-indigo-700',
      kicker: 'Promoted',
      title: `Welcome to the ${current.name} League`,
      body: 'Stay in the top 3 this week to move up again.',
    },
    badges: {
      icon: Crown,
      tone: 'from-amber-300 to-orange-500',
      kicker: current.badges?.length > 1 ? 'New badges' : 'New badge',
      title: current.badges?.map((b) => BADGES[b]?.name).join(' · '),
      body: current.badges?.map((b) => BADGES[b]?.desc).join('. '),
    },
  }[current.type];
  const Icon = view.icon;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#0b0718]/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" onClick={next}>
      <div className="pop-in relative w-full max-w-md rounded-3xl bg-[#1a1033] text-white p-8 grid justify-items-center text-center gap-3 overflow-hidden ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-24 size-72 rounded-full opacity-40 spin-slow" style={{ background: 'conic-gradient(from 0deg, transparent, #fbbf24, transparent 30%, #a78bfa, transparent 60%, #34d399, transparent)' }} aria-hidden="true" />
        <div className={cx('relative grid place-items-center size-20 rounded-3xl bg-gradient-to-br shadow-xl float', view.tone)}>
          <Icon className="size-10" />
        </div>
        <div className="relative text-xs font-bold uppercase tracking-[0.25em] text-amber-300">{view.kicker}</div>
        <div className="relative font-display text-3xl font-extrabold leading-tight">{view.title}</div>
        <p className="relative text-violet-100 text-sm max-w-sm">{view.body}</p>
        {current.type === 'badges' && (
          <div className="relative flex flex-wrap justify-center gap-2 [&_span]:text-white">
            {current.badges.map((b) => BADGES[b] && <BadgeIcon key={b} badge={BADGES[b]} size={52} />)}
          </div>
        )}
        <div className="relative flex gap-2 mt-2">
          {view.cta && (
            <button
              onClick={() => {
                next();
                router.push(view.cta.href);
              }}
              className="rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-amber-950 font-bold px-5 py-2.5 inline-flex items-center gap-2"
            >
              {view.cta.label} <ArrowRight className="size-4" />
            </button>
          )}
          <button onClick={next} className="rounded-xl bg-white/10 hover:bg-white/20 font-semibold px-5 py-2.5">
            {queue.length > 1 ? 'Next' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
