'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/toast';

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(json.error || 'Something went wrong', 'error');
    throw new Error(json.error || 'Request failed');
  }
  return json;
}

// Loads the whole demo state. Pass pollMs to keep it fresh (e.g. while the review runs).
export function useAppState(pollMs = 0) {
  const [state, setState] = useState(null);
  const timer = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      setState(await res.json());
    } catch {}
  }, []);
  useEffect(() => {
    refresh();
    if (pollMs) timer.current = setInterval(refresh, pollMs);
    return () => clearInterval(timer.current);
  }, [refresh, pollMs]);
  return { state, refresh };
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function formatDuration(sec = 0) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
