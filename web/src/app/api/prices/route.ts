// Server-side price proxy: brapi.dev (BR) + Yahoo Finance (INT)
// Keeps brapi token off the client bundle.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

interface PriceHit {
  price: number;
  dayChangePct: number;
  sector?: string;
  industry?: string;
}

const BRAPI_BATCH_SIZE = 15;

async function fetchBRBatch(tickers: string[]): Promise<Record<string, PriceHit>> {
  const list = tickers.join(',');
  const url = `https://brapi.dev/api/quote/${list}?modules=summaryProfile&token=${BRAPI_TOKEN}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    const json = await res.json();
    const out: Record<string, PriceHit> = {};
    for (const r of json.results || []) {
      if (!r || !r.symbol) continue;
      const price = Number(r.regularMarketPrice);
      if (!Number.isFinite(price) || price <= 0) continue;
      const sector = r.summaryProfile?.sector || r.sector || undefined;
      const industry = r.summaryProfile?.industry || r.industry || undefined;
      out[String(r.symbol).toUpperCase()] = {
        price,
        dayChangePct: Number(r.regularMarketChangePercent) || 0,
        sector: typeof sector === 'string' ? sector : undefined,
        industry: typeof industry === 'string' ? industry : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchBR(tickers: string[]): Promise<Record<string, PriceHit>> {
  if (tickers.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += BRAPI_BATCH_SIZE) {
    chunks.push(tickers.slice(i, i + BRAPI_BATCH_SIZE));
  }
  const results = await Promise.all(chunks.map(fetchBRBatch));
  const merged: Record<string, PriceHit> = {};
  for (const r of results) Object.assign(merged, r);
  return merged;
}

// Yahoo v8 chart API — funciona sem auth (v7/quote exige crumb).
async function fetchINTOne(ticker: string): Promise<PriceHit | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const prev = Number(meta.chartPreviousClose || meta.previousClose || 0);
    const pct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, dayChangePct: pct };
  } catch {
    return null;
  }
}

async function fetchINT(tickers: string[]): Promise<Record<string, PriceHit>> {
  if (tickers.length === 0) return {};
  const hits = await Promise.all(tickers.map(fetchINTOne));
  const out: Record<string, PriceHit> = {};
  for (let i = 0; i < tickers.length; i++) {
    if (hits[i]) out[tickers[i]] = hits[i]!;
  }
  return out;
}

async function fetchUsdBrl(): Promise<number> {
  try {
    const res = await fetch(`https://brapi.dev/api/v2/currency?currency=USD-BRL&token=${BRAPI_TOKEN}`, { cache: 'no-store' });
    if (!res.ok) return 0;
    const json = await res.json();
    const arr = json?.currency || [];
    if (arr.length === 0) return 0;
    const rate = Number(arr[0]?.bidPrice);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brParam = url.searchParams.get('br') || '';
  const intParam = url.searchParams.get('int') || '';
  const cryptoParam = url.searchParams.get('crypto') || '';

  const brTickers = brParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const intTickers = intParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  // Cripto reusa endpoint Yahoo (formato BTC-USD)
  const cryptoTickers = cryptoParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  const needCambio = intTickers.length > 0 || cryptoTickers.length > 0;
  const [br, intl, crypto, usdBrl] = await Promise.all([
    fetchBR(brTickers),
    fetchINT(intTickers),
    fetchINT(cryptoTickers),
    needCambio ? fetchUsdBrl() : Promise.resolve(0),
  ]);

  const body: Record<string, unknown> = { ...br, ...intl, ...crypto };
  if (usdBrl > 0) body.__cambio = { USD_BRL: usdBrl };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
