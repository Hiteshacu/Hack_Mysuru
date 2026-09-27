'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Crown, Lock, Unlock, ArrowUp, Handshake, TrendingUp, Flame, Shield } from 'lucide-react';
import { Avatar, cx } from '@/components/ui';
import { TOP_N, leagueFor, LEAGUE_PEERS } from '@/lib/selectors';

// Animates a number from its previous value to the new one.
export function CountUp({ value = 0, duration = 900, className }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (b - a) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={cx('tabular', className)}>{shown}</span>;
}

const MEDALS = [
  { place: 1, height: 'h-32', color: 'from-amber-300 to-amber-500', ring: 'ring-amber-300', label: '1st' },
  { place: 2, height: 'h-24', color: 'from-slate-200 to-slate-400', ring: 'ring-slate-300', label: '2nd' },
  { place: 3, height: 'h-16', color: 'from-orange-300 to-orange-500', ring: 'ring-orange-300', label: '3rd' },
];

// Top-3 podium for a challenge. The top 3 unlock HR Connect.
export function Podium({ ranking, meId, dark = false }) {
  const order = [ranking[1], ranking[0], ranking[2]];
  const medal = [MEDALS[1], MEDALS[0], MEDALS[2]];
  return (
    <div className="grid grid-cols-3 items-end gap-3 pt-6">
      {order.map((r, i) => {
        const m = medal[i];
        if (!r) return <div key={i} />;
        const me = r.student.id === meId;
        return (
          <div key={r.sub.id} className="grid justify-items-center gap-2 fade-up" style={{ animationDelay: `${i * 120}ms` }}>
            {m.place === 1 && <Crown className="size-6 text-amber-400 float" />}
            <div className={cx('rounded-full ring-4', m.ring, me && 'glow')}>
              <Avatar person={r.student} size={m.place === 1 ? 56 : 46} />
            </div>
            <div className={cx('text-center text-xs font-semibold leading-tight', dark ? 'text-white' : 'text-ink')}>
              {r.student.name}
              {me && <span className="block text-[10px] text-violet-500 font-bold">YOU</span>}
            </div>
            <div className={cx('rise w-full rounded-t-2xl bg-gradient-to-b grid place-items-start justify-center pt-2 relative overflow-hidden', m.color, m.height)} style={{ animationDelay: `${200 + i * 150}ms` }}>
              <div className="absolute inset-0 shine opacity-60" />
              <span className="font-display text-2xl font-extrabold text-white drop-shadow tabular">{r.sub.score.total}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Progress ladder towards the top 3 and the HR Connect reward.
export function RoadToTop3({ standing, compact = false }) {
  if (!standing) {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 flex gap-3 items-center">
        <Lock className="size-5 text-slate-400" /> Submit a challenge to join its leaderboard. The top {TOP_N} unlock <b>HR Connect</b>.
      </div>
    );
  }
  const { rank, total, unlocked, gap, reviewed, challenge } = standing;
  if (!reviewed) {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 flex gap-3 items-center">
        <Lock className="size-5 text-slate-400" /> You join the {challenge?.title} leaderboard once your code review is published.
      </div>
    );
  }
  const steps = Array.from({ length: Math.min(Math.max(total, TOP_N + 1), 6) }, (_, i) => i + 1);
  return (
    <div className={cx('rounded-2xl p-4 grid gap-3', unlocked ? 'bg-gradient-to-br from-amber-50 to-emerald-50 ring-1 ring-amber-200' : 'bg-slate-50')}>
      <div className="flex items-center gap-3">
        <div className={cx('grid place-items-center size-10 rounded-xl text-white', unlocked ? 'bg-gradient-to-br from-amber-400 to-amber-600 glow' : 'bg-slate-400')}>
          {unlocked ? <Unlock className="size-5" /> : <Lock className="size-5" />}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">{unlocked ? 'HR Connect unlocked' : `Road to the top ${TOP_N}`}</div>
          <div className="text-xs text-slate-600">
            {unlocked ? `You're #${rank} of ${total} on ${challenge.title}. HRs are one click away.` : `You're #${rank} of ${total}. ${gap} more point${gap === 1 ? '' : 's'} to reach #${TOP_N} and unlock HR Connect.`}
          </div>
        </div>
        {!compact && unlocked && (
          <Link href="/student/connect" className="rounded-xl bg-ink text-white text-sm font-semibold px-3 py-2 inline-flex items-center gap-1.5">
            <Handshake className="size-4" /> Open
          </Link>
        )}
      </div>
      <div className="flex items-center gap-1.5" aria-label={`Rank ${rank} of ${total}`}>
        {steps.map((n) => (
          <div key={n} className="flex-1 grid gap-1 justify-items-center">
            <div
              className={cx(
                'h-2 w-full rounded-full transition-all duration-700',
                n <= TOP_N ? 'bg-amber-300' : 'bg-slate-200',
                n === rank && 'h-3 ring-2 ring-violet-500 bg-violet-500',
              )}
            />
            <span className={cx('text-[10px] font-bold', n === rank ? 'text-violet-700' : n <= TOP_N ? 'text-amber-700' : 'text-slate-400')}>#{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Animated radar chart of the five proven skills.
export function SkillRadar({ skills, size = 220 }) {
  const names = ['Correctness', 'Debugging', 'Design', 'Testing', 'Communication'];
  const c = size / 2;
  const r = size / 2 - 34;
  const [grow, setGrow] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setGrow(1), 60);
    return () => clearTimeout(t);
  }, []);
  const pt = (i, v) => {
    const a = (Math.PI * 2 * i) / names.length - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const poly = names.map((n, i) => pt(i, ((skills?.[n] ?? 0) / 100) * grow).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px] mx-auto" role="img" aria-label="Skill radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={names.map((_, i) => pt(i, f).join(',')).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth="1" />
      ))}
      {names.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />;
      })}
      <polygon points={poly} fill="rgba(124,58,237,0.22)" stroke="#7c3aed" strokeWidth="2" style={{ transition: 'all 1s cubic-bezier(.2,.9,.3,1.1)' }} />
      {names.map((n, i) => {
        const [x, y] = pt(i, ((skills?.[n] ?? 0) / 100) * grow);
        return skills?.[n] != null ? <circle key={n} cx={x} cy={y} r="3.5" fill="#7c3aed" style={{ transition: 'all 1s' }} /> : null;
      })}
      {names.map((n, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#475569" fontWeight="600">
            {n === 'Communication' ? 'Comms' : n} {skills?.[n] ?? '–'}
          </text>
        );
      })}
    </svg>
  );
}

// Weekly league board with promotion and demotion zones.
export function LeagueBoard({ students, meId }) {
  const me = students.find((s) => s.id === meId);
  const league = leagueFor(me?.xp);
  const members = [...students.map((s) => ({ ...s, real: true })), ...LEAGUE_PEERS].sort((a, b) => b.xp - a.xp);
  const promo = 3;
  const demo = members.length - 2;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <div className={cx('grid place-items-center size-12 rounded-2xl bg-gradient-to-br text-white shadow-md', league.color)}>
          <Shield className="size-6" />
        </div>
        <div className="flex-1">
          <div className="font-display text-lg font-extrabold">{league.name} League</div>
          <div className="text-xs text-slate-500">{league.next ? `Top ${promo} this week move up to ${league.next.name}` : 'The highest league. Stay in the top 3!'} · resets Monday</div>
        </div>
      </div>
      <ol className="grid gap-1">
        {members.map((m, i) => {
          const zone = i < promo ? 'promo' : i >= demo ? 'demo' : 'safe';
          return (
            <li
              key={m.id}
              className={cx(
                'flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm fade-up',
                m.id === meId && 'bg-violet-50 ring-1 ring-violet-300',
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className={cx('w-5 text-xs font-bold tabular', zone === 'promo' ? 'text-emerald-600' : zone === 'demo' ? 'text-rose-500' : 'text-slate-400')}>{i + 1}</span>
              <Avatar person={m} size={26} />
              <span className="flex-1 truncate font-medium">{m.name}{m.id === meId && <span className="text-violet-600 text-xs font-bold"> (you)</span>}</span>
              {zone === 'promo' && <ArrowUp className="size-3.5 text-emerald-600" />}
              <span className="tabular text-xs font-bold w-14 text-right">{m.xp} XP</span>
            </li>
          );
        })}
      </ol>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><TrendingUp className="size-3.5 text-emerald-600" />Promotion zone</span>
        <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-rose-500" />Demotion zone</span>
      </div>
    </div>
  );
}
