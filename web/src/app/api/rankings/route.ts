// Rankings API — le dados pre-calculados da tabela rankings_cache (Supabase)
// A Edge Function update-rankings roda 1x/dia e grava os dados.
// Esta rota so faz SELECT + sort por metrica — resposta instantanea.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export var runtime = 'nodejs';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
var supabase = createClient(supabaseUrl, supabaseAnonKey);

// ═══════ Types ═══════

interface RankedAsset {
  ticker: string;
  nome: string;
  tipo: string;
  preco: number | null;
  variacao_dia: number | null;
  metrics: Record<string, number | null>;
  dy_flag?: string | null;
}

// ═══════ Sort ═══════

var METRIC_SORT_DIR: Record<string, 'asc' | 'desc'> = {
  dy: 'desc', pl: 'asc', pvp: 'asc', roe: 'desc', roa: 'desc',
  margem_liquida: 'desc', margem_ebitda: 'desc', div_liq_ebitda: 'asc',
  ev_ebitda: 'asc', taxa: 'desc', patrimonio: 'desc',
  rentabilidade_12m: 'desc', taxa_admin: 'asc',
};

function sortByMetric(assets: RankedAsset[], metric: string): RankedAsset[] {
  var dir = METRIC_SORT_DIR[metric] || 'desc';

  var ranked: RankedAsset[] = [];
  var flagged: RankedAsset[] = [];
  var noData: RankedAsset[] = [];

  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    var v = a.metrics[metric];
    if (v == null) {
      noData.push(a);
    } else if (metric === 'pl' && v <= 0) {
      noData.push(a);
    } else if (metric === 'dy' && a.dy_flag === 'extraordinary') {
      flagged.push(a);
    } else {
      ranked.push(a);
    }
  }

  function cmp(a: RankedAsset, b: RankedAsset) {
    var va = a.metrics[metric] || 0;
    var vb = b.metrics[metric] || 0;
    return dir === 'desc' ? (vb - va) : (va - vb);
  }

  ranked.sort(cmp);
  flagged.sort(cmp);

  return ranked.concat(flagged).concat(noData);
}

// ═══════ Handler ═══════

export async function GET(req: NextRequest) {
  var tipo = req.nextUrl.searchParams.get('type') || 'acoes';
  var metric = req.nextUrl.searchParams.get('metric') || 'dy';

  var { data, error } = await supabase
    .from('rankings_cache')
    .select('assets, updated_at')
    .eq('type', tipo)
    .single();

  if (error || !data) {
    return NextResponse.json({ assets: [], metric: metric, type: tipo, updated_at: null, error: 'no_data' });
  }

  var assets: RankedAsset[] = [];
  try {
    assets = typeof data.assets === 'string' ? JSON.parse(data.assets) : data.assets;
  } catch {
    assets = [];
  }

  var sorted = sortByMetric(assets, metric);

  return NextResponse.json({
    assets: sorted,
    metric: metric,
    type: tipo,
    updated_at: data.updated_at,
  });
}
