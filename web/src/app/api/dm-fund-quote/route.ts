// Cota atual de um fundo via DadosDeMercado /v1/funds/{slug}/history.
// Input: ?slug=abc OU ?cnpj=123 (se cnpj, busca no catalogo pra achar slug).
// Retorno: { cota: number, data: string } ou { cota: null }.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface HistoryPoint {
  date: string;        // YYYY-MM-DD
  quota_value: number; // valor da cota
}

const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const cache = new Map<string, { data: { cota: number | null; data: string | null }; ts: number }>();

async function resolveSlugFromCnpj(cnpj: string, token: string): Promise<string | null> {
  try {
    var digits = (cnpj || '').replace(/\D/g, '');
    if (!digits) return null;
    var res = await fetch('https://api.dadosdemercado.com.br/v1/funds?search=' + digits, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    var list: any[] = await res.json();
    for (var i = 0; i < list.length; i++) {
      var cn = String(list[i].cnpj || '').replace(/\D/g, '');
      if (cn === digits) return list[i].slug || null;
    }
    return list[0]?.slug || null;
  } catch {
    return null;
  }
}

async function fetchLatestQuote(slug: string, token: string): Promise<{ cota: number | null; data: string | null }> {
  try {
    var res = await fetch('https://api.dadosdemercado.com.br/v1/funds/' + encodeURIComponent(slug) + '/history', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!res.ok) return { cota: null, data: null };
    var list: HistoryPoint[] = await res.json();
    if (!Array.isArray(list) || list.length === 0) return { cota: null, data: null };
    // Pega o mais recente
    var latest = list[0];
    for (var i = 1; i < list.length; i++) {
      if (list[i].date > latest.date) latest = list[i];
    }
    return { cota: Number(latest.quota_value) || null, data: latest.date || null };
  } catch {
    return { cota: null, data: null };
  }
}

export async function GET(req: NextRequest) {
  var slug = (req.nextUrl.searchParams.get('slug') || '').trim();
  var cnpj = (req.nextUrl.searchParams.get('cnpj') || '').trim();
  if (!slug && !cnpj) {
    return NextResponse.json({ error: 'slug or cnpj required' }, { status: 400 });
  }

  var token = process.env.DM_API_KEY;
  if (!token) return NextResponse.json({ cota: null, data: null });

  var cacheKey = slug ? 's:' + slug : 'c:' + cnpj;
  var hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  }

  var resolvedSlug = slug;
  if (!resolvedSlug) {
    var s = await resolveSlugFromCnpj(cnpj, token);
    if (!s) {
      var neg = { cota: null, data: null };
      cache.set(cacheKey, { data: neg, ts: Date.now() });
      return NextResponse.json(neg);
    }
    resolvedSlug = s;
  }

  var quote = await fetchLatestQuote(resolvedSlug, token);
  cache.set(cacheKey, { data: quote, ts: Date.now() });
  return NextResponse.json(quote, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
