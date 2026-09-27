'use client';

import { useState } from 'react';
import { Bell, Gamepad2 } from 'lucide-react';
import { CompanyLogo, cx } from '@/components/ui';
import { api, timeAgo } from '@/lib/client';

// In-app notifications for a student (quest invites from companies).
export function NotifyBell({ state, studentId, refresh }) {
  const [open, setOpen] = useState(false);
  const mine = state.notifications.filter((n) => n.channels.includes('inapp') && n.deliveries.some((d) => d.studentId === studentId));
  const unread = mine.filter((n) => !n.readBy.includes(studentId)).length;

  async function toggle() {
    setOpen(!open);
    if (!open && unread) {
      await api('POST', '/api/notifications', { studentId });
      refresh();
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative grid place-items-center size-9 rounded-xl hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}>
        <Bell className={cx('size-5', unread ? 'text-violet-700' : 'text-slate-500')} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid place-items-center size-4 rounded-full bg-rose-500 text-[10px] font-bold text-white animate-bounce">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 p-2 z-50 pop-in">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Notifications</div>
          {mine.length === 0 && <div className="px-3 py-6 text-sm text-slate-500 text-center">Nothing yet</div>}
          {mine.map((n) => {
            const co = state.companies.find((c) => c.id === n.companyId);
            return (
              <a key={n.id} href={`/quest/index.html?quest=${n.questId}&student=${studentId}`} className="flex gap-3 rounded-xl p-3 hover:bg-violet-50">
                <CompanyLogo company={co} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold leading-snug">{n.title}</div>
                  <div className="text-xs text-violet-700 font-semibold inline-flex items-center gap-1 mt-1"><Gamepad2 className="size-3.5" /> Enter the 3D world</div>
                  <div className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
