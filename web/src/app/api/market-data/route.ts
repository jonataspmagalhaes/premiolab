// Market Data API — le dados macro pre-calculados da tabela rankings_cache
// Tipos: indices, focus, curva_juros, moedas, noticias

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export var runtime = 'nodejs';

var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
var supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET(req: NextRequest) {
  var tipo = req.nextUrl.searchParams.get('type') || 'indices';

  var { data, error } = await supabase
    .from('rankings_cache')
    .select('assets, updated_at')
    .eq('type', tipo)
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, type: tipo, updated_at: null });
  }

  var parsed = null;
  try {
    parsed = typeof data.assets === 'string' ? JSON.parse(data.assets) : data.assets;
  } catch {
    parsed = null;
  }

  return NextResponse.json({
    data: parsed,
    type: tipo,
    updated_at: data.updated_at,
  });
}
