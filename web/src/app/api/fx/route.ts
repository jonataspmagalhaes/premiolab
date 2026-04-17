// Server-side FX quote: puxa taxa USD-BRL ou EUR-BRL de uma data especifica
// via Yahoo v8/chart. Usado no cadastro de operacao cripto em moeda estrangeira.
//
// Uso: GET /api/fx?from=USD&to=BRL&date=2026-04-17
// Retorna: { rate: 5.1234 } ou { rate: null, error: '...' }

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function fetchHistoricalRate(pair: string, dateStr: string): Promise<number | null> {
  try {
    // Yahoo usa timestamps em segundos UTC. Buscamos janela de 7 dias atras
    // ate data+1 pra cobrir fim de semana/feriado (retorna o ultimo close valido).
    const target = new Date(dateStr + 'T12:00:00Z');
    if (isNaN(target.getTime())) return null;
    const endTs = Math.floor(target.getTime() / 1000) + 86400;
    const startTs = endTs - 7 * 86400;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair)}?period1=${startTs}&period2=${endTs}&interval=1d`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    if (timestamps.length === 0 || closes.length === 0) {
      // Fallback: usa meta.regularMarketPrice (hoje)
      const now = Number(result.meta?.regularMarketPrice);
      return Number.isFinite(now) && now > 0 ? now : null;
    }

    // Pega o ultimo close valido <= target timestamp
    const targetTs = Math.floor(target.getTime() / 1000);
    let best: number | null = null;
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] > targetTs) break;
      const c = closes[i];
      if (Number.isFinite(c) && (c as number) > 0) best = c as number;
    }
    if (best !== null) return best;

    // Fallback: primeiro close valido posterior
    for (let i = 0; i < closes.length; i++) {
      const c = closes[i];
      if (Number.isFinite(c) && (c as number) > 0) return c as number;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = (url.searchParams.get('from') || '').toUpperCase();
  const to = (url.searchParams.get('to') || 'BRL').toUpperCase();
  const date = url.searchParams.get('date') || new Date().toISOString().substring(0, 10);

  if (!from || from === to) {
    return NextResponse.json({ rate: 1 });
  }

  const pair = `${from}${to}=X`;
  const rate = await fetchHistoricalRate(pair, date);

  if (rate === null) {
    return NextResponse.json(
      { rate: null, error: `Nao foi possivel obter cotacao ${from}->${to} em ${date}` },
      { status: 200, headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  }

  return NextResponse.json(
    { rate, pair, date },
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  );
}
