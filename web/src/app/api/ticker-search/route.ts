// Busca ticker online: brapi (BR) + Yahoo search (INT).
// /api/ticker-search?q=PETR&mercado=BR|INT

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

export interface TickerHit {
  symbol: string;
  name: string;
  tipo?: string; // 'stock', 'fii', 'etf', 'stock_int'
  mercado: 'BR' | 'INT';
}

async function searchBR(q: string): Promise<TickerHit[]> {
  if (!q) return [];
  const url = `https://brapi.dev/api/available?search=${encodeURIComponent(q.toUpperCase())}&token=${BRAPI_TOKEN}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    const stocks: string[] = Array.isArray(json.stocks) ? json.stocks : [];
    // brapi /available só retorna símbolos; pegamos detalhes do primeiro batch
    const top = stocks.slice(0, 10);
    if (top.length === 0) return [];
    const detailUrl = `https://brapi.dev/api/quote/${top.join(',')}?token=${BRAPI_TOKEN}`;
    const dRes = await fetch(detailUrl, { cache: 'no-store' });
    if (!dRes.ok) {
      return top.map((s) => ({ symbol: s, name: s, mercado: 'BR' as const }));
    }
    const dJson = await dRes.json();
    const out: TickerHit[] = [];
    // ETFs BR mais negociados (precedem heuristica do sufixo 11)
    const ETFS_BR = new Set([
      'BOVA11', 'BOVV11', 'SMAL11', 'IVVB11', 'HASH11', 'XFIX11', 'ISUS11',
      'DIVO11', 'PIBB11', 'ECOO11', 'BBSD11', 'XBOV11', 'ETHE11', 'BITH11',
      'FIND11', 'FIXA11', 'GOVE11', 'MATB11', 'SPXI11', 'XINA11', 'NASD11',
      'ACWI11', 'DISB11', 'WRLD11', 'ESGD11', 'ESGE11', 'EURP11', 'BDRX11',
      'QBTC11', 'QETH11', 'DEFI11', 'META11',
    ]);
    // BDRs B3 terminam em 32, 33, 34, 35 ou 39 (padrao CVM)
    const BDR_SUFFIXES = ['32', '33', '34', '35', '39'];
    function isBDR(sym: string): boolean {
      if (sym.length < 5) return false;
      const last2 = sym.slice(-2);
      return BDR_SUFFIXES.indexOf(last2) >= 0;
    }
    for (const r of dJson.results || []) {
      if (!r || !r.symbol) continue;
      const sym: string = r.symbol;
      const longName = String(r.longName || r.shortName || '').toLowerCase();
      let tipo: string | undefined;
      if (ETFS_BR.has(sym) || longName.includes(' etf') || longName.includes('index fund') || longName.includes('fundo de indice') || longName.includes('fundo de índice')) {
        tipo = 'etf';
      } else if (isBDR(sym)) {
        tipo = 'bdr';
      } else if (sym.endsWith('11')) {
        tipo = 'fii';
      } else if (/\d$/.test(sym)) {
        tipo = 'stock';
      }
      out.push({
        symbol: sym,
        name: r.longName || r.shortName || sym,
        tipo,
        mercado: 'BR',
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ADRs de empresas brasileiras em bolsa US (NYSE/NASDAQ)
const ADRS_BR = new Set([
  'PBR', 'PBR-A', 'VALE', 'ITUB', 'ABEV', 'BBD', 'BBDO', 'BSBR', 'NU',
  'STNE', 'PAGS', 'XP', 'CSAN', 'ERJ', 'SID', 'GGB', 'BRFS', 'SBS',
  'CIG', 'CIG-C', 'ELP', 'UGP', 'CPL', 'TIMB', 'AZUL', 'GOL',
  'TLK', 'VIVB3', 'MELI', // MELI argentino mas lista como ADR
]);

async function searchINT(q: string): Promise<TickerHit[]> {
  if (!q) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: any[] = Array.isArray(json.quotes) ? json.quotes : [];
    const out: TickerHit[] = [];
    for (const item of quotes) {
      if (!item || !item.symbol) continue;
      const sym: string = item.symbol;
      const quoteType: string = item.quoteType || '';
      // Só equity / ETF
      if (quoteType !== 'EQUITY' && quoteType !== 'ETF') continue;
      const longName = String(item.longname || item.shortname || '').toLowerCase();
      let tipo = 'stock_int';
      if (quoteType === 'ETF') {
        tipo = 'etf';
      } else if (ADRS_BR.has(sym)) {
        tipo = 'adr';
      } else if (longName.includes('reit') || longName.includes('realty') || longName.includes('real estate trust')) {
        tipo = 'reit';
      }
      out.push({
        symbol: sym,
        name: item.longname || item.shortname || sym,
        tipo,
        mercado: 'INT',
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function searchCRYPTO(q: string): Promise<TickerHit[]> {
  if (!q) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const quotes: any[] = Array.isArray(json.quotes) ? json.quotes : [];
    const out: TickerHit[] = [];
    for (const item of quotes) {
      if (!item || !item.symbol) continue;
      if (item.quoteType !== 'CRYPTOCURRENCY') continue;
      // Yahoo retorna "BTC-USD"; armazenamos asim.
      out.push({
        symbol: item.symbol,
        name: item.longname || item.shortname || item.symbol,
        tipo: 'cripto',
        mercado: 'CRIPTO' as any,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const mercado = (req.nextUrl.searchParams.get('mercado') || 'BR').toUpperCase();
  if (q.length < 1) return NextResponse.json({ hits: [] });

  let hits: TickerHit[];
  if (mercado === 'CRIPTO') hits = await searchCRYPTO(q);
  else if (mercado === 'INT') hits = await searchINT(q);
  else hits = await searchBR(q);
  return NextResponse.json({ hits });
}
