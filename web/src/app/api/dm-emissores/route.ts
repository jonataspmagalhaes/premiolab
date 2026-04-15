// Emissores de RF (empresas listadas B3) via DadosDeMercado /v1/companies.
// Cache 24h server-side. Filtragem por query no servidor pra nao mandar 2MB pro cliente.
//
// Combina:
// - DM: empresas listadas (cobertura ampla CRI/CRA/debenture)
// - Bancos do catalogo estatico (cobertura melhor pra emissores nao listados)

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 86400; // 24h

interface DmCompany {
  name: string | null;
  trade_name: string | null;
  b3_trade_name: string | null;
  b3_issuer_code: string | null;
  b3_sector: string | null;
  cnpj: string | null;
  is_b3_listed: boolean;
  is_foreign: boolean;
}

export interface EmissorHit {
  nome: string;
  setor: string | null;
  cnpj: string | null;
  ticker: string | null;
  fonte: 'dm' | 'static';
}

function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

let cache: { data: EmissorHit[]; ts: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

async function loadAll(): Promise<EmissorHit[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  const token = process.env.DM_API_KEY;
  if (!token) return cache?.data || [];

  try {
    const res = await fetch('https://api.dadosdemercado.com.br/v1/companies', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (!res.ok) return cache?.data || [];
    const list = (await res.json()) as DmCompany[];
    const out: EmissorHit[] = [];
    for (const c of list) {
      const nome = c.b3_trade_name || c.trade_name || c.name;
      if (!nome) continue;
      // Sem prioridade pra empresas estrangeiras "Não Classificados"
      if (c.is_foreign && (!c.b3_sector || c.b3_sector.includes('Não Classificad'))) continue;
      out.push({
        nome: nome.trim(),
        setor: c.b3_sector || null,
        cnpj: c.cnpj || null,
        ticker: c.b3_issuer_code || null,
        fonte: 'dm',
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
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '12', 10);
  const all = await loadAll();
  if (!q) return NextResponse.json({ hits: all.slice(0, limit) });

  const qn = normalize(q);
  const scored: Array<{ e: EmissorHit; score: number }> = [];
  for (const e of all) {
    const n = normalize(e.nome);
    let score = -1;
    if (n === qn) score = 100;
    else if (n.startsWith(qn)) score = 80;
    else if (n.indexOf(qn) >= 0) score = 50;
    if (score >= 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return NextResponse.json({ hits: scored.slice(0, limit).map((x) => x.e) });
}
