'use client';

import { createContext, useContext } from 'react';
import { useAppState } from '@/lib/client';

const Ctx = createContext({ state: null, refresh: () => {} });

export function AppStateProvider({ pollMs = 3000, children }) {
  const value = useAppState(pollMs);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShared() {
  return useContext(Ctx);
}
