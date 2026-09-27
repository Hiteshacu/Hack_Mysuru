'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

let push = () => {};

export function toast(message, kind = 'success') {
  push({ id: Math.random(), message, kind });
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4200);
    };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pop-in flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 max-w-sm ${
            t.kind === 'error' ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-white text-ink ring-slate-200'
          }`}
        >
          {t.kind === 'error' ? <AlertTriangle className="size-4 mt-0.5 text-rose-600" /> : <CheckCircle2 className="size-4 mt-0.5 text-emerald-600" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
