'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

// Clears the company, Hitesh's submissions, custom challenges and missions. Sample candidates stay.
export function ResetButton({ className = '' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!window.confirm('Reset the demo? This clears your company, challenges, openings and Hitesh\'s progress.')) return;
    setBusy(true);
    try {
      await api('POST', '/api/reset');
      toast('Demo reset. Start by creating the company.');
      router.push('/company');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={reset} disabled={busy} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 ${className}`}>
      <RotateCcw className={`size-4 ${busy ? 'animate-spin' : ''}`} /> Reset demo
    </button>
  );
}
