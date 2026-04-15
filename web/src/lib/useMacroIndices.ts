'use client';

// Hook: indicadores macro (CDI, Selic meta, IPCA 12m) do BCB.
// Cache 12h client-side; server revalidate 24h.

import { useQuery } from '@tanstack/react-query';

export interface MacroIndices {
  cdi: number;          // % a.a.
  selic_meta: number;   // % a.a.
  ipca_12m: number;     // % acumulado 12 meses
  cdi_data: string | null;
  selic_data: string | null;
  ipca_data: string | null;
  fetched_at: string;
  source: string;
}

const FALLBACK: MacroIndices = {
  cdi: 14.65,
  selic_meta: 14.75,
  ipca_12m: 4.14,
  cdi_data: null,
  selic_data: null,
  ipca_data: null,
  fetched_at: '',
  source: 'fallback',
};

export function useMacroIndices() {
  return useQuery<MacroIndices>({
    queryKey: ['macro-indices'],
    queryFn: async function () {
      var res = await fetch('/api/macro-indices');
      if (!res.ok) return FALLBACK;
      return (await res.json()) as MacroIndices;
    },
    staleTime: 12 * 60 * 60 * 1000, // 12h
    placeholderData: FALLBACK,
  });
}
