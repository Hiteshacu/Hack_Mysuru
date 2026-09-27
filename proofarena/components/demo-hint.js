import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';

// Shown on the student side when the next move belongs to the company.
// In the demo one person plays both roles, so this jumps straight to the right company screen.
export function CompanyTurn({ href, title, body, dark = false }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-4 text-sm ${
        dark ? 'border-white/25 text-violet-100' : 'border-indigo-200 bg-indigo-50/60 text-indigo-900'
      }`}
    >
      <Building2 className="size-5 shrink-0" />
      <div className="flex-1 min-w-52">
        <b>{title}</b> {body}
      </div>
      <Link
        href={href}
        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-semibold whitespace-nowrap ${
          dark ? 'bg-white text-ink hover:bg-slate-100' : 'bg-brand text-white hover:bg-indigo-800'
        }`}
      >
        Switch to company <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
