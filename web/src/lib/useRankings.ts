'use client';

import { useQuery } from '@tanstack/react-query';

export type RankingType = 'acoes' | 'fiis' | 'stocks' | 'reits' | 'fundos' | 'tesouro';

export interface RankedAsset {
  ticker: string;
  nome: string;
  tipo: string;
  preco: number | null;
  variacao_dia: number | null;
  metrics: Record<string, number | null>;
  dy_flag?: 'extraordinary' | 'warning' | null;
}

export interface RankingsResponse {
  assets: RankedAsset[];
  metric: string;
  type: string;
}

// Metricas disponiveis por tipo de ativo
export var METRICS_BY_TYPE: Record<RankingType, Array<{ key: string; label: string; suffix: string }>> = {
  acoes: [
    { key: 'dy', label: 'Dividend Yield', suffix: '%' },
    { key: 'pl', label: 'P/L', suffix: 'x' },
    { key: 'pvp', label: 'P/VP', suffix: 'x' },
    { key: 'roe', label: 'ROE', suffix: '%' },
    { key: 'margem_liquida', label: 'Margem Liq.', suffix: '%' },
    { key: 'div_liq_ebitda', label: 'Div.Liq/EBITDA', suffix: 'x' },
    { key: 'ev_ebitda', label: 'EV/EBITDA', suffix: 'x' },
  ],
  fiis: [
    { key: 'dy', label: 'Dividend Yield', suffix: '%' },
    { key: 'pvp', label: 'P/VP', suffix: 'x' },
  ],
  stocks: [
    { key: 'dy', label: 'Dividend Yield', suffix: '%' },
    { key: 'pl', label: 'P/E', suffix: 'x' },
    { key: 'roe', label: 'ROE', suffix: '%' },
    { key: 'margem_liquida', label: 'Profit Margin', suffix: '%' },
  ],
  reits: [
    { key: 'dy', label: 'Dividend Yield', suffix: '%' },
    { key: 'pl', label: 'P/E', suffix: 'x' },
    { key: 'margem_liquida', label: 'Profit Margin', suffix: '%' },
  ],
  fundos: [
    { key: 'patrimonio', label: 'Patrimonio', suffix: '' },
    { key: 'taxa_admin', label: 'Taxa Admin', suffix: '%' },
    { key: 'rentabilidade_12m', label: 'Rent. 12m', suffix: '%' },
  ],
  tesouro: [
    { key: 'taxa', label: 'Taxa', suffix: '%' },
  ],
};

export function useRankings(type: RankingType, metric: string) {
  return useQuery({
    queryKey: ['rankings', type, metric],
    queryFn: async function () {
      var res = await fetch('/api/rankings?type=' + type + '&metric=' + metric);
      if (!res.ok) throw new Error('Rankings fetch failed');
      return (await res.json()) as RankingsResponse;
    },
    staleTime: 6 * 60 * 60 * 1000, // 6h
    gcTime: 6 * 60 * 60 * 1000,
  });
}
