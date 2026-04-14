// Client helper — hits /api/prices (server does brapi + Yahoo + USD/BRL cambio).

export interface PriceHit {
  price: number;
  dayChangePct: number;
  sector?: string;
  industry?: string;
}

export interface PriceResponse {
  prices: Record<string, PriceHit>;
  usdBrl: number; // 0 if not fetched / not available
}

export async function fetchPrices(
  brTickers: string[],
  intTickers: string[],
): Promise<PriceResponse> {
  if (brTickers.length === 0 && intTickers.length === 0) {
    return { prices: {}, usdBrl: 0 };
  }

  const params = new URLSearchParams();
  if (brTickers.length > 0) params.set('br', brTickers.join(','));
  if (intTickers.length > 0) params.set('int', intTickers.join(','));

  try {
    const res = await fetch(`/api/prices?${params.toString()}`);
    if (!res.ok) return { prices: {}, usdBrl: 0 };
    const body = (await res.json()) as Record<string, unknown>;
    const cambio = body.__cambio as { USD_BRL?: number } | undefined;
    const usdBrl = cambio?.USD_BRL ?? 0;
    const prices: Record<string, PriceHit> = {};
    for (const key in body) {
      if (key === '__cambio') continue;
      prices[key] = body[key] as PriceHit;
    }
    return { prices, usdBrl };
  } catch {
    return { prices: {}, usdBrl: 0 };
  }
}
