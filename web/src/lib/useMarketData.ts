'use client';

import { useQuery } from '@tanstack/react-query';

export type MarketDataType = 'indices' | 'bolsas' | 'commodities' | 'focus' | 'curva_juros' | 'moedas' | 'noticias';

export function useMarketData(type: MarketDataType) {
  return useQuery({
    queryKey: ['market-data', type],
    queryFn: async function () {
      var res = await fetch('/api/market-data?type=' + type);
      if (!res.ok) return null;
      var json = await res.json();
      return json.data;
    },
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 6 * 60 * 60 * 1000,
  });
}
