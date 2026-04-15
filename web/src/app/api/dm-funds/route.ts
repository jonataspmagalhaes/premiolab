// Catalogo de fundos via DadosDeMercado /v1/funds.
// Cache em memoria 24h. Filtra server-side por nome/CNPJ.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 86400;

interface DmFund {
  cnpj: string;
  cvm_code: number | null;
  fund_class: string | null;
  name: string;
  trade_name: string | null;
  net_worth: number | null;
  shareholders: number | null;
  management_fee: number | null;
  performance_fee: number | null;
  type: string | null;
  begin_date: string | null;
  slug: string;
}

export interface FundoHit {
  cnpj: string;
  nome: string;
  classe: string | null;
  taxa_admin: number | null;
  taxa_perf: number | null;
  patrimonio: number | null;
  cotistas: number | null;
  type: string | null;
  slug: string;
}

function normalize(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function digits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

let cache: { data: FundoHit[]; ts: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

async function loadAll(): Promise<FundoHit[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  const token = process.env.DM_API_KEY;
  if (!token) return cache?.data || [];

  try {
    const res = await fetch('https://api.dadosdemercado.com.br/v1/funds', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!res.ok) return cache?.data || [];
    const list = (await res.json()) as DmFund[];
    const out: FundoHit[] = [];
    for (const f of list) {
      if (!f.cnpj || !f.name) continue;
      out.push({
        cnpj: f.cnpj,
        nome: f.trade_name || f.name,
        classe: f.fund_class,
        taxa_admin: f.management_fee,
        taxa_perf: f.performance_fee,
        patrimonio: f.net_worth,
        cotistas: f.shareholders,
        type: f.type,
        slug: f.slug,
      });
    }
    cache = { data: out, ts: Date.now() };
    return out;
  } catch {
    return cache?.data || [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '15', 10);
  const all = await loadAll();
  if (!q) return NextResponse.json({ hits: all.slice(0, limit) });

  const qDigits = digits(q);
  const qn = normalize(q);
  const scored: Array<{ f: FundoHit; score: number }> = [];

  for (const f of all) {
    const fn = normalize(f.nome);
    const cn = digits(f.cnpj);
    let score = -1;

    // Match por CNPJ se query tem digitos
    if (qDigits.length >= 4 && cn.indexOf(qDigits) >= 0) {
      score = 95;
    } else if (qn) {
      if (fn === qn) score = 100;
      else if (fn.startsWith(qn)) score = 80;
      else if (fn.indexOf(qn) >= 0) score = 50;
    }

    if (score >= 0) scored.push({ f, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate: maior patrimonio primeiro
    return (b.f.patrimonio || 0) - (a.f.patrimonio || 0);
  });
  return NextResponse.json({ hits: scored.slice(0, limit).map((x) => x.f) });
}
