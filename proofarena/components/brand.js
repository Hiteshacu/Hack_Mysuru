import Link from 'next/link';

export function Logo({ dark = false, className = '' }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={dark ? '#fff' : '#0f172a'} />
        <path d="M8 24V14c0-4.4 3.6-8 8-8s8 3.6 8 8v10" fill="none" stroke="#d99a0b" strokeWidth="3" strokeLinecap="round" />
        <path d="M12.5 19.5l2.5 2.5 5-5.5" fill="none" stroke={dark ? '#0f172a' : '#fff'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`font-display text-lg font-extrabold ${dark ? 'text-white' : 'text-ink'}`}>
        Proof<span className="text-gold">Arena</span>
      </span>
    </Link>
  );
}
