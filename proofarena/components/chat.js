'use client';

import { cx } from '@/components/ui';
import { timeAgo } from '@/lib/client';

// Message bubbles for an HR Connect thread. `me` is "student" or "company".
export function ChatBubbles({ con, me }) {
  return (
    <div className="grid gap-2">
      {con.thread.map((m, i) => {
        const mine = m.from === me;
        return (
          <div key={i} className={cx('flex fade-up', mine ? 'justify-end' : 'justify-start')} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={cx('max-w-[80%] rounded-2xl px-4 py-2 text-sm', mine ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-slate-100 text-ink rounded-bl-sm')}>
              {m.text}
              <div className={cx('text-[10px] mt-1', mine ? 'text-violet-200' : 'text-slate-400')}>{timeAgo(m.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
