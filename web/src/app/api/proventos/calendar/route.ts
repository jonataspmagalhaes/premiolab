// /api/proventos/calendar — calendario hibrido de proventos anunciados
//
// Fonte primaria: tabela proventos_agenda (cache compartilhado, alimentado
// pela edge function proventos-calendar-fetch).
// Se o cache estiver vazio ou desatualizado (>6h), dispara refresh em
// background chamando a edge function com service_role.
//
// Query params:
//   tickers=AAAA3,BBBB4    (obrigatorio, max 100)
//   horizonte=60           (opcional, dias futuros a considerar; default 60)
//
// Resposta:
//   { items: ProventoEstimado[]; from_cache: boolean; refreshed: boolean }

import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
// Cache edge: 1h fresco, 24h stale-while-revalidate
export const revalidate = 3600;

const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6h
const MAX_TICKERS = 100;

interface ProventoEstimado {
  ticker: string;
  data_com: string | null;
  data_pagamento: string;
  valor_por_cota: number;
  tipo: string;
  fonte: 'dm' | 'statusinvest' | 'cache';
}

async function triggerEdgeRefresh(tickers: string[], horizonte: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zephynezarjsxzselozi.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return; // sem service role nao da pra disparar
  try {
    await fetch(`${url}/functions/v1/proventos-calendar-fetch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tickers, horizonte_dias: horizonte }),
      // Nao espera — ideia e kickoff. Mesmo com await aqui, a edge function retorna
      // so apos processar. Evitamos bloquear o response pra cliente: fire-and-forget
      // pode ser feito com Promise + catch, mas Next runtime limita top-level async.
    }).catch(function () { /* swallow */ });
  } catch { /* ignore */ }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get('tickers') || '';
  const horizonte = Math.max(7, Math.min(180, parseInt(url.searchParams.get('horizonte') || '60', 10) || 60));

  const tickers = tickersParam
    .split(',')
    .map(function (t) { return t.trim().toUpperCase(); })
    .filter(function (t) { return t.length > 0; })
    .slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ items: [], from_cache: false, refreshed: false });
  }

  const supabase = await getSupabaseServer();
  const nowIso = new Date().toISOString().slice(0, 10);
  const cutoffIso = new Date(Date.now() + horizonte * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('proventos_agenda')
    .select('ticker, tipo, data_com, data_pagamento, valor_por_cota, fonte, updated_at')
    .in('ticker', tickers)
    .gte('data_pagamento', nowIso)
    .lte('data_pagamento', cutoffIso)
    .order('data_pagamento', { ascending: true });

  if (error) {
    return NextResponse.json({ items: [], from_cache: false, refreshed: false, error: error.message }, { status: 500 });
  }

  const items: ProventoEstimado[] = (data || []).map(function (r) {
    return {
      ticker: r.ticker,
      tipo: r.tipo,
      data_com: r.data_com,
      data_pagamento: r.data_pagamento,
      valor_por_cota: Number(r.valor_por_cota) || 0,
      fonte: (r.fonte || 'cache') as ProventoEstimado['fonte'],
    };
  });

  // Decide se precisa refresh: cache vazio pros tickers OU updated_at mais antigo que 6h
  let needsRefresh = false;
  if (items.length === 0) {
    needsRefresh = true;
  } else {
    const oldest = (data || []).reduce(function (acc, r) {
      const t = new Date(r.updated_at).getTime();
      return t < acc ? t : acc;
    }, Date.now());
    if (Date.now() - oldest > REFRESH_THRESHOLD_MS) needsRefresh = true;
  }

  if (needsRefresh) {
    // Fire and forget (nao aguarda, retorna do cache ja)
    triggerEdgeRefresh(tickers, horizonte);
  }

  return NextResponse.json({
    items: items,
    from_cache: items.length > 0,
    refreshed: needsRefresh,
  });
}
