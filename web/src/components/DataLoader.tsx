'use client';

import { useEffect } from 'react';
import { useLoadAllData, useUser } from '@/lib/queries';
import { useAppStore, loadSelectedPortfolio } from '@/store';

export function DataLoader({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading: userLoading } = useUser();
  const { isLoading: dataLoading } = useLoadAllData(user?.id);

  // Hydrate portfolio selection from localStorage after mount
  const setSelectedPortfolio = useAppStore((s) => s.setSelectedPortfolio);
  useEffect(() => {
    const stored = loadSelectedPortfolio();
    if (stored !== null) setSelectedPortfolio(stored);
  }, [setSelectedPortfolio]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-accent font-bold">P</span>
          </div>
          <p className="text-muted text-sm font-mono">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // middleware redireciona pra login
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted text-sm font-mono animate-pulse">Carregando dados...</p>
      </div>
    );
  }

  return <>{children}</>;
}
