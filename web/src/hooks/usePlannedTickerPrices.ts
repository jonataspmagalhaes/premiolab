'use client';

// Busca precos de tickers planejados (com meta mas sem posicao).
// Cache 60s via React Query. So dispara fetch quando tem ticker novo.

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchPrices } from '@/lib/priceService';
import { useAppStore } from '@/store';
import type { PlannedTicker } from '@/lib/rebalance';
import { INT_TIPOS } from '@/lib/sectorOverrides';

// Categorias persistidas separado em localStorage (nao salva no banco — UX state)
// Sem persistencia: a inferencia abaixo eh boa o suficiente pro MVP.
function inferCategoria(ticker: string): { categoria: string; mercado: 'BR' | 'INT' } {
  const t = ticker.toUpperCase();
  // INT: ticker conhecido em INT_TIPOS ou sem digitos no fim
  if (INT_TIPOS[t]) {
    const tipo = INT_TIPOS[t];
    if (tipo === 'ETF') return { categoria: 'etf', mercado: 'INT' };
    if (tipo === 'REIT') return { categoria: 'reit', mercado: 'INT' };
    if (tipo === 'ADR') return { categoria: 'adr', mercado: 'INT' };
    if (tipo === 'Cripto') return { categoria: 'cripto', mercado: 'INT' };
    return { categoria: 'stock_int', mercado: 'INT' };
  }
  // BR: termina em 11 = FII (default — pode ser ETF tb), 3/4/5/6 = acao
  if (/11$/.test(t)) return { categoria: 'fii', mercado: 'BR' };
  if (/[3-8]$/.test(t)) return { categoria: 'acao', mercado: 'BR' };
  // Fallback: trata como stock_int (sem digitos)
  return { categoria: 'stock_int', mercado: 'INT' };
}

export function usePlannedTickerPrices(tickerTargets: { _flat?: Record<string, number> } | null | undefined): {
  planned: PlannedTicker[];
  isFetching: boolean;
} {
  const positions = useAppStore((s) => s.positions);

  // Identifica tickers em _flat sem posicao real
  const plannedSymbols = useMemo(() => {
    const flat = tickerTargets?._flat || {};
    const realSet = new Set(
      positions.filter((p) => (p.quantidade || 0) > 0).map((p) => (p.ticker || '').toUpperCase()),
    );
    const out: Array<{ ticker: string; categoria: string; mercado: 'BR' | 'INT' }> = [];
    for (const t of Object.keys(flat)) {
      const T = t.toUpperCase();
      if (realSet.has(T)) continue;
      const inf = inferCategoria(T);
      out.push({ ticker: T, ...inf });
    }
    return out;
  }, [tickerTargets, positions]);

  const queryKey = ['plannedTickerPrices', plannedSymbols.map((p) => p.ticker).sort().join(',')];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PlannedTicker[]> => {
      if (plannedSymbols.length === 0) return [];
      const br = plannedSymbols.filter((p) => p.mercado === 'BR' && p.categoria !== 'cripto').map((p) => p.ticker);
      const intl = plannedSymbols.filter((p) => p.mercado === 'INT' && p.categoria !== 'cripto').map((p) => p.ticker);
      const crypto = plannedSymbols.filter((p) => p.categoria === 'cripto').map((p) => p.ticker);
      const { prices } = await fetchPrices(br, intl, crypto);
      const out: PlannedTicker[] = [];
      for (const p of plannedSymbols) {
        const hit = prices[p.ticker];
        if (hit && hit.price > 0) {
          out.push({ ticker: p.ticker, categoria: p.categoria, preco: hit.price });
        }
      }
      return out;
    },
    enabled: plannedSymbols.length > 0,
    staleTime: 60 * 1000,
  });

  return {
    planned: query.data || [],
    isFetching: query.isFetching,
  };
}
