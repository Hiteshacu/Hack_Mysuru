'use client';

import Link from 'next/link';
import { LoaderCircle, Inbox, Star, Rocket, Bug, Eye, Wrench, Crown, Layers, Zap, MessageCircle } from 'lucide-react';

const BADGE_ICONS = { Rocket, Bug, Eye, Wrench, Crown, Layers, Zap, MessageCircle };

export function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, action, className }) {
  return (
    <div className={cx('flex items-end justify-between gap-4 flex-wrap', className)}>
      <div>
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</div>}
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const BTN = {
  primary: 'bg-brand text-white hover:bg-indigo-800 shadow-sm',
  dark: 'bg-ink text-white hover:bg-slate-800',
  gold: 'bg-gold text-white hover:bg-amber-600 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  outline: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  'dark-outline': 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20',
  'dark-ghost': 'bg-transparent text-amber-200 hover:bg-white/10',
};

export function Button({ variant = 'primary', size = 'md', href, loading, icon: Icon, className, children, ...rest }) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
    size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm',
    BTN[variant],
    className,
  );
  const inner = (
    <>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </>
  );
  if (href && (href.startsWith('/quest/') || href.startsWith('http'))) {
    // Static 3D world and external links: a normal page load, not client-side routing.
    return (
      <a href={href} className={cls} {...rest}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {inner}
    </button>
  );
}

const PILL = {
  slate: 'bg-slate-100 text-slate-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
  sky: 'bg-sky-50 text-sky-700',
  dark: 'bg-ink text-white',
};

export function Pill({ color = 'slate', icon: Icon, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', PILL[color], className)}>
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

export const SEVERITY = {
  high: { label: 'P2 · High', color: 'rose', bar: 'bg-rose-500' },
  medium: { label: 'P3 · Medium', color: 'amber', bar: 'bg-amber-500' },
  low: { label: 'P4 · Low', color: 'sky', bar: 'bg-sky-500' },
  good: { label: 'Strength', color: 'green', bar: 'bg-emerald-500' },
};

export function Avatar({ person, size = 40 }) {
  return (
    <div
      className="grid place-items-center rounded-full font-bold text-white shrink-0"
      style={{ width: size, height: size, background: person?.color || '#4338ca', fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {person?.initials || person?.name?.[0] || '?'}
    </div>
  );
}

export function CompanyLogo({ company, size = 40 }) {
  const initials = (company?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    <div className="grid place-items-center rounded-xl font-display font-bold text-white shrink-0" style={{ width: size, height: size, background: company?.color || '#0f172a', fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export function ScoreRing({ score = 0, max = 100, size = 120, label = 'Verified', sub }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / max));
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d99a0b' : '#e11d48';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display font-extrabold tabular leading-none" style={{ fontSize: size * 0.28 }}>
            {score}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-1">{label}</div>
          {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'bg-brand', className }) {
  return (
    <div className={cx('h-2 rounded-full bg-slate-100 overflow-hidden', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function SkillBars({ skills }) {
  const all = ['Correctness', 'Debugging', 'Design', 'Testing', 'Communication'];
  return (
    <div className="grid gap-2.5">
      {all.map((name) => {
        const v = skills?.[name];
        return (
          <div key={name} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm">
            <span className="text-slate-600">{name}</span>
            {v == null ? <span className="text-xs text-slate-400">Not proven yet</span> : <Bar value={v} color={v >= 80 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500'} />}
            <span className="text-right font-semibold tabular">{v ?? '–'}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone = 'slate' }) {
  const tones = { slate: 'text-slate-500', indigo: 'text-indigo-600', green: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600' };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {Icon && <Icon className={cx('size-4', tones[tone])} />}
      </div>
      <div className="mt-1 font-display text-3xl font-extrabold tabular">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </Card>
  );
}

export function BadgeIcon({ badge, earned = true, size = 44 }) {
  const Icon = BADGE_ICONS[badge.icon] || Star;
  return (
    <div className="flex flex-col items-center gap-1 w-20 text-center" title={badge.desc}>
      <div
        className={cx('grid place-items-center rounded-2xl', earned ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-md' : 'bg-slate-100 text-slate-300')}
        style={{ width: size, height: size }}
      >
        <Icon className="size-5" />
      </div>
      <span className={cx('text-[11px] leading-tight font-semibold', earned ? 'text-slate-700' : 'text-slate-400')}>{badge.name}</span>
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="grid place-items-center py-24 text-slate-500 gap-2">
      <LoaderCircle className="size-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="grid place-items-center text-center py-12 px-6 gap-2">
      <div className="grid place-items-center size-12 rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-6" />
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-slate-500 max-w-sm">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border-0 ring-1 ring-slate-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:ring-2 focus:ring-brand focus:outline-none';
