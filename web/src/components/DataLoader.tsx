'use client';

import { useEffect, useState } from 'react';
import { useLoadAllData, useUser } from '@/lib/queries';
import { useAppStore, loadSelectedPortfolio } from '@/store';

export function DataLoader({ children }: { children: React.ReactNode }) {
  var _user = useUser();
  var user = _user.data;
  var userLoading = _user.isLoading;

  // Hydrate portfolio selection from localStorage BEFORE loading data
  // to avoid fetching with selectedPortfolio=null (Todos) then re-fetching
  var setSelectedPortfolio = useAppStore(function (s) { return s.setSelectedPortfolio; });
  var _hyd = useState(false);
  var hydrated = _hyd[0];
  var setHydrated = _hyd[1];
  useEffect(function () {
    var stored = loadSelectedPortfolio();
    if (stored !== null) setSelectedPortfolio(stored);
    setHydrated(true);
  }, [setSelectedPortfolio]);

  // Only start fetching data AFTER portfolio is hydrated
  var _data = useLoadAllData(hydrated ? (user ? user.id : undefined) : undefined);
  var dataLoading = _data.isLoading;

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
